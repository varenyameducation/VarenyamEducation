'use client'

import * as React from 'react'
import { Upload, X, AlertCircle, FileImage, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { resolveStorageUrl } from '@/lib/ui/storage-url'

const MAX_BYTES = 5 * 1024 * 1024 // 5MB
// Gemini Vision (Extract LaTeX) only accepts png/jpeg/webp — no GIF.
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']

export interface SolutionImageUploaderProps {
  value: string[]
  onChange: (next: string[]) => void
  onLatexExtracted: (latex: string) => void
  questionId?: string
  label?: string
  maxImages?: number
}

type Busy = { status: 'idle' } | { status: 'uploading' } | { status: 'extracting' }

export function SolutionImageUploader({
  value,
  onChange,
  onLatexExtracted,
  questionId,
  label = 'Images',
  maxImages = 5,
}: SolutionImageUploaderProps) {
  const [pending, setPending] = React.useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<Busy>({ status: 'idle' })
  const [message, setMessage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Free the object URL when the preview changes or the component unmounts.
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const pickFile = (file: File) => {
    setError(null)
    setMessage(null)
    if (!ACCEPTED.includes(file.type)) {
      setError(`${file.name}: only PNG, JPEG or WEBP (no GIF) — required for LaTeX extraction.`)
      return
    }
    if (file.size > MAX_BYTES) {
      setError(`${file.name}: exceeds 5MB.`)
      return
    }
    if (value.length >= maxImages) {
      setError(`Max ${maxImages} images.`)
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPending(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const clearPending = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPending(null)
    setPreviewUrl(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const uploadFile = async (file: File): Promise<string | null> => {
    const formData = new FormData()
    formData.append('file', file)
    if (questionId) formData.append('questionId', questionId)
    const res = await fetch('/api/questions/upload-image', { method: 'POST', body: formData })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) {
      setError(`Upload failed: ${json?.error?.message ?? res.statusText}`)
      return null
    }
    return json.data.path as string
  }

  const keepAsImage = async () => {
    if (!pending) return
    setBusy({ status: 'uploading' })
    setError(null)
    setMessage(null)
    const path = await uploadFile(pending)
    setBusy({ status: 'idle' })
    if (path) {
      onChange([...value, path])
      clearPending()
    }
  }

  const extractLatex = async () => {
    if (!pending) return
    setBusy({ status: 'extracting' })
    setError(null)
    setMessage(null)
    const formData = new FormData()
    formData.append('file', pending)
    const res = await fetch('/api/questions/extract-latex-from-image', {
      method: 'POST',
      body: formData,
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) {
      setError(`Extract failed: ${json?.error?.message ?? res.statusText}`)
      setBusy({ status: 'idle' })
      return
    }
    const latex: string = (json.data?.latex ?? '').trim()
    if (!latex) {
      // No math detected (plain diagram): keep the image instead of discarding work.
      const path = await uploadFile(pending)
      setBusy({ status: 'idle' })
      if (path) {
        onChange([...value, path])
        clearPending()
        setMessage('No math detected — image kept.')
      }
      return
    }
    onLatexExtracted(latex)
    setBusy({ status: 'idle' })
    clearPending()
  }

  const remove = (path: string) => onChange(value.filter((p) => p !== path))

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>
          {label} (optional, max {maxImages} × 5MB)
        </Label>
        <span className="text-xs text-muted-foreground">
          {value.length}/{maxImages}
        </span>
      </div>

      {pending && previewUrl ? (
        <div className="rounded-md border bg-card p-3">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="preview"
              className="h-24 w-24 rounded border object-contain"
            />
            <div className="flex-1 space-y-2">
              <p className="truncate text-xs text-muted-foreground" title={pending.name}>
                {pending.name}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={keepAsImage}
                  disabled={busy.status !== 'idle'}
                >
                  {busy.status === 'uploading' ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileImage className="mr-1 h-3.5 w-3.5" />
                  )}
                  Keep as image
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={extractLatex}
                  disabled={busy.status !== 'idle'}
                >
                  {busy.status === 'extracting' ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                  )}
                  Extract LaTeX
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearPending}
                  disabled={busy.status !== 'idle'}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border bg-muted/20 p-4 text-center text-sm transition-colors hover:border-primary"
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span>Add image — keep it, or extract its math as LaTeX</span>
          <span className="text-xs text-muted-foreground">PNG, JPG or WEBP — up to 5MB. No GIF.</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ACCEPTED.join(',')}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) pickFile(f)
          e.target.value = ''
        }}
      />

      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}

      {value.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-3">
          {value.map((path) => (
            <li key={path} className="relative overflow-hidden rounded-md border bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveStorageUrl(path)}
                alt={path.split('/').pop() ?? 'image'}
                className="h-24 w-full object-contain"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Remove image"
                className="absolute right-1 top-1 h-6 w-6 bg-background/80"
                onClick={() => remove(path)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
