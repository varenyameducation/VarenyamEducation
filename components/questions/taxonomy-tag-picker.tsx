'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { EXAM_TYPES, type ExamTypeValue } from '@/lib/validation/question'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { apiGet } from '@/lib/ui/api'
import type { Subject, TaxonomyTag } from '@/types/taxonomy'
import { cn } from '@/lib/utils'

type CourseRow = { id: string; name: string; grade?: number }
type ChapterRow = {
  id: string
  subject_id: string
  name: string
  chapter_no: number | null
}
type TopicRow = { id: string; chapter_id: string; name: string; topic_no: number | null }

// Shape of a value-tag with parent names attached. Used for chip rendering;
// derived from the live API responses (no mocks).
type NameMap = Map<string, string>

export interface TaxonomyTagPickerProps {
  value: TaxonomyTag[]
  onChange: (next: TaxonomyTag[]) => void
  // Optional surface-level error rendered under the chip row (e.g. "at
  // least one tag required").
  error?: string | null
  // Optional id used to associate the picker with a Label.
  id?: string
}

// Controlled multi-tag picker for the 4-tier taxonomy
// Course → Subject → Chapter → Topic. Parent holds the
// `taxonomies: TaxonomyTag[]` slice; this component fetches all four
// dropdowns from /api/taxonomy/* (no mock data). Chip labels render real
// names by accumulating a name cache from the courses+inline-add fetches
// and a one-shot bootstrap fetch over the initial value's parent chains.
export function TaxonomyTagPicker({ value, onChange, error, id }: TaxonomyTagPickerProps) {
  const [adding, setAdding] = React.useState(false)
  const [nameMap, setNameMap] = React.useState<NameMap>(() => new Map())

  // Stable callback for child fetchers to push name entries into the map.
  const learnNames = React.useCallback(
    (entries: ReadonlyArray<readonly [string, string]>) => {
      setNameMap((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const [k, v] of entries) {
          if (next.get(k) !== v) {
            next.set(k, v)
            changed = true
          }
        }
        return changed ? next : prev
      })
    },
    [],
  )

  // Always fetch courses up-front. The list is bounded per institute so
  // pagination doesn't matter.
  const coursesQuery = useQuery({
    queryKey: ['taxonomy', 'courses'],
    queryFn: () => apiGet<{ items: CourseRow[] }>('/api/taxonomy/courses'),
  })
  const courses = coursesQuery.data?.ok ? coursesQuery.data.data.items : []
  React.useEffect(() => {
    if (courses.length > 0) {
      learnNames(courses.map((c) => [c.id, c.name] as const))
    }
  }, [courses, learnNames])

  // Bootstrap names for tags supplied in the initial `value` — fire a
  // subjects/chapters/topics fetch per unique parent id we haven't seen,
  // then stuff names into the cache. Refs track in-flight fetches so a
  // value-list mutation doesn't refetch what we've already pulled.
  const fetchedSubjectParents = React.useRef<Set<string>>(new Set())
  const fetchedChapterParents = React.useRef<Set<string>>(new Set())
  const fetchedTopicParents = React.useRef<Set<string>>(new Set())

  React.useEffect(() => {
    const courseIds = new Set(value.map((v) => v.course_id))
    const subjectIds = new Set(
      value.map((v) => v.subject_id).filter((x): x is string => Boolean(x)),
    )
    const chapterIds = new Set(
      value.map((v) => v.chapter_id).filter((x): x is string => Boolean(x)),
    )

    for (const courseId of courseIds) {
      if (fetchedSubjectParents.current.has(courseId)) continue
      fetchedSubjectParents.current.add(courseId)
      apiGet<{ items: Subject[] }>(
        `/api/taxonomy/subjects?course_id=${courseId}`,
      ).then((r) => {
        if (r.ok) learnNames(r.data.items.map((s) => [s.id, s.name] as const))
      })
    }
    for (const subjectId of subjectIds) {
      if (fetchedChapterParents.current.has(subjectId)) continue
      fetchedChapterParents.current.add(subjectId)
      apiGet<{ items: ChapterRow[] }>(
        `/api/taxonomy/chapters?subject_id=${subjectId}`,
      ).then((r) => {
        if (r.ok) learnNames(r.data.items.map((c) => [c.id, c.name] as const))
      })
    }
    for (const chapterId of chapterIds) {
      if (fetchedTopicParents.current.has(chapterId)) continue
      fetchedTopicParents.current.add(chapterId)
      apiGet<{ items: TopicRow[] }>(
        `/api/taxonomy/topics?chapter_id=${chapterId}`,
      ).then((r) => {
        if (r.ok) learnNames(r.data.items.map((t) => [t.id, t.name] as const))
      })
    }
  }, [value, learnNames])

  const formatChip = React.useCallback(
    (tag: TaxonomyTag) => {
      const parts: string[] = [nameMap.get(tag.course_id) ?? shortId(tag.course_id)]
      if (tag.subject_id) {
        parts.push(nameMap.get(tag.subject_id) ?? shortId(tag.subject_id))
      }
      if (tag.chapter_id) {
        parts.push(nameMap.get(tag.chapter_id) ?? shortId(tag.chapter_id))
      }
      if (tag.topic_id) {
        parts.push(nameMap.get(tag.topic_id) ?? shortId(tag.topic_id))
      }
      parts.push(tag.exam_type)
      return parts.join(' → ')
    },
    [nameMap],
  )

  const remove = (idx: number) => {
    const next = value.slice()
    next.splice(idx, 1)
    onChange(next)
  }

  const add = (tag: TaxonomyTag) => {
    // Dedupe on (course, subject, chapter, topic, exam_type).
    const key = (t: TaxonomyTag) =>
      [
        t.course_id,
        t.subject_id ?? '',
        t.chapter_id ?? '',
        t.topic_id ?? '',
        t.exam_type,
      ].join('|')
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
          <TagChip
            key={idx}
            label={formatChip(tag)}
            onRemove={() => remove(idx)}
          />
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto"
          disabled={!coursesQuery.data}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {adding ? 'Cancel' : 'Add tag'}
        </Button>
      </div>

      {adding && (
        <InlineAddForm
          courses={courses}
          coursesLoading={coursesQuery.isLoading}
          onLearnNames={learnNames}
          onConfirm={add}
          onCancel={() => setAdding(false)}
        />
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function TagChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      role="listitem"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border bg-primary/5 px-2 py-0.5 text-xs',
        'border-primary/30 text-foreground',
      )}
    >
      <span className="truncate max-w-[38ch]" title={label}>
        {label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Remove tag ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

function InlineAddForm({
  courses,
  coursesLoading,
  onLearnNames,
  onConfirm,
  onCancel,
}: {
  courses: CourseRow[]
  coursesLoading: boolean
  onLearnNames: (entries: ReadonlyArray<readonly [string, string]>) => void
  onConfirm: (tag: TaxonomyTag) => void
  onCancel: () => void
}) {
  const [courseId, setCourseId] = React.useState('')
  const [subjectId, setSubjectId] = React.useState('')
  const [chapterId, setChapterId] = React.useState('')
  const [topicId, setTopicId] = React.useState('')
  const [examType, setExamType] = React.useState<ExamTypeValue>('jee')

  const subjectsQuery = useQuery({
    queryKey: ['taxonomy', 'subjects', courseId],
    queryFn: () =>
      apiGet<{ items: Subject[] }>(`/api/taxonomy/subjects?course_id=${courseId}`),
    enabled: Boolean(courseId),
  })
  const subjects = subjectsQuery.data?.ok ? subjectsQuery.data.data.items : []
  React.useEffect(() => {
    if (subjects.length > 0) {
      onLearnNames(subjects.map((s) => [s.id, s.name] as const))
    }
  }, [subjects, onLearnNames])

  const chaptersQuery = useQuery({
    queryKey: ['taxonomy', 'chapters', 'by-subject', subjectId],
    queryFn: () =>
      apiGet<{ items: ChapterRow[] }>(
        `/api/taxonomy/chapters?subject_id=${subjectId}`,
      ),
    enabled: Boolean(subjectId),
  })
  const chapters = chaptersQuery.data?.ok ? chaptersQuery.data.data.items : []
  React.useEffect(() => {
    if (chapters.length > 0) {
      onLearnNames(chapters.map((c) => [c.id, c.name] as const))
    }
  }, [chapters, onLearnNames])

  const topicsQuery = useQuery({
    queryKey: ['taxonomy', 'topics', chapterId],
    queryFn: () =>
      apiGet<{ items: TopicRow[] }>(`/api/taxonomy/topics?chapter_id=${chapterId}`),
    enabled: Boolean(chapterId),
  })
  const topics = topicsQuery.data?.ok ? topicsQuery.data.data.items : []
  React.useEffect(() => {
    if (topics.length > 0) {
      onLearnNames(topics.map((t) => [t.id, t.name] as const))
    }
  }, [topics, onLearnNames])

  const canConfirm = Boolean(courseId && examType)

  const confirm = () => {
    if (!canConfirm) return
    onConfirm({
      course_id: courseId,
      subject_id: subjectId || null,
      chapter_id: chapterId || null,
      topic_id: topicId || null,
      exam_type: examType,
    })
  }

  return (
    <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-1">
        <Label className="text-xs">
          Course <span className="text-destructive">*</span>
        </Label>
        <Select
          value={courseId}
          onChange={(e) => {
            setCourseId(e.target.value)
            setSubjectId('')
            setChapterId('')
            setTopicId('')
          }}
        >
          <option value="">
            {coursesLoading
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
      <div className="space-y-1">
        <Label className="text-xs">Subject (optional)</Label>
        <Select
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value)
            setChapterId('')
            setTopicId('')
          }}
          disabled={!courseId}
        >
          <option value="">
            {!courseId
              ? 'Pick course first'
              : subjectsQuery.isLoading
                ? 'Loading…'
                : subjects.length === 0
                  ? 'No subjects'
                  : 'Any subject'}
          </option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
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
          disabled={!subjectId}
        >
          <option value="">
            {!subjectId
              ? 'Pick subject first'
              : chaptersQuery.isLoading
                ? 'Loading…'
                : chapters.length === 0
                  ? 'No chapters'
                  : 'Any chapter'}
          </option>
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
          <option value="">
            {!chapterId
              ? 'Pick chapter first'
              : topicsQuery.isLoading
                ? 'Loading…'
                : topics.length === 0
                  ? 'No topics'
                  : 'Any topic'}
          </option>
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
      <div className="flex items-center justify-end gap-2 sm:col-span-2 lg:col-span-5">
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

// "00000000-0000-…-deadbeef" → "deadbeef" — keeps the chip readable when
// a name lookup hasn't landed yet.
function shortId(id: string): string {
  const tail = id.includes('-') ? id.split('-').pop() ?? id : id
  return tail.length > 12 ? tail.slice(0, 12) : tail
}
