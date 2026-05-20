import JSZip from 'jszip'

// Pulls the body paragraphs (<w:p> blocks) out of a .docx. We don't use a
// full Word parser because we only need plaintext per paragraph; the export
// side already takes the same approach via jszip.
export async function extractDocxParagraphs(buf: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buf)
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('document.xml not found in .docx')
  const xml = await docFile.async('string')

  const paragraphs: string[] = []
  const re = /<w:p[\s\S]*?<\/w:p>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const text = m[0].replace(/<[^>]+>/g, '')
    const trimmed = text.replace(/\s+/g, ' ').trim()
    if (trimmed) paragraphs.push(trimmed)
  }
  return paragraphs
}
