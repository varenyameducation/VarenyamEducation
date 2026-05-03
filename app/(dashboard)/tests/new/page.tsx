'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { TestSetupModal } from '@/components/tests/test-setup-modal'
import { apiPost } from '@/lib/ui/api'
import type { TestSetupValues } from '@/lib/validation/test'

interface CreatedTest {
  id: string
}

export default function NewTestPage() {
  const router = useRouter()
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (values: TestSetupValues) =>
      apiPost<CreatedTest>('/api/tests', {
        title: values.title,
        course_id: values.course_id,
        subjects: values.subjects,
        exam_type: values.exam_type,
        duration_minutes: values.duration_minutes,
        instructions: values.instructions,
        status: 'draft',
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        // Backend not ready — drop to a local draft id so the builder remains
        // walkable in the meantime. Flagged in commit message.
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New test</h1>
        <p className="text-sm text-muted-foreground">
          Step 1 of 6 — capture metadata; the next steps add questions, reorder, preview and export.
        </p>
      </header>
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {errorMessage}
        </div>
      )}
      <TestSetupModal
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values)
        }}
        busy={createMutation.isPending}
      />
    </div>
  )
}
