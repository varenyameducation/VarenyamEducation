'use client'

import * as React from 'react'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiPost, type ApiError } from '@/lib/ui/api'

type OptionLetter = 'A' | 'B' | 'C' | 'D'

export interface ParsedQuestion {
  question_body: string
  question_type: 'mcq' | 'numerical' | 'subjective'
  options: string[]
  correct_option: OptionLetter[]
}

interface ParseImageResponse extends ParsedQuestion {
  usage?: { total_tokens?: number }
}

export interface ParseFromImageProps {
  onParsed: (data: ParsedQuestion) => void
  // True when consumer believes the form already has user-entered content
  // and the upload would clobber it. Triggers the confirm dialog before the
  // file picker opens.
  hasExistingContent?: boolean
  disabled?: boolean
}

const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const
const ACCEPT_ATTR = ACCEPTED_MIME.join(',')
const MAX_BYTES = 5 * 1024 * 1024

function humanError(error: ApiError): string {
  switch (error.code) {
    case 'GEMINI_NOT_CONFIGURED':
      return 'Image upload requires the GEMINI_API_KEY env var. Ask an admin to configure.'
    case 'RATE_LIMITED':
      return 'Rate limit hit (15 requests/min on free tier). Try again in a minute.'
    case 'GEMINI_FAILED':
      return "The OCR service didn't respond cleanly. Try again, or paste the question manually."
    case 'PARSE_FAILED':
      return "We couldn't parse the response. Try a clearer image, or paste the question manually."
    default:
      return error.message || 'Image upload failed.'
  }
}

export function ParseFromImage({
  onParsed,
  hasExistingContent = false,
  disabled = false,
}: ParseFromImageProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [status, setStatus] = React.useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const successTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current)
    }
  }, [])

  const openPicker = () => {
    if (disabled || status === 'uploading') return
    if (hasExistingContent) {
      setConfirmOpen(true)
      return
    }
    fileInputRef.current?.click()
  }

  const confirmAndOpen = () => {
    setConfirmOpen(false)
    fileInputRef.current?.click()
  }

  const validateFile = (file: File): string | null => {
    const declared = (file.type || '').toLowerCase()
    if (declared && !ACCEPTED_MIME.includes(declared as (typeof ACCEPTED_MIME)[number])) {
      return 'Only PNG, JPEG, or WebP images are accepted.'
    }
    if (file.size === 0) return 'The selected file is empty.'
    if (file.size > MAX_BYTES) {
      return `File exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`
    }
    return null
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input so the same file can be picked twice in a row.
    e.target.value = ''
    if (!file) return

    const clientError = validateFile(file)
    if (clientError) {
      setStatus('error')
      setStatusMessage(clientError)
      return
    }

    if (successTimer.current) {
      clearTimeout(successTimer.current)
      successTimer.current = null
    }

    setStatus('uploading')
    setStatusMessage(null)

    const form = new FormData()
    form.append('file', file)

    const startedAt = performance.now()
    const result = await apiPost<ParseImageResponse>('/api/questions/parse-image', form)
    const elapsed = Math.round(performance.now() - startedAt)

    if (!result.ok) {
      setStatus('error')
      setStatusMessage(humanError(result.error))
      return
    }

    const data = result.data
    onParsed({
      question_body: data.question_body,
      question_type: data.question_type,
      options: data.options ?? [],
      correct_option: (data.correct_option ?? []) as OptionLetter[],
    })

    const tokens = data.usage?.total_tokens
    setStatus('success')
    setStatusMessage(
      tokens != null
        ? `Parsed in ${elapsed} ms (~${tokens} tokens).`
        : `Parsed in ${elapsed} ms.`,
    )
    successTimer.current = setTimeout(() => {
      setStatus('idle')
      setStatusMessage(null)
    }, 3000)
  }

  const isBusy = status === 'uploading'

  return (
    <section
      className="space-y-2 rounded-md border border-dashed bg-muted/30 p-4"
      aria-label="Upload question image"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium">
          Paste / upload an image of a question to auto-fill the form.
        </p>
        <p className="text-xs text-muted-foreground">
          We&rsquo;ll OCR the math into LaTeX for you.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={onFileChange}
          disabled={disabled || isBusy}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={openPicker}
          disabled={disabled || isBusy}
        >
          {isBusy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Reading your image&hellip;
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" aria-hidden />
              Upload image (PNG/JPG/WebP, max 5 MB)
            </>
          )}
        </Button>

        {status === 'success' && statusMessage && (
          <span className="text-xs text-emerald-700" role="status">
            {statusMessage}
          </span>
        )}
        {status === 'error' && statusMessage && (
          <span className="text-xs text-destructive" role="alert">
            {statusMessage}
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: works best when the question + options are all in view. Math
        notation is converted to LaTeX automatically.
      </p>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Overwrite current question?</DialogTitle>
            <DialogDescription>
              This will overwrite your current question body and options with
              text extracted from the image. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={confirmAndOpen}>
              Overwrite and pick image
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
