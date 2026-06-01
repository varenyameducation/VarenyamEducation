// Client-side helper for turning a Supabase Storage path (e.g.
// "draft/abc-123.png" returned by /api/questions/upload-image) into a
// renderable URL.
//
// The question-images bucket is configured as public (verified via the
// `/storage/v1/object/public/` URL the bulk-import route constructs), so
// we can build the URL directly without minting a signed URL per render.
//
// Accepts either a bare path OR a full URL — if the input already starts
// with `http`, it's returned as-is. This lets callers be agnostic about
// whether a value is a stored path or a pre-resolved URL.

const PUBLIC_STORAGE_PREFIX = '/storage/v1/object/public/question-images/'

export function resolveStorageUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return ''
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return pathOrUrl
  return `${base.replace(/\/$/, '')}${PUBLIC_STORAGE_PREFIX}${pathOrUrl.replace(/^\/+/, '')}`
}
