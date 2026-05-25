'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, ListChecks, SlidersHorizontal } from 'lucide-react'
import { TestSetupModal } from '@/components/tests/test-setup-modal'
import { BlueprintBuilder } from '@/components/tests/blueprint-builder'
import { apiPost } from '@/lib/ui/api'
import type { TestSetupValues } from '@/lib/validation/test'
import type { GenerateTestPayload } from '@/lib/ui/mocks/m2m'
import { cn } from '@/lib/utils'

interface CreatedTest {
  id: string
}

type Mode = 'manual' | 'blueprint'

export default function NewTestPage() {
  const router = useRouter()
  const [mode, setMode] = React.useState<Mode>('manual')
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (values: TestSetupValues) =>
      apiPost<CreatedTest>('/api/tests', {
        title: values.title,
        course_id: values.course_id ? values.course_id : null,
        subject: values.subjects?.[0] ?? null,
        exam_type: values.exam_type,
        duration_minutes: values.duration_minutes,
        instructions: values.instructions || null,
        status: 'draft',
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        if (result.error.code === 'NETWORK_ERROR' || result.error.code === 'INVALID_RESPONSE') {
          router.push(`/tests/draft-local/edit`)
          return
        }
        setErrorMessage(result.error.message)
        return
      }
      router.push(`/tests/${result.data.id}/edit`)
    },
    onError: (err) =>
      setErrorMessage(err instanceof Error ? err.message : 'Create failed'),
  })

  const generateMutation = useMutation({
    mutationFn: (payload: GenerateTestPayload) =>
      apiPost<CreatedTest>('/api/tests/generate', payload),
    onSuccess: (result) => {
      if (!result.ok) {
        setErrorMessage(result.error.message)
        return
      }
      // Land on the edit screen so user can still reorder / tweak the
      // auto-picked set.
      router.push(`/tests/${result.data.id}/edit`)
    },
    onError: (err) =>
      setErrorMessage(err instanceof Error ? err.message : 'Generate failed'),
  })

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">New test</h1>
        <p className="text-sm text-muted-foreground">
          Pick the questions yourself, or describe the shape and let the bank fill it.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Test creator mode"
        className="inline-flex rounded-md border bg-card p-1 text-sm"
      >
        <ModeTab
          active={mode === 'manual'}
          onClick={() => setMode('manual')}
          icon={<ListChecks className="h-3.5 w-3.5" />}
          label="Manual pick"
          hint="Set up + pick questions one by one"
        />
        <ModeTab
          active={mode === 'blueprint'}
          onClick={() => setMode('blueprint')}
          icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          label="Blueprint"
          hint="Define section difficulty, auto-fill"
        />
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {errorMessage}
        </div>
      )}

      {mode === 'manual' ? (
        <TestSetupModal
          onSubmit={async (values) => {
            await createMutation.mutateAsync(values)
          }}
          busy={createMutation.isPending}
        />
      ) : (
        <BlueprintBuilder
          busy={generateMutation.isPending}
          onSubmit={async (payload) => {
            setErrorMessage(null)
            await generateMutation.mutateAsync(payload)
          }}
        />
      )}
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded px-3 py-1.5 text-left',
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent',
      )}
    >
      <span className="flex items-center gap-1.5 font-medium">
        {icon}
        {label}
      </span>
      <span className={cn('text-[10px]', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
        {hint}
      </span>
    </button>
  )
}
