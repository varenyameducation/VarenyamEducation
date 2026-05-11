import JSZip from 'jszip'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])

export type ExtractResult = {
  images: Map<string, Buffer>
  skipped: { name: string; reason: string }[]
}

function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx >= 0 ? path.slice(idx + 1) : path
}

function isImage(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}

export async function extractImagesZip(buffer: Buffer | ArrayBuffer): Promise<Map<string, Buffer>> {
  const result = await extractImagesZipDetailed(buffer)
  return result.images
}

export async function extractImagesZipDetailed(buffer: Buffer | ArrayBuffer): Promise<ExtractResult> {
  const zip = await JSZip.loadAsync(buffer)
  const images = new Map<string, Buffer>()
  const skipped: { name: string; reason: string }[] = []

  const entries = Object.values(zip.files)
  for (const entry of entries) {
    if (entry.dir) continue
    const name = basename(entry.name).toLowerCase()
    if (!name || name.startsWith('.')) continue
    if (!isImage(name)) {
      skipped.push({ name: entry.name, reason: 'unsupported file extension' })
      continue
    }
    const bytes = await entry.async('nodebuffer')
    if (bytes.length > MAX_IMAGE_BYTES) {
      skipped.push({ name: entry.name, reason: `exceeds ${MAX_IMAGE_BYTES} byte cap (got ${bytes.length})` })
      continue
    }
    images.set(name, bytes)
  }

  return { images, skipped }
}

export { MAX_IMAGE_BYTES }
