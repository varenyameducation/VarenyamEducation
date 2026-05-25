'use client'

import * as React from 'react'
import { Plus, X } from 'lucide-react'
import {
  MOCK_COURSES,
  MOCK_CHAPTERS,
  MOCK_TOPICS,
} from '@/lib/ui/mocks/taxonomy'
import { EXAM_TYPES, type ExamTypeValue, type SubjectValue } from '@/lib/validation/question'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { formatTagLabel, type TaxonomyTag } from '@/lib/ui/mocks/m2m'
import { cn } from '@/lib/utils'

export interface TaxonomyTagPickerProps {
  value: TaxonomyTag[]
  onChange: (next: TaxonomyTag[]) => void
  // Optional surface-level error rendered under the chip row (e.g. "at
  // least one tag required").
  error?: string | null
  // Optional id used to associate the picker with a Label.
  id?: string
}

// Controlled multi-tag picker for question taxonomy. Parent holds the
// `taxonomies: TaxonomyTag[]` form-state slice; this component renders
// the chip row + an inline add-form. Course + exam type are required
// per tag, chapter + topic are optional.
export function TaxonomyTagPicker({ value, onChange, error, id }: TaxonomyTagPickerProps) {
  const [adding, setAdding] = React.useState(false)

  const remove = (idx: number) => {
    const next = value.slice()
    next.splice(idx, 1)
    onChange(next)
  }

  const add = (tag: TaxonomyTag) => {
    // Dedupe on (course, chapter, topic, exam_type).
    const key = (t: TaxonomyTag) =>
      `${t.course_id}|${t.chapter_id ?? ''}|${t.topic_id ?? ''}|${t.exam_type}`
    const existing = new Set(value.map(key))
    if (existing.has(key(tag))) {
      setAdding(false)
      return
    }
    onChange([...value, tag])
    setAdding(false)
  }

  return (
    <div className="space-y-2" id={id}>
      <div
        role="list"
        aria-label="Attached taxonomy tags"
        className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 min-h-[44px]"
      >
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground px-1">
            No tags yet. Add at least one to categorise this question.
          </span>
        )}
        {value.map((tag, idx) => (
          <TagChip key={idx} tag={tag} onRemove={() => remove(idx)} />
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {adding ? 'Cancel' : 'Add tag'}
        </Button>
      </div>

      {adding && <InlineAddForm onConfirm={add} onCancel={() => setAdding(false)} />}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function TagChip({ tag, onRemove }: { tag: TaxonomyTag; onRemove: () => void }) {
  return (
    <span
      role="listitem"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border bg-primary/5 px-2 py-0.5 text-xs',
        'border-primary/30 text-foreground',
      )}
    >
      <span className="truncate max-w-[28ch]" title={formatTagLabel(tag)}>
        {formatTagLabel(tag)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Remove tag ${formatTagLabel(tag)}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

function InlineAddForm({
  onConfirm,
  onCancel,
}: {
  onConfirm: (tag: TaxonomyTag) => void
  onCancel: () => void
}) {
  const [courseId, setCourseId] = React.useState('')
  const [chapterId, setChapterId] = React.useState('')
  const [topicId, setTopicId] = React.useState('')
  const [examType, setExamType] = React.useState<ExamTypeValue>('jee')

  const chapters = React.useMemo(
    () => MOCK_CHAPTERS.filter((c) => c.course_id === courseId),
    [courseId],
  )
  const topics = React.useMemo(
    () => MOCK_TOPICS.filter((t) => t.chapter_id === chapterId),
    [chapterId],
  )

  const canConfirm = Boolean(courseId && examType)

  const confirm = () => {
    if (!canConfirm) return
    const course = MOCK_COURSES.find((c) => c.id === courseId)
    if (!course) return
    const chapter = chapterId ? MOCK_CHAPTERS.find((c) => c.id === chapterId) ?? null : null
    const topic = topicId ? MOCK_TOPICS.find((t) => t.id === topicId) ?? null : null
    // Subject defaults from chapter when present, otherwise from the
    // course's stream — but stream → subject isn't 1:1 (PCM has three),
    // so we fall back to Physics as a sensible default and let edit flow
    // refine it later.
    const subject: SubjectValue = (chapter?.subject as SubjectValue | undefined) ?? 'Physics'
    onConfirm({
      course_id: course.id,
      course_name: course.name,
      chapter_id: chapter?.id ?? null,
      chapter_name: chapter?.name ?? null,
      topic_id: topic?.id ?? null,
      topic_name: topic?.name ?? null,
      subject,
      exam_type: examType,
    })
  }

  return (
    <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1">
        <Label className="text-xs">
          Course <span className="text-destructive">*</span>
        </Label>
        <Select
          value={courseId}
          onChange={(e) => {
            setCourseId(e.target.value)
            setChapterId('')
            setTopicId('')
          }}
        >
          <option value="">Select course…</option>
          {MOCK_COURSES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Chapter (optional)</Label>
        <Select
          value={chapterId}
          onChange={(e) => {
            setChapterId(e.target.value)
            setTopicId('')
          }}
          disabled={!courseId}
        >
          <option value="">{courseId ? 'Any chapter' : 'Pick course first'}</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.chapter_no ? `${c.chapter_no}. ${c.name}` : c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Topic (optional)</Label>
        <Select
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          disabled={!chapterId}
        >
          <option value="">{chapterId ? 'Any topic' : 'Pick chapter first'}</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.topic_no ? `${t.topic_no}. ${t.name}` : t.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">
          Exam type <span className="text-destructive">*</span>
        </Label>
        <Select value={examType} onChange={(e) => setExamType(e.target.value as ExamTypeValue)}>
          {EXAM_TYPES.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-center justify-end gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={confirm} disabled={!canConfirm}>
          Add to question
        </Button>
      </div>
    </div>
  )
}
