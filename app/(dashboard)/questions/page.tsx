import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { QuestionFilters } from '@/components/questions/question-filters'
import { QuestionCard } from '@/components/questions/question-card'
import { MOCK_QUESTIONS, type QuestionListItem } from '@/lib/ui/mocks/questions'

const PAGE_SIZE = 10

function applyFilters(
  items: QuestionListItem[],
  sp: Record<string, string | string[] | undefined>,
): QuestionListItem[] {
  const get = (k: string) =>
    typeof sp[k] === 'string' ? (sp[k] as string) : ''
  const course = get('course')
  const chapter = get('chapter')
  const topic = get('topic')
  const subject = get('subject')
  const difficulty = get('difficulty')
  const type = get('type')
  const exam = get('exam')
  const q = get('q').trim().toLowerCase()
  return items.filter((it) => {
    if (course && it.course_id !== course) return false
    if (chapter && it.chapter_id !== chapter) return false
    if (topic && it.topic_id !== topic) return false
    if (subject && it.subject !== subject) return false
    if (difficulty && it.difficulty !== difficulty) return false
    if (type && it.question_type !== type) return false
    if (exam && it.exam_type !== exam) return false
    if (q && !it.question_body.toLowerCase().includes(q)) return false
    return true
  })
}

export default function QuestionsListPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  // TODO: replace with apiGet<{ items: QuestionListItem[]; total: number }>('/api/questions?...')
  //       when the backend lands. Until then we filter MOCK_QUESTIONS in-memory.
  const filtered = applyFilters(MOCK_QUESTIONS, searchParams)
  const pageRaw = Number(typeof searchParams.page === 'string' ? searchParams.page : '1')
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
  const total = filtered.length
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const offset = (page - 1) * PAGE_SIZE
  const visible = filtered.slice(offset, offset + PAGE_SIZE)

  const buildPageHref = (n: number) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (typeof v === 'string' && v) next.set(k, v)
    }
    next.set('page', String(n))
    return `/questions?${next.toString()}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Question Bank</h1>
          <p className="text-sm text-muted-foreground">
            {total} question{total === 1 ? '' : 's'} match your filters.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/questions/import">Bulk import</Link>
          </Button>
          <Button asChild>
            <Link href="/questions/new">New question</Link>
          </Button>
        </div>
      </div>

      <QuestionFilters />

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed bg-muted/30 p-10 text-center">
          <p className="text-base font-medium">No questions match these filters.</p>
          <p className="text-sm text-muted-foreground">
            Try clearing filters, or create the first question for this slice.
          </p>
          <Button asChild>
            <Link href="/questions/new">Create question</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <nav
          className="flex items-center justify-between border-t pt-4"
          aria-label="Pagination"
        >
          <span className="text-xs text-muted-foreground">
            Page {page} of {pages} · {total} total
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={page <= 1}>
              <Link href={buildPageHref(Math.max(1, page - 1))}>Previous</Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={page >= pages}>
              <Link href={buildPageHref(Math.min(pages, page + 1))}>Next</Link>
            </Button>
          </div>
        </nav>
      )}
    </div>
  )
}
