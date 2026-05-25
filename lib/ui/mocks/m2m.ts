// M2M (many-to-many) taxonomy mocks. Canonical types live in
// `@/types/taxonomy` (owned by integration); this module re-exports them
// for FE callsites and ships a deterministic mock `InventoryCounts`
// generator for the blueprint builder.
//
// Real wire data comes from `/api/questions` (taxonomies),
// `/api/questions/inventory-counts`, and `/api/tests/generate`.

import type {
  TaxonomyTag,
  TaxonomyTagRow,
  InventoryCounts,
  TestGenerateInput,
  BlueprintSection,
} from '@/types/taxonomy'
import {
  MOCK_COURSES,
  MOCK_CHAPTERS,
  MOCK_TOPICS,
} from '@/lib/ui/mocks/taxonomy'

// Re-exports keep existing FE imports (`from '@/lib/ui/mocks/m2m'`) working
// while the canonical definition lives in `@/types/taxonomy`.
export type { TaxonomyTag, TaxonomyTagRow, InventoryCounts, BlueprintSection }
// `GenerateTestPayload` is the FE-facing alias for the canonical
// `TestGenerateInput`; preserved so /tests/new and the blueprint builder
// don't have to chase the rename.
export type GenerateTestPayload = TestGenerateInput

// Sample taxonomy-row arrays — used by mocks and dev seeds. Each entry is
// the wire-shape returned by `/api/questions`: id-only `TaxonomyTag` plus
// server-populated `id`, `created_at`, and the denormalized name fields.
export const MOCK_M2M_TAGS_BY_QUESTION: Record<string, TaxonomyTagRow[]> = {
  'q-sample-cross': [
    {
      id: '00000000-0000-0000-0000-0000000000a1',
      created_at: '2026-05-25T10:00:00.000Z',
      course_id: 'c-jee-foundation',
      course_name: 'JEE Foundation',
      chapter_id: 'ch-jee-laws-of-motion',
      chapter_name: 'Laws of Motion',
      topic_id: 't-lom-newton2',
      topic_name: "Newton's second law",
      subject: 'Physics',
      exam_type: 'jee',
    },
    {
      id: '00000000-0000-0000-0000-0000000000a2',
      created_at: '2026-05-25T10:00:00.000Z',
      course_id: 'c-class11-pcm',
      course_name: 'Class 11 — PCM',
      chapter_id: 'ch-c11-kinematics',
      chapter_name: 'Kinematics',
      topic_id: 't-kin-acceleration',
      topic_name: 'Uniform acceleration',
      subject: 'Physics',
      exam_type: 'school',
    },
  ],
  'q-sample-numerical': [
    {
      id: '00000000-0000-0000-0000-0000000000b1',
      created_at: '2026-05-25T10:00:00.000Z',
      course_id: 'c-neet-class12',
      course_name: 'NEET Class 12',
      chapter_id: null,
      chapter_name: null,
      topic_id: null,
      topic_name: null,
      subject: 'Biology',
      exam_type: 'neet',
    },
  ],
  'q-sample-school': [
    {
      id: '00000000-0000-0000-0000-0000000000c1',
      created_at: '2026-05-25T10:00:00.000Z',
      course_id: 'c-class11-pcm',
      course_name: 'Class 11 — PCM',
      chapter_id: 'ch-c11-sets',
      chapter_name: 'Sets and Functions',
      topic_id: 't-sets-functions',
      topic_name: 'Relations and functions',
      subject: 'Maths',
      exam_type: 'board',
    },
  ],
}

// Deterministic `InventoryCounts` fallback used by the blueprint builder
// when the real endpoint isn't reachable (404 in local dev, FE behind BE).
// Returns the canonical flat shape so callers can read counts[difficulty]
// directly without bridging.
export function mockInventoryCounts(scope: {
  course_id?: string
  exam_type?: string
  subject?: string
  chapter_ids?: string[]
  topic_ids?: string[]
  question_type?: string
}): InventoryCounts {
  const filterCount =
    (scope.course_id ? 1 : 0) +
    (scope.chapter_ids?.length ?? 0) +
    (scope.topic_ids?.length ?? 0) +
    (scope.question_type ? 1 : 0) +
    (scope.subject ? 1 : 0)
  const base = Math.max(8, 40 - filterCount * 6)
  const easy = Math.max(2, Math.round(base * 1.1))
  const medium = Math.max(2, Math.round(base * 1.3))
  const hard = Math.max(1, Math.round(base * 0.9))
  const advanced = Math.max(1, Math.round(base * 0.6))
  return {
    easy,
    medium,
    hard,
    advanced,
    total: easy + medium + hard + advanced,
  }
}

// Chip label for a TaxonomyTagRow. Reads the denormalized name fields that
// BE attaches; falls back to short-IDs when names are missing (e.g. for
// tags constructed locally in the bulk-retag flow before the server round
// trip).
export function formatTagLabel(tag: TaxonomyTagRow): string {
  const courseLabel = tag.course_name ?? shortId(tag.course_id)
  const parts: string[] = [courseLabel]
  if (tag.chapter_id) {
    parts.push(tag.chapter_name ?? shortId(tag.chapter_id))
  }
  if (tag.topic_id) {
    parts.push(tag.topic_name ?? shortId(tag.topic_id))
  }
  parts.push(tag.exam_type)
  return parts.join(' · ')
}

// "00000000-0000-…-deadbeef" → "deadbeef" — keeps the chip readable when
// a name lookup hasn't happened yet.
function shortId(id: string): string {
  const tail = id.includes('-') ? id.split('-').pop() ?? id : id
  return tail.length > 12 ? tail.slice(0, 12) : tail
}

// Format an id-only TaxonomyTag (the picker's working shape) for chip
// display by looking up names in the local taxonomy mock tables. Used by
// callsites that hold TaxonomyTag (not Row) — the question form, the
// bulk-retag modal — so users see real labels while editing before the
// server round-trip materializes the canonical `Row` with names.
export function formatTagFromMocks(tag: TaxonomyTag): string {
  const course = MOCK_COURSES.find((c) => c.id === tag.course_id)
  const chapter = tag.chapter_id
    ? MOCK_CHAPTERS.find((c) => c.id === tag.chapter_id)
    : null
  const topic = tag.topic_id ? MOCK_TOPICS.find((t) => t.id === tag.topic_id) : null
  const parts: string[] = [course?.name ?? shortId(tag.course_id)]
  if (tag.chapter_id) parts.push(chapter?.name ?? shortId(tag.chapter_id))
  if (tag.topic_id) parts.push(topic?.name ?? shortId(tag.topic_id))
  parts.push(tag.exam_type)
  return parts.join(' · ')
}
