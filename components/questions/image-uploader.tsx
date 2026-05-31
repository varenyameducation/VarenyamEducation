'use client'

import * as React from 'react'
import { Upload, X, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const MAX_FILES = 5
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export interface ImageUploaderProps {
  value: string[]
  onChange: (next: string[]) => void
  questionId?: string
}

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; name: string }
  | { status: 'error'; message: string }

export function ImageUploader({ value, onChange, questionId }: ImageUploaderProps) {
  const [state, setState] = React.useState<UploadState>({ status: 'idle' })
  const [dragOver, setDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFiles = React.useCallback(
    async (files: FileList | File[]) => {
      const incoming = Array.from(files)
      if (value.length + incoming.length > MAX_FILES) {
        setState({
          status: 'error',
          message: `Max ${MAX_FILES} images per question.`,
        })
        return
      }
      for (const f of incoming) {
        if (!ACCEPTED.includes(f.type)) {
          setState({
            status: 'error',
            message: `${f.name}: unsupported type (${f.type || 'unknown'}).`,
          })
          return
        }
        if (f.size > MAX_BYTES) {
          setState({
            status: 'error',
            message: `${f.name}: exceeds 5MB.`,
          })
          return
        }
      }

      const uploaded: string[] = []
      for (const file of incoming) {
        setState({ status: 'uploading', name: file.name })
        const formData = new FormData()
        formData.append('file', file)
        if (questionId) formData.append('questionId', questionId)
        const res = await fetch('/api/questions/upload-image', {
          method: 'POST',
          body: formData,
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.success) {
          setState({
            status: 'error',
            message: `Upload failed for ${file.name}: ${json?.error?.message ?? res.statusText}`,
          })
          return
        }
        uploaded.push(json.data.path)
      }
      onChange([...value, ...uploaded])
      setState({ status: 'idle' })
    },
    [value, onChange, questionId],
  )

  const remove = (path: string) => {
    onChange(value.filter((p) => p !== path))
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Images (optional, max {MAX_FILES} × 5MB)</Label>
        <span className="text-xs text-muted-foreground">
          {value.length}/{MAX_FILES} uploaded
        </span>
      </div>

      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/20',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
        }}
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm">
          Drag & drop images here, or{' '}
          <button
            type="button"
            className="font-medium text-primary underline underline-offset-2"
            onClick={() => inputRef.current?.click()}
          >
            browse files
          </button>
        </p>
        <p className="text-xs text-muted-foreground">PNG, JPG, WEBP or GIF — up to 5MB each.</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED.join(',')}
          multiple
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {state.status === 'uploading' && (
        <p className="text-xs text-muted-foreground">Uploading {state.name}…</p>
      )}
      {state.status === 'error' && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {state.message}
        </p>
      )}

      {value.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {value.map((path) => (
            <li
              key={path}
              className="flex items-center justify-between gap-2 rounded-md border bg-card p-2 text-xs"
            >
              <span className="truncate font-mono" title={path}>
                {path.split('/').pop()}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Remove image"
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
