import JSZip from 'jszip'

export type DocxImage = {
  filename: string // unique key inside this docx (e.g. "image3.png")
  contentType: string
  data: Buffer
}

export type DocxExtraction = {
  paragraphs: string[]
  images: DocxImage[]
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
}

function contentTypeFor(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return 'application/octet-stream'
  return (
    CONTENT_TYPE_BY_EXT[filename.slice(dot + 1).toLowerCase()] ?? 'application/octet-stream'
  )
}

// Build a rId → target filename map from word/_rels/document.xml.rels.
async function loadRelationships(zip: JSZip): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const relsFile = zip.file('word/_rels/document.xml.rels')
  if (!relsFile) return map
  const xml = await relsFile.async('string')
  const re = /<Relationship\s[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    map.set(m[1], m[2])
  }
  return map
}

// Convert a single <m:oMath>...</m:oMath> block to a readable plain-text math
// approximation. Handles inline text (<m:t>), fractions (<m:f>), super/sub
// scripts (<m:sup>/<m:sub>), and radicals (<m:rad>) at a basic level. For
// fully-typeset math (matrices, integrals, etc.) this falls back to the
// concatenated text — still better than dropping the whole equation.
function ommlToText(omml: string): string {
  let out = omml
  // Fractions: <m:f>...<m:num>X</m:num>...<m:den>Y</m:den>...</m:f>  →  (X)/(Y)
  out = out.replace(
    /<m:f>([\s\S]*?)<\/m:f>/g,
    (_, body) => {
      const num = /<m:num>([\s\S]*?)<\/m:num>/.exec(body)?.[1] ?? ''
      const den = /<m:den>([\s\S]*?)<\/m:den>/.exec(body)?.[1] ?? ''
      return `(${ommlToText(num)})/(${ommlToText(den)})`
    },
  )
  // Square roots: <m:rad>...<m:e>X</m:e>...</m:rad>  →  √(X)
  out = out.replace(
    /<m:rad>([\s\S]*?)<\/m:rad>/g,
    (_, body) => {
      const inner = /<m:e>([\s\S]*?)<\/m:e>/.exec(body)?.[1] ?? body
      return `√(${ommlToText(inner)})`
    },
  )
  // Superscripts: <m:sSup>...<m:e>X</m:e>...<m:sup>Y</m:sup>...</m:sSup>  →  X^(Y)
  out = out.replace(
    /<m:sSup>([\s\S]*?)<\/m:sSup>/g,
    (_, body) => {
      const base = /<m:e>([\s\S]*?)<\/m:e>/.exec(body)?.[1] ?? ''
      const sup = /<m:sup>([\s\S]*?)<\/m:sup>/.exec(body)?.[1] ?? ''
      return `${ommlToText(base)}^(${ommlToText(sup)})`
    },
  )
  // Subscripts
  out = out.replace(
    /<m:sSub>([\s\S]*?)<\/m:sSub>/g,
    (_, body) => {
      const base = /<m:e>([\s\S]*?)<\/m:e>/.exec(body)?.[1] ?? ''
      const sub = /<m:sub>([\s\S]*?)<\/m:sub>/.exec(body)?.[1] ?? ''
      return `${ommlToText(base)}_(${ommlToText(sub)})`
    },
  )
  // Strip remaining tags, return only text content
  return out.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

// Replace a single paragraph's child elements with plain text:
//  - <w:drawing> blocks → `[[IMG:<resolved filename>]]` placeholder
//  - <m:oMath> blocks → simplified math text via ommlToText
//  - All other elements → stripped (keep their text-node content)
function paragraphToText(
  paragraphXml: string,
  rIdToTarget: Map<string, string>,
): string {
  let out = paragraphXml

  // Math blocks first (so the m:t text inside doesn't get treated as a normal run).
  out = out.replace(/<m:oMath[\s\S]*?<\/m:oMath>/g, (block) => ` ${ommlToText(block)} `)

  // Drawings: pull the first blip ref → resolve to media path → emit placeholder.
  out = out.replace(/<w:drawing[\s\S]*?<\/w:drawing>/g, (block) => {
    const embedMatch = /<a:blip[^>]*r:embed="([^"]+)"/.exec(block)
    if (!embedMatch) return ' '
    const target = rIdToTarget.get(embedMatch[1])
    if (!target) return ' '
    // Target is like "media/image3.png" → strip directory prefix
    const filename = target.split('/').pop() ?? target
    return ` [[IMG:${filename}]] `
  })

  // Strip remaining tags & collapse whitespace.
  return out.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

export async function extractDocxParagraphs(buf: Buffer): Promise<string[]> {
  // Backwards-compatible thin wrapper.
  const full = await extractDocx(buf)
  return full.paragraphs
}

export async function extractDocx(buf: Buffer): Promise<DocxExtraction> {
  const zip = await JSZip.loadAsync(buf)
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('document.xml not found in .docx')
  const xml = await docFile.async('string')
  const rIdMap = await loadRelationships(zip)

  const paragraphs: string[] = []
  const re = /<w:p\b[\s\S]*?<\/w:p>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const text = paragraphToText(m[0], rIdMap)
    if (text) paragraphs.push(text)
  }

  // Pull image binaries that are referenced by any paragraph placeholder.
  const referenced = new Set<string>()
  for (const p of paragraphs) {
    const matches = p.match(/\[\[IMG:([^\]]+)\]\]/g)
    if (!matches) continue
    for (const tag of matches) {
      const fn = tag.replace(/^\[\[IMG:/, '').replace(/\]\]$/, '')
      referenced.add(fn)
    }
  }

  const images: DocxImage[] = []
  for (const filename of referenced) {
    const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
    // Skip Windows HD Photo (.wdp) — most browsers can't display it.
    if (ext === 'wdp') continue
    const f = zip.file(`word/media/${filename}`)
    if (!f) continue
    const data = await f.async('nodebuffer')
    images.push({ filename, contentType: contentTypeFor(filename), data })
  }

  return { paragraphs, images }
}
