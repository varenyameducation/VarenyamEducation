'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowRight, CheckCircle2, Download, FileText, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost } from '@/lib/ui/api'
import { cn } from '@/lib/utils'

interface ImportError {
  row: number | null
  reason: string
}

interface ImportResult {
  imported: number
  mcq_count?: number
  subjective_count?: number
  errors: ImportError[]
  note?: string
  header?: { topic?: string | null; time_minutes?: number | null; total_marks?: number | null }
}

type Status = 'idle' | 'uploading' | 'done' | 'error'

type CourseOption = { id: string; name: string }
type ChapterOption = { id: string; name: string; course_id: string; subject: string }
type TopicOption = { id: string; name: string; chapter_id: string }

const SUBJECTS = ['Physics', 'Chemistry', 'Maths', 'Biology'] as const
const DIFFICULTIES = ['easy', 'medium', 'hard', 'advanced'] as const
const EXAM_TYPES = ['school', 'board', 'jee', 'neet'] as const

function fileKind(name: string): 'xlsx' | 'docx' | 'pdf' | 'unknown' {
  const lower = name.toLowerCase()
  if (lower.endsWith('.xlsx')) return 'xlsx'
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.pdf')) return 'pdf'
  return 'unknown'
}

export default function ImportQuestionsPage() {
  const qc = useQueryClient()
  const [file, setFile] = React.useState<File | null>(null)
  const [zip, setZip] = React.useState<File | null>(null)
  const [status, setStatus] = React.useState<Status>('idle')
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const [courseId, setCourseId] = React.useState('')
  const [chapterId, setChapterId] = React.useState('')
  const [topicId, setTopicId] = React.useState('')
  const [subject, setSubject] = React.useState<(typeof SUBJECTS)[number]>('Maths')
  const [difficulty, setDifficulty] = React.useState<(typeof DIFFICULTIES)[number]>('medium')
  const [examType, setExamType] = React.useState<(typeof EXAM_TYPES)[number]>('school')
  const [marksDefault, setMarksDefault] = React.useState(1)

  const coursesQuery = useQuery({
    queryKey: ['taxonomy', 'courses'],
    queryFn: () => apiGet<{ items: CourseOption[] }>('/api/taxonomy/courses'),
  })
  const chaptersQuery = useQuery({
    queryKey: ['taxonomy', 'chapters', courseId],
    queryFn: () =>
      apiGet<{ items: ChapterOption[] }>(`/api/taxonomy/chapters?course_id=${courseId}`),
    enabled: Boolean(courseId),
  })
  const topicsQuery = useQuery({
    queryKey: ['taxonomy', 'topics', chapterId],
    queryFn: () =>
      apiGet<{ items: TopicOption[] }>(`/api/taxonomy/topics?chapter_id=${chapterId}`),
    enabled: Boolean(chapterId),
  })

  const courses = coursesQuery.data?.ok ? coursesQuery.data.data.items : []
  const chapters = chaptersQuery.data?.ok ? chaptersQuery.data.data.items : []
  const topics = topicsQuery.data?.ok ? topicsQuery.data.data.items : []

  const kind = file ? fileKind(file.name) : 'unknown'
  const isDoc = kind === 'docx' || kind === 'pdf'
  const needsDefaults = isDoc

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)
    if (!file) {
      setErrorMessage('Pick a .docx, .pdf, or .xlsx file first.')
      return
    }
    if (kind === 'unknown') {
      setErrorMessage('Only .docx, .pdf, and .xlsx files are supported.')
      return
    }
    if (needsDefaults && (!courseId || !chapterId || !topicId)) {
      setErrorMessage('Pick Course, Chapter, and Topic for Word/PDF imports.')
      return
    }

    setStatus('uploading')
    setResult(null)

    const fd = new FormData()
    fd.append('file', file)
    if (kind === 'xlsx' && zip) fd.append('images', zip)
    if (needsDefaults) {
      fd.append('course_id', courseId)
      fd.append('chapter_id', chapterId)
      fd.append('topic_id', topicId)
      fd.append('subject', subject)
      fd.append('difficulty', difficulty)
      fd.append('exam_type', examType)
      fd.append('marks_default', String(marksDefault))
    }

    const res = await apiPost<ImportResult>('/api/questions/import', fd)
    if (!res.ok) {
      setErrorMessage(res.error.message)
      setStatus('error')
      return
    }
    setResult(res.data)
    setStatus('done')
    qc.invalidateQueries({ queryKey: ['questions'] })
  }

  function downloadErrorCsv() {
    if (!result || result.errors.length === 0) return
    const header = 'question_no,reason\n'
    const body = result.errors
      .map((e) => `${e.row ?? ''},"${e.reason.replace(/"/g, '""')}"`)
      .join('\n')
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `question-import-errors-${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bulk import questions</h1>
          <p className="text-sm text-muted-foreground">
            Upload a Word (.docx), PDF, or Excel (.xlsx) file. MCQs are auto-detected.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/templates/question-import-template.xlsx" download>
            <FileText className="mr-2 h-4 w-4" />
            XLSX template
          </a>
        </Button>
      </header>

      <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <strong>Word/PDF</strong>: detects all questions in the form <code>Q1.</code> body{' '}
          <code>[marks]</code>. MCQs (with <code>(A) (B) (C) (D)</code> options) and
          subjective questions (short/long answer, case-based, assertion-reason) all import.
          MCQs default to <em>correct_option = "A"</em> and{' '}
          <em>is_verified = false</em> — review each in the Question Bank to set the actual answer.
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-md border bg-card p-5"
        aria-label="Bulk import"
      >
        <div className="space-y-2">
          <Label htmlFor="file">Source file (.docx, .pdf, .xlsx)</Label>
          <input
            id="file"
            type="file"
            accept=".docx,.pdf,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
          />
          {file && (
            <p className="text-xs text-muted-foreground">
              {file.name} · {(file.size / 1024).toFixed(1)} KB ·{' '}
              <span className="uppercase">{kind === 'unknown' ? '!' : kind}</span>
            </p>
          )}
        </div>

        {needsDefaults && (
          <fieldset className="space-y-4 rounded-md border bg-muted/20 p-4">
            <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">
              Defaults for all imported questions
            </legend>
            <p className="text-xs text-muted-foreground">
              These tags will be applied to every imported question. You can add
              more tags later in bulk from the question bank.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="course_id">Course</Label>
                <Select
                  id="course_id"
                  value={courseId}
                  onChange={(e) => {
                    setCourseId(e.target.value)
                    setChapterId('')
                    setTopicId('')
                  }}
                >
                  <option value="">
                    {coursesQuery.isLoading
                      ? 'Loading…'
                      : courses.length === 0
                        ? 'No courses — add one under /taxonomy'
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
                <Label htmlFor="chapter_id">Chapter</Label>
                <Select
                  id="chapter_id"
                  value={chapterId}
                  onChange={(e) => {
                    setChapterId(e.target.value)
                    setTopicId('')
                  }}
                  disabled={!courseId}
                >
                  <option value="">
                    {!courseId
                      ? 'Pick course first'
                      : chaptersQuery.isLoading
                        ? 'Loading…'
                        : chapters.length === 0
                          ? 'No chapters'
                          : 'Select chapter…'}
                  </option>
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="topic_id">Topic</Label>
                <Select
                  id="topic_id"
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
                          : 'Select topic…'}
                  </option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Select
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value as (typeof SUBJECTS)[number])}
                >
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select
                  id="difficulty"
                  value={difficulty}
                  onChange={(e) =>
                    setDifficulty(e.target.value as (typeof DIFFICULTIES)[number])
                  }
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam_type">Exam type</Label>
                <Select
                  id="exam_type"
                  value={examType}
                  onChange={(e) =>
                    setExamType(e.target.value as (typeof EXAM_TYPES)[number])
                  }
                >
                  {EXAM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="marks_default">Default marks</Label>
                <Input
                  id="marks_default"
                  type="number"
                  min={1}
                  max={20}
                  value={marksDefault}
                  onChange={(e) => setMarksDefault(Number(e.target.value) || 1)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Per-question marks parsed from <code>[N]</code> in the document override the
              default.
            </p>
          </fieldset>
        )}

        {kind === 'xlsx' && (
          <div className="space-y-2">
            <Label htmlFor="zip">Image bundle (.zip, optional)</Label>
            <input
              id="zip"
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setZip(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Button asChild variant="ghost">
            <Link href="/questions">Cancel</Link>
          </Button>
          <Button type="submit" disabled={status === 'uploading'}>
            {status === 'uploading' ? 'Uploading…' : 'Start import'}
          </Button>
        </div>

        {errorMessage && (
          <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {errorMessage}
          </p>
        )}
      </form>

      {result && (
        <section className="space-y-4 rounded-md border bg-card p-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold">
                {result.imported} imported{' '}
                {typeof result.mcq_count === 'number' && typeof result.subjective_count === 'number'
                  ? `(${result.mcq_count} MCQ · ${result.subjective_count} subjective)`
                  : ''}{' '}
                · {result.errors.length} failed
              </h2>
            </div>
            {result.errors.length > 0 && (
              <Button type="button" variant="outline" onClick={downloadErrorCsv}>
                <Download className="mr-2 h-4 w-4" />
                Download error CSV
              </Button>
            )}
          </header>

          {result.header && (result.header.topic || result.header.total_marks) ? (
            <p className="text-xs text-muted-foreground">
              Detected from document:
              {result.header.topic ? ` Topic: ${result.header.topic};` : ''}
              {result.header.time_minutes ? ` Time: ${result.header.time_minutes}m;` : ''}
              {result.header.total_marks ? ` Total Marks: ${result.header.total_marks};` : ''}
            </p>
          ) : null}

          {result.note && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>Heads up:</strong> {result.note}
            </p>
          )}

          {result.errors.length > 0 && (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2">Q#</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, idx) => (
                    <tr
                      key={`${e.row ?? 'r'}-${idx}`}
                      className={cn('border-t', idx % 2 === 0 && 'bg-muted/10')}
                    >
                      <td className="px-3 py-2 font-mono">{e.row ?? '—'}</td>
                      <td className="px-3 py-2">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <span>
              {result.imported > 0
                ? 'Your imported questions are now in the bank.'
                : 'Nothing imported — check the error list.'}
            </span>
            {result.imported > 0 && (
              <Button asChild size="sm">
                <Link href={courseId ? `/questions?course=${courseId}` : '/questions'}>
                  View in Question Bank
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
