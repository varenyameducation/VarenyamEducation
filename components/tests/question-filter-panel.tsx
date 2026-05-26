'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  QUESTION_TYPES,
  DIFFICULTIES,
  EXAM_TYPES,
  SUBJECTS,
} from '@/lib/validation/question'
import { apiGet, type Paginated, type Question } from '@/lib/ui/api'
import type { Subject } from '@/types/taxonomy'

const DEBOUNCE_MS = 400

type CourseRow = { id: string; name: string }
type ChapterRow = { id: string; subject_id: string; name: string }
type TopicRow = { id: string; chapter_id: string; name: string }

export interface PoolFilters {
  course_id?: string
  subject_id?: string
  chapter_id?: string
  topic_id?: string
  // Legacy `subject` string filter — chip row below the dropdowns lets the
  // user pick by canonical four ('Physics' / 'Chemistry' / 'Maths' /
  // 'Biology') without going through subject_id. Both are valid against
  // the BE.
  subject?: string
  question_type?: string
  difficulty?: string
  exam_type?: string
  search?: string
}

export interface QuestionFilterPanelProps {
  value: PoolFilters
  onChange: (next: PoolFilters) => void
}

function buildQs(f: PoolFilters): string {
  const qs = new URLSearchParams()
  if (f.course_id) qs.set('course_id', f.course_id)
  if (f.subject_id) qs.set('subject_id', f.subject_id)
  if (f.chapter_id) qs.set('chapter_id', f.chapter_id)
  if (f.topic_id) qs.set('topic_id', f.topic_id)
  if (f.subject) qs.set('subject', f.subject)
  if (f.question_type) qs.set('question_type', f.question_type)
  if (f.difficulty) qs.set('difficulty', f.difficulty)
  if (f.exam_type) qs.set('exam_type', f.exam_type)
  if (f.search) qs.set('search', f.search)
  qs.set('limit', '50')
  return qs.toString()
}

export function useQuestionPool(filters: PoolFilters) {
  const qs = React.useMemo(() => buildQs(filters), [filters])
  return useQuery({
    queryKey: ['tests-questions-pool', qs],
    queryFn: () => apiGet<Paginated<Question>>(`/api/questions?${qs}`),
  })
}

export function QuestionFilterPanel({ value, onChange }: QuestionFilterPanelProps) {
  const [searchInput, setSearchInput] = React.useState(value.search ?? '')
  React.useEffect(() => setSearchInput(value.search ?? ''), [value.search])

  // Debounced commit of the search input.
  React.useEffect(() => {
    if (searchInput === (value.search ?? '')) return
    const t = setTimeout(
      () => onChange({ ...value, search: searchInput || undefined }),
      DEBOUNCE_MS,
    )
    return () => clearTimeout(t)
  }, [searchInput, value, onChange])

  // Live taxonomy fetches — dependent on parent selection. All endpoints
  // return a bounded list per institute so no pagination handling here.
  const coursesQuery = useQuery({
    queryKey: ['taxonomy', 'courses'],
    queryFn: () => apiGet<{ items: CourseRow[] }>('/api/taxonomy/courses'),
  })
  const courses = coursesQuery.data?.ok ? coursesQuery.data.data.items : []

  const subjectsQuery = useQuery({
    queryKey: ['taxonomy', 'subjects', value.course_id],
    queryFn: () =>
      apiGet<{ items: Subject[] }>(
        `/api/taxonomy/subjects?course_id=${value.course_id}`,
      ),
    enabled: Boolean(value.course_id),
  })
  const subjects = subjectsQuery.data?.ok ? subjectsQuery.data.data.items : []

  const chaptersQuery = useQuery({
    queryKey: ['taxonomy', 'chapters', 'by-subject', value.subject_id],
    queryFn: () =>
      apiGet<{ items: ChapterRow[] }>(
        `/api/taxonomy/chapters?subject_id=${value.subject_id}`,
      ),
    enabled: Boolean(value.subject_id),
  })
  const chapters = chaptersQuery.data?.ok ? chaptersQuery.data.data.items : []

  const topicsQuery = useQuery({
    queryKey: ['taxonomy', 'topics', value.chapter_id],
    queryFn: () =>
      apiGet<{ items: TopicRow[] }>(
        `/api/taxonomy/topics?chapter_id=${value.chapter_id}`,
      ),
    enabled: Boolean(value.chapter_id),
  })
  const topics = topicsQuery.data?.ok ? topicsQuery.data.data.items : []

  const set = (patch: Partial<PoolFilters>) => onChange({ ...value, ...patch })

  const activeCount = Object.values(value).filter(Boolean).length

  return (
    <aside className="space-y-3 rounded-md border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Filter pool</h3>
        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({})}
          >
            Clear ({activeCount})
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tb-course">Course</Label>
        <Select
          id="tb-course"
          value={value.course_id ?? ''}
          onChange={(e) =>
            set({
              course_id: e.target.value || undefined,
              subject_id: undefined,
              chapter_id: undefined,
              topic_id: undefined,
            })
          }
        >
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tb-subject-id">Subject (taxonomy)</Label>
        <Select
          id="tb-subject-id"
          value={value.subject_id ?? ''}
          disabled={!value.course_id}
          onChange={(e) =>
            set({
              subject_id: e.target.value || undefined,
              chapter_id: undefined,
              topic_id: undefined,
            })
          }
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tb-chapter">Chapter</Label>
        <Select
          id="tb-chapter"
          value={value.chapter_id ?? ''}
          disabled={!value.subject_id}
          onChange={(e) =>
            set({ chapter_id: e.target.value || undefined, topic_id: undefined })
          }
        >
          <option value="">All chapters</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tb-topic">Topic</Label>
        <Select
          id="tb-topic"
          value={value.topic_id ?? ''}
          disabled={!value.chapter_id}
          onChange={(e) => set({ topic_id: e.target.value || undefined })}
        >
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Subject (canonical)</Label>
        <div className="flex flex-wrap gap-1.5">
          {SUBJECTS.map((s) => {
            const active = value.subject === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => set({ subject: active ? undefined : s })}
                className="focus-visible:outline-none"
              >
                <Badge
                  variant={active ? 'default' : 'outline'}
                  className={cn('cursor-pointer', !active && 'hover:bg-accent')}
                >
                  {s}
                </Badge>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tb-type">Type</Label>
        <Select
          id="tb-type"
          value={value.question_type ?? ''}
          onChange={(e) => set({ question_type: e.target.value || undefined })}
        >
          <option value="">All</option>
          {QUESTION_TYPES.map((q) => (
            <option key={q.value} value={q.value}>
              {q.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tb-difficulty">Difficulty</Label>
        <Select
          id="tb-difficulty"
          value={value.difficulty ?? ''}
          onChange={(e) => set({ difficulty: e.target.value || undefined })}
        >
          <option value="">All</option>
          {DIFFICULTIES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tb-exam">Exam type</Label>
        <Select
          id="tb-exam"
          value={value.exam_type ?? ''}
          onChange={(e) => set({ exam_type: e.target.value || undefined })}
        >
          <option value="">All</option>
          {EXAM_TYPES.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tb-search">Search</Label>
        <Input
          id="tb-search"
          placeholder="Keyword in body…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>
    </aside>
  )
}
