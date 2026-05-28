'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Loader2,
  RotateCcw,
} from 'lucide-react'
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
  pages_processed?: number
  total_pages_in_doc?: number
  total_tokens?: number
  vision_images_processed?: number
  vision_images_replaced?: number
  vision_text_used?: boolean
  vision_text_tokens?: number
  vision_text_images_attached?: number
  vision_text_error?: { code: string; message: string } | null
  skipped_duplicates?: number
  errors: ImportError[]
  note?: string
  header?: { topic?: string | null; time_minutes?: number | null; total_marks?: number | null }
}

type Status = 'idle' | 'uploading' | 'done' | 'error'

type CourseOption = { id: string; name: string }
type SubjectOption = { id: string; name: string; course_id: string }
type ChapterOption = { id: string; name: string; subject_id: string }
type TopicOption = { id: string; name: string; chapter_id: string }

const DIFFICULTIES = ['easy', 'medium', 'hard', 'advanced'] as const
const EXAM_TYPES = ['school', 'board', 'jee', 'neet'] as const

type FileKind = 'xlsx' | 'docx' | 'pdf' | 'image' | 'unknown'

function fileKind(file: File): FileKind {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.xlsx')) return 'xlsx'
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.pdf')) return 'pdf'
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp')
  ) {
    return 'image'
  }
  const mime = (file.type || '').toLowerCase()
  if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp') return 'image'
  return 'unknown'
}

export default function ImportQuestionsPage() {
  const qc = useQueryClient()
  const [file, setFile] = React.useState<File | null>(null)
  const [zip, setZip] = React.useState<File | null>(null)
  const [status, setStatus] = React.useState<Status>('idle')
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [errorsExpanded, setErrorsExpanded] = React.useState(false)
  const [useVision, setUseVision] = React.useState(false)
  // Tracks whether the user has manually toggled the Vision checkbox since
  // the last file selection. While false, the checkbox follows the
  // "PDF -> on, anything else -> off" default; once true, the user's choice
  // is preserved across file changes until reset.
  const [userOverrode, setUserOverrode] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const [courseId, setCourseId] = React.useState('')
  const [subjectId, setSubjectId] = React.useState('')
  const [chapterId, setChapterId] = React.useState('')
  const [topicId, setTopicId] = React.useState('')
  const [difficulty, setDifficulty] =
    React.useState<(typeof DIFFICULTIES)[number]>('medium')
  const [examType, setExamType] = React.useState<(typeof EXAM_TYPES)[number]>('school')
  const [marksDefault, setMarksDefault] = React.useState(1)

  const coursesQuery = useQuery({
    queryKey: ['taxonomy', 'courses'],
    queryFn: () => apiGet<{ items: CourseOption[] }>('/api/taxonomy/courses?limit=1000'),
  })
  const subjectsQuery = useQuery({
    queryKey: ['taxonomy', 'subjects', courseId],
    queryFn: () =>
      apiGet<{ items: SubjectOption[] }>(
        `/api/taxonomy/subjects?course_id=${courseId}&limit=1000`,
      ),
    enabled: Boolean(courseId),
  })
  const chaptersQuery = useQuery({
    queryKey: ['taxonomy', 'chapters', subjectId],
    queryFn: () =>
      apiGet<{ items: ChapterOption[] }>(
        `/api/taxonomy/chapters?subject_id=${subjectId}&limit=1000`,
      ),
    enabled: Boolean(subjectId),
  })
  const topicsQuery = useQuery({
    queryKey: ['taxonomy', 'topics', chapterId],
    queryFn: () =>
      apiGet<{ items: TopicOption[] }>(
        `/api/taxonomy/topics?chapter_id=${chapterId}&limit=1000`,
      ),
    enabled: Boolean(chapterId),
  })

  const courses = coursesQuery.data?.ok ? coursesQuery.data.data.items : []
  const subjects = subjectsQuery.data?.ok ? subjectsQuery.data.data.items : []
  const chapters = chaptersQuery.data?.ok ? chaptersQuery.data.data.items : []
  const topics = topicsQuery.data?.ok ? topicsQuery.data.data.items : []

  const selectedSubjectName = subjects.find((s) => s.id === subjectId)?.name ?? ''

  const kind: FileKind = file ? fileKind(file) : 'unknown'
  const isImage = kind === 'image'
  const isPdf = kind === 'pdf'
  const isDocx = kind === 'docx'
  const isDocxOrPdf = isPdf || isDocx
  const needsDefaults = isDocx || isPdf || isImage
  // Vision opt-in applies to PDFs (per-page render) and DOCX (per-embedded-
  // image scan). If the user switches files to a non-eligible kind after
  // checking the box, treat it as off for submit + UI.
  const visionActive = useVision && isDocxOrPdf

  // Default the Vision checkbox to ON for PDFs and DOCX (the workflows
  // Vision is designed for) and OFF for everything else. Once the user
  // manually toggles the checkbox, `userOverrode` flips true and the
  // auto-default stops re-applying.
  React.useEffect(() => {
    if (userOverrode) return
    setUseVision(isDocxOrPdf)
  }, [isDocxOrPdf, userOverrode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)
    if (!file) {
      setErrorMessage('Pick a .docx, .pdf, .xlsx, or image (.png/.jpg/.webp) file first.')
      return
    }
    if (kind === 'unknown') {
      setErrorMessage(
        'Only .docx, .pdf, .xlsx, and image (.png/.jpg/.jpeg/.webp) files are supported.',
      )
      return
    }
    if (needsDefaults && (!courseId || !subjectId || !chapterId || !topicId)) {
      setErrorMessage('Pick Course, Subject, Chapter, and Topic for Word/PDF/image imports.')
      return
    }

    setStatus('uploading')
    setResult(null)
    setErrorsExpanded(false)

    const fd = new FormData()
    fd.append('file', file)
    if (kind === 'xlsx' && zip) fd.append('images', zip)
    if (needsDefaults) {
      fd.append('course_id', courseId)
      fd.append('chapter_id', chapterId)
      fd.append('topic_id', topicId)
      // BE still expects a `subject` string field; derive it from the
      // selected subject row's human name so the hardcoded enum can die.
      fd.append('subject', selectedSubjectName)
      fd.append('difficulty', difficulty)
      fd.append('exam_type', examType)
      fd.append('marks_default', String(marksDefault))
    }
    if (visionActive) fd.append('vision', 'true')

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

  function resetForAnotherImport() {
    setFile(null)
    setZip(null)
    setResult(null)
    setErrorMessage(null)
    setErrorsExpanded(false)
    setUseVision(false)
    setUserOverrode(false)
    setStatus('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
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
            Upload a Word (.docx), PDF, Excel (.xlsx), or image (PNG / JPG / WebP) file.
            MCQs auto-detected.
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
        <div className="space-y-1">
          <p>
            <strong>Images</strong>: Gemini Vision extracts the question with LaTeX
            math (one call, takes a few seconds).
          </p>
          <p>
            <strong>PDFs and DOCX</strong>: text is parsed and math is normalized to
            LaTeX heuristically — math-heavy 2D layouts may need manual cleanup after
            import. MCQs (with <code>(A) (B) (C) (D)</code> options) and subjective
            questions (short/long answer, case-based, assertion-reason) all import.
          </p>
          <p>
            Question numbering can be <code>1.&nbsp;body&nbsp;[marks]</code>,{' '}
            <code>Q1.&nbsp;body&nbsp;[marks]</code>, or similar. MCQs import
            without a correct answer marked — review each question in the
            Question Bank to set the actual answer. <em>is_verified = false</em>{' '}
            on all bulk imports.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-md border bg-card p-5"
        aria-label="Bulk import"
      >
        <div className="space-y-2">
          <Label htmlFor="file">Source file (.docx, .pdf, .xlsx, image)</Label>
          <input
            id="file"
            ref={fileInputRef}
            type="file"
            accept=".docx,.pdf,.xlsx,.png,.jpg,.jpeg,.webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp"
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

        <div className="rounded-md border bg-muted/10 p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={useVision}
              onChange={(e) => {
                setUseVision(e.target.checked)
                setUserOverrode(true)
              }}
              disabled={!isDocxOrPdf}
              aria-describedby="vision-help"
            />
            <span className={cn('space-y-1 text-sm', !isDocxOrPdf && 'opacity-60')}>
              <span className="font-medium">
                Render math accurately (recommended for math papers)
              </span>
              <span id="vision-help" className="block text-xs text-muted-foreground">
                {!file ? (
                  'Select a PDF or Word file to enable this option.'
                ) : isPdf ? (
                  'Renders each page through Gemini Vision so 2D math notation (fractions, integrals, exponents) comes through as proper LaTeX. ~5 seconds per page; uses Gemini free-tier quota.'
                ) : isDocx ? (
                  'Sends the document text to Gemini to reconstruct questions and convert flattened math back to proper LaTeX (works for Word files that were converted from PDFs). Also scans any pasted equation screenshots inside the file. ~15–45 seconds total.'
                ) : (
                  <span className="font-medium">
                    PDF or Word only — current file is .{kind === 'unknown' ? '?' : kind}.
                  </span>
                )}
              </span>
            </span>
          </label>
        </div>

        {needsDefaults && (
          <fieldset className="space-y-4 rounded-md border bg-muted/20 p-4">
            <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">
              Defaults for all imported questions
            </legend>
            <p className="text-xs text-muted-foreground">
              These tags will be applied to every imported question. You can add more
              tags later in bulk from the question bank.
            </p>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="course_id">Course</Label>
                <Select
                  id="course_id"
                  value={courseId}
                  onChange={(e) => {
                    setCourseId(e.target.value)
                    setSubjectId('')
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
                <Label htmlFor="subject_id">Subject</Label>
                <Select
                  id="subject_id"
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
                          : 'Select subject…'}
                  </option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
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
                  disabled={!subjectId}
                >
                  <option value="">
                    {!subjectId
                      ? 'Pick subject first'
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
            <div className="grid gap-4 md:grid-cols-3">
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
              Per-question marks parsed from <code>[N]</code> in the document override
              the default.
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

        {status === 'uploading' && (
          <div className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
            <div className="flex-1 space-y-1">
              <p className="font-medium">
                {isImage
                  ? 'Reading your image with Gemini Vision (5–15 seconds)…'
                  : visionActive && isPdf
                    ? 'Importing via Gemini Vision (this may take 1–5 minutes for multi-page PDFs)…'
                    : visionActive && isDocx
                      ? 'Reconstructing questions with Gemini (re-LaTeX flattened math + scan embedded images, ~15–45 seconds)…'
                      : 'Parsing your document…'}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Button asChild variant="ghost">
            <Link href="/questions">Cancel</Link>
          </Button>
          <Button type="submit" disabled={status === 'uploading'}>
            {status === 'uploading' ? 'Importing…' : 'Start import'}
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
                {result.imported} question{result.imported === 1 ? '' : 's'} imported
                {typeof result.mcq_count === 'number' &&
                typeof result.subjective_count === 'number'
                  ? ` · ${result.mcq_count} MCQ · ${result.subjective_count} subjective`
                  : ''}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {result.errors.length > 0 && (
                <Button type="button" variant="outline" onClick={downloadErrorCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  Download error CSV
                </Button>
              )}
              <Button type="button" variant="outline" onClick={resetForAnotherImport}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Import another
              </Button>
            </div>
          </header>

          {isImage && typeof result.total_tokens === 'number' && (
            <p className="text-xs text-muted-foreground">
              1 image processed · ~{result.total_tokens.toLocaleString()} tokens (Gemini)
            </p>
          )}

          {typeof result.pages_processed === 'number' && (
            <p className="text-xs text-muted-foreground">
              {result.pages_processed} page
              {result.pages_processed === 1 ? '' : 's'} processed
              {typeof result.total_pages_in_doc === 'number' &&
              result.total_pages_in_doc !== result.pages_processed
                ? ` (of ${result.total_pages_in_doc} total — re-upload the rest as a follow-up)`
                : ''}
              {typeof result.total_tokens === 'number' && !isImage
                ? ` · ~${result.total_tokens.toLocaleString()} Gemini tokens used`
                : ''}
            </p>
          )}

          {typeof result.vision_images_processed === 'number' &&
            result.vision_images_processed > 0 && (
              <p className="font-mono text-xs text-muted-foreground">
                {result.vision_images_processed} embedded image
                {result.vision_images_processed === 1 ? '' : 's'} scanned
                {typeof result.vision_images_replaced === 'number'
                  ? ` · ${result.vision_images_replaced} replaced with LaTeX, ${result.vision_images_processed - result.vision_images_replaced} kept as diagrams`
                  : ''}
              </p>
            )}

          {result.vision_text_used && (
            <p className="font-mono text-xs text-muted-foreground">
              DOCX reconstructed via Gemini Vision
              {typeof result.vision_text_images_attached === 'number' &&
              result.vision_text_images_attached > 0
                ? ` · ${result.vision_text_images_attached} embedded image${result.vision_text_images_attached === 1 ? '' : 's'} read inline`
                : ''}
              {typeof result.vision_text_tokens === 'number'
                ? ` · ~${result.vision_text_tokens.toLocaleString()} tokens`
                : ''}
            </p>
          )}

          {typeof result.skipped_duplicates === 'number' &&
            result.skipped_duplicates > 0 && (
              <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {result.skipped_duplicates} question
                  {result.skipped_duplicates === 1 ? '' : 's'} skipped as
                  duplicate
                  {result.skipped_duplicates === 1 ? '' : 's'} of existing
                  rows in the question bank. See the error CSV for the
                  matched IDs and similarity scores. Delete the existing
                  question(s) first if you want to replace them.
                </span>
              </p>
            )}

          {!result.vision_text_used && result.vision_text_error && (
            <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Gemini text reconstruction failed
                {' ('}
                <code className="font-mono">{result.vision_text_error.code}</code>
                {'): '}
                {result.vision_text_error.message}
                {' '}— fell back to the heuristic parser, which is what produced this output. If this is a math-heavy DOCX, retry in a few seconds (free-tier quota is 15 req/min) or upload the original PDF instead.
              </span>
            </p>
          )}

          {result.header && (result.header.topic || result.header.total_marks) ? (
            <p className="text-xs text-muted-foreground">
              Detected from document:
              {result.header.topic ? ` Topic: ${result.header.topic};` : ''}
              {result.header.time_minutes ? ` Time: ${result.header.time_minutes}m;` : ''}
              {result.header.total_marks
                ? ` Total Marks: ${result.header.total_marks};`
                : ''}
            </p>
          ) : null}

          {result.note && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>Heads up:</strong> {result.note}
            </p>
          )}

          {result.errors.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => setErrorsExpanded((v) => !v)}
                aria-expanded={errorsExpanded}
              >
                {errorsExpanded
                  ? `Hide ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`
                  : `Show ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`}
              </button>
              {errorsExpanded && (
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
