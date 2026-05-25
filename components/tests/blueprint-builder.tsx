'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  DIFFICULTIES,
  EXAM_TYPES,
  QUESTION_TYPES,
  type DifficultyValue,
  type ExamTypeValue,
  type SubjectValue,
} from '@/lib/validation/question'
import type { QuestionType as BlueprintQuestionType } from '@/types/taxonomy'
import { SUBJECTS } from '@/lib/ui/mocks/taxonomy'
import { apiGet } from '@/lib/ui/api'
import {
  mockInventoryCounts,
  type InventoryCounts,
  type GenerateTestPayload,
  type BlueprintSection,
} from '@/lib/ui/mocks/m2m'
import { cn } from '@/lib/utils'

type CourseOption = { id: string; name: string }
type ChapterOption = { id: string; name: string; course_id: string; subject: string }
type TopicOption = { id: string; name: string; chapter_id: string }

export interface BlueprintBuilderProps {
  busy?: boolean
  onSubmit: (payload: GenerateTestPayload) => Promise<void> | void
}

// Section state mirrors `BlueprintSection` (canonical types/taxonomy) but
// keeps mutation-friendly defaults: `''` for "any question type" and a
// full Record (not Partial) for the difficulty inputs.
type SectionDraft = {
  id: string
  label: string
  chapter_ids: string[]
  topic_ids: string[]
  question_type: BlueprintQuestionType | ''
  difficulty: Record<DifficultyValue, number>
}

// Restrict the picker to the four canonical blueprint-compatible types.
// `matrix_match` is intentionally not blueprint-buildable (sampling logic
// is undefined for matrix questions).
const BLUEPRINT_QUESTION_TYPES = QUESTION_TYPES.filter(
  (qt): qt is { value: BlueprintQuestionType; label: string } =>
    qt.value !== 'matrix_match',
)

const EMPTY_DIFFICULTY: Record<DifficultyValue, number> = {
  easy: 0,
  medium: 0,
  hard: 0,
  advanced: 0,
}

function newSection(index: number): SectionDraft {
  return {
    id: `s-${Date.now()}-${index}`,
    label: `Section ${String.fromCharCode(65 + index)}`,
    chapter_ids: [],
    topic_ids: [],
    question_type: '',
    difficulty: { ...EMPTY_DIFFICULTY },
  }
}

export function BlueprintBuilder({ busy, onSubmit }: BlueprintBuilderProps) {
  const [title, setTitle] = React.useState('')
  const [courseId, setCourseId] = React.useState('')
  const [subject, setSubject] = React.useState<SubjectValue>('Physics')
  const [examType, setExamType] = React.useState<ExamTypeValue>('jee')
  const [duration, setDuration] = React.useState(180)
  const [instructions, setInstructions] = React.useState('')
  const [sections, setSections] = React.useState<SectionDraft[]>(() => [newSection(0)])
  const [error, setError] = React.useState<string | null>(null)

  const coursesQuery = useQuery({
    queryKey: ['taxonomy', 'courses'],
    queryFn: () => apiGet<{ items: CourseOption[] }>('/api/taxonomy/courses'),
  })
  const courses = coursesQuery.data?.ok ? coursesQuery.data.data.items : []

  const chaptersQuery = useQuery({
    queryKey: ['taxonomy', 'chapters', courseId],
    queryFn: () =>
      apiGet<{ items: ChapterOption[] }>(`/api/taxonomy/chapters?course_id=${courseId}`),
    enabled: Boolean(courseId),
  })
  const chapters = chaptersQuery.data?.ok ? chaptersQuery.data.data.items : []

  // All topics across selected chapters — flatten by fetching per chapter. For
  // small chapter counts this is cheap; for larger counts BE will be doing
  // the heavy lifting anyway.
  const updateSection = (id: string, patch: Partial<SectionDraft>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }
  const removeSection = (id: string) => {
    setSections((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)))
  }

  const validate = (): string | null => {
    if (!title.trim()) return 'Title is required.'
    if (!courseId) return 'Pick a course.'
    if (sections.length === 0) return 'Add at least one section.'
    for (const s of sections) {
      if (!s.label.trim()) return 'Each section needs a label.'
      const total =
        s.difficulty.easy + s.difficulty.medium + s.difficulty.hard + s.difficulty.advanced
      if (total <= 0) return `${s.label}: pick at least one question across difficulty buckets.`
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setError(null)
    const payload: GenerateTestPayload = {
      title: title.trim(),
      course_id: courseId,
      subject,
      exam_type: examType,
      duration_minutes: duration,
      instructions: instructions.trim() || undefined,
      sections: sections.map<BlueprintSection>((s) => ({
        label: s.label,
        chapter_ids: s.chapter_ids.length ? s.chapter_ids : undefined,
        topic_ids: s.topic_ids.length ? s.topic_ids : undefined,
        question_type: s.question_type || undefined,
        blueprint: s.difficulty,
      })),
    }
    await onSubmit(payload)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-md border bg-card p-5"
      aria-label="Blueprint test creator"
      noValidate
    >
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Blueprint</h2>
        <p className="text-xs text-muted-foreground">
          Define section scope + difficulty mix. The bank is sampled to match the
          counts you set. Generated tests stay editable.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="bp-title">Title</Label>
          <Input
            id="bp-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. JEE Foundation — Mock #4"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bp-course">Course</Label>
          <Select id="bp-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">
              {coursesQuery.isLoading
                ? 'Loading courses…'
                : courses.length === 0
                  ? 'No courses'
                  : 'Select course…'}
            </option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bp-subject">Subject</Label>
          <Select
            id="bp-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value as SubjectValue)}
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bp-exam">Exam type</Label>
          <Select
            id="bp-exam"
            value={examType}
            onChange={(e) => setExamType(e.target.value as ExamTypeValue)}
          >
            {EXAM_TYPES.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bp-duration">Duration (minutes)</Label>
          <Input
            id="bp-duration"
            type="number"
            min={5}
            max={600}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="bp-instructions">Instructions (optional)</Label>
          <Textarea
            id="bp-instructions"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Shown above the question paper."
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Sections</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSections((prev) => [...prev, newSection(prev.length)])}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add section
          </Button>
        </div>
        <div className="space-y-3">
          {sections.map((section, idx) => (
            <SectionRow
              key={section.id}
              index={idx}
              section={section}
              courseId={courseId}
              subject={subject}
              examType={examType}
              chapters={chapters}
              onChange={(patch) => updateSection(section.id, patch)}
              onRemove={() => removeSection(section.id)}
              canRemove={sections.length > 1}
            />
          ))}
        </div>
      </section>

      {error && (
        <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <Button type="submit" disabled={busy}>
          {busy ? 'Generating…' : 'Generate test'}
        </Button>
      </div>
    </form>
  )
}

function SectionRow({
  index,
  section,
  courseId,
  subject,
  examType,
  chapters,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number
  section: SectionDraft
  courseId: string
  subject: SubjectValue
  examType: ExamTypeValue
  chapters: ChapterOption[]
  onChange: (patch: Partial<SectionDraft>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const chaptersForSubject = chapters.filter(
    (c) => c.subject === subject || section.chapter_ids.includes(c.id),
  )

  const counts = useInventoryCounts({
    course_id: courseId,
    exam_type: examType,
    subject,
    chapter_ids: section.chapter_ids,
    topic_ids: section.topic_ids,
    question_type: section.question_type || undefined,
  })

  const setDifficulty = (key: DifficultyValue, raw: string) => {
    const n = Math.max(0, Math.min(99, Number(raw) || 0))
    onChange({ difficulty: { ...section.difficulty, [key]: n } })
  }

  const toggleChapter = (id: string) => {
    const next = section.chapter_ids.includes(id)
      ? section.chapter_ids.filter((x) => x !== id)
      : [...section.chapter_ids, id]
    onChange({ chapter_ids: next, topic_ids: [] })
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Section ${index + 1} label`}
          value={section.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="max-w-[40ch]"
        />
        <Select
          value={section.question_type || ''}
          onChange={(e) =>
            onChange({ question_type: e.target.value as BlueprintQuestionType | '' })
          }
          className="max-w-[24ch]"
        >
          <option value="">Any question type</option>
          {BLUEPRINT_QUESTION_TYPES.map((qt) => (
            <option key={qt.value} value={qt.value}>
              {qt.label}
            </option>
          ))}
        </Select>
        {canRemove && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onRemove}
            className="ml-auto text-destructive hover:text-destructive"
            aria-label={`Remove ${section.label}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Chapters (optional)</Label>
          {!courseId ? (
            <p className="rounded-md border border-dashed bg-background px-2 py-1.5 text-xs text-muted-foreground">
              Pick a course above to choose chapters.
            </p>
          ) : chaptersForSubject.length === 0 ? (
            <p className="rounded-md border border-dashed bg-background px-2 py-1.5 text-xs text-muted-foreground">
              No chapters for {subject} in this course.
            </p>
          ) : (
            <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-md border bg-background p-2">
              {chaptersForSubject.map((c) => {
                const active = section.chapter_ids.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleChapter(c.id)}
                    className="focus-visible:outline-none"
                  >
                    <Badge
                      variant={active ? 'default' : 'outline'}
                      className={cn('cursor-pointer', !active && 'hover:bg-accent')}
                    >
                      {c.name}
                    </Badge>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Difficulty mix</Label>
          <div className="grid grid-cols-4 gap-2">
            {DIFFICULTIES.map((d) => {
              const requested = section.difficulty[d.value]
              const available = counts?.[d.value] ?? null
              const exceeds = available != null && requested > available
              return (
                <div key={d.value} className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {d.label}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={requested}
                    onChange={(e) => setDifficulty(d.value, e.target.value)}
                    className={cn('h-8 text-xs', exceeds && 'border-destructive ring-1 ring-destructive')}
                    aria-invalid={exceeds || undefined}
                  />
                  <p
                    className={cn(
                      'text-[10px] text-muted-foreground',
                      exceeds && 'font-medium text-destructive',
                    )}
                  >
                    {available == null
                      ? '…'
                      : exceeds
                        ? `Only ${available} ${d.value} available`
                        : `${available} ${d.value} available`}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

interface InventoryScope {
  course_id: string
  exam_type: ExamTypeValue
  subject: SubjectValue
  chapter_ids: string[]
  topic_ids: string[]
  question_type?: BlueprintQuestionType
}

// Debounced live inventory hint. Hits the real BE endpoint when the response
// returns a usable envelope; falls back to the deterministic mock counts
// during BE development so the UX is testable without the route mounted.
function useInventoryCounts(scope: InventoryScope): InventoryCounts | null {
  const [debouncedScope, setDebouncedScope] = React.useState<InventoryScope>(scope)
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedScope(scope), 300)
    return () => window.clearTimeout(t)
  }, [
    scope.course_id,
    scope.exam_type,
    scope.subject,
    scope.chapter_ids.join(','),
    scope.topic_ids.join(','),
    scope.question_type,
  ])

  const query = useQuery({
    queryKey: ['inventory-counts', debouncedScope],
    enabled: Boolean(debouncedScope.course_id),
    queryFn: async () => {
      const qs = new URLSearchParams()
      qs.set('course_id', debouncedScope.course_id)
      qs.set('exam_type', debouncedScope.exam_type)
      qs.set('subject', debouncedScope.subject)
      if (debouncedScope.question_type) qs.set('question_type', debouncedScope.question_type)
      if (debouncedScope.chapter_ids.length)
        qs.set('chapter_ids', debouncedScope.chapter_ids.join(','))
      if (debouncedScope.topic_ids.length)
        qs.set('topic_ids', debouncedScope.topic_ids.join(','))
      return apiGet<InventoryCounts>(`/api/questions/inventory-counts?${qs.toString()}`)
    },
    refetchOnWindowFocus: false,
  })

  if (!query.data) return null
  if (!query.data.ok) {
    // BE endpoint missing or errored — fall back to mock so sliders still
    // show plausible "N available" numbers during the m2m sprint.
    return mockInventoryCounts(debouncedScope)
  }
  return query.data.data
}
