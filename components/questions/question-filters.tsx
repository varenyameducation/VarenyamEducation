'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  MOCK_COURSES,
  MOCK_CHAPTERS,
  MOCK_TOPICS,
  SUBJECTS,
} from '@/lib/ui/mocks/taxonomy'
import {
  QUESTION_TYPES,
  DIFFICULTIES,
  EXAM_TYPES,
} from '@/lib/validation/question'

const DEBOUNCE_MS = 400

export function QuestionFilters() {
  const router = useRouter()
  const sp = useSearchParams()

  const courseId = sp.get('course') ?? ''
  const chapterId = sp.get('chapter') ?? ''
  const topicId = sp.get('topic') ?? ''
  const subject = sp.get('subject') ?? ''
  const difficulty = sp.get('difficulty') ?? ''
  const type = sp.get('type') ?? ''
  const examType = sp.get('exam') ?? ''
  const search = sp.get('q') ?? ''

  const [searchInput, setSearchInput] = React.useState(search)
  React.useEffect(() => setSearchInput(search), [search])

  const setParam = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString())
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === '') next.delete(k)
        else next.set(k, v)
      }
      next.delete('page')
      router.replace(`/questions?${next.toString()}`, { scroll: false })
    },
    [sp, router],
  )

  // Debounced search push
  React.useEffect(() => {
    if (searchInput === search) return
    const t = setTimeout(() => setParam({ q: searchInput || null }), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchInput, search, setParam])

  const chapters = MOCK_CHAPTERS.filter((c) => !courseId || c.course_id === courseId)
  const topics = MOCK_TOPICS.filter((t) => !chapterId || t.chapter_id === chapterId)

  const onCourse = (v: string) => setParam({ course: v || null, chapter: null, topic: null })
  const onChapter = (v: string) => setParam({ chapter: v || null, topic: null })
  const onTopic = (v: string) => setParam({ topic: v || null })

  const activeCount = [
    courseId,
    chapterId,
    topicId,
    subject,
    difficulty,
    type,
    examType,
    search,
  ].filter(Boolean).length

  return (
    <div className="space-y-4 rounded-md border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="filter-course">Course</Label>
          <Select id="filter-course" value={courseId} onChange={(e) => onCourse(e.target.value)}>
            <option value="">All courses</option>
            {MOCK_COURSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-chapter">Chapter</Label>
          <Select
            id="filter-chapter"
            value={chapterId}
            disabled={!courseId}
            onChange={(e) => onChapter(e.target.value)}
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
          <Label htmlFor="filter-topic">Topic</Label>
          <Select
            id="filter-topic"
            value={topicId}
            disabled={!chapterId}
            onChange={(e) => onTopic(e.target.value)}
          >
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Subject:</span>
        {SUBJECTS.map((s) => {
          const active = subject === s
          return (
            <button
              key={s}
              type="button"
              onClick={() => setParam({ subject: active ? null : s })}
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

      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="filter-difficulty">Difficulty</Label>
          <Select
            id="filter-difficulty"
            value={difficulty}
            onChange={(e) => setParam({ difficulty: e.target.value || null })}
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
          <Label htmlFor="filter-type">Type</Label>
          <Select
            id="filter-type"
            value={type}
            onChange={(e) => setParam({ type: e.target.value || null })}
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
          <Label htmlFor="filter-exam">Exam type</Label>
          <Select
            id="filter-exam"
            value={examType}
            onChange={(e) => setParam({ exam: e.target.value || null })}
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
          <Label htmlFor="filter-search">Search</Label>
          <Input
            id="filter-search"
            placeholder="Keyword in body…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      {activeCount > 0 && (
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {activeCount} filter{activeCount === 1 ? '' : 's'} active
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.replace('/questions', { scroll: false })}
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  )
}
