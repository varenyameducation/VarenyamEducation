// M2M (many-to-many) taxonomy helpers. Canonical types live in
// `@/types/taxonomy` (owned by integration); this module re-exports them
// for FE callsites and provides:
//   - `formatTagLabel(row)` — Course → Subject → Chapter → Topic · exam
//     chip label for a TaxonomyTagRow returned by BE.
//   - `mockInventoryCounts(scope)` — deterministic fallback the blueprint
//     builder uses when /api/questions/inventory-counts is unreachable
//     (BE down in dev, network blip).
//
// Despite the path (`mocks/`), this is no longer a fixture module — there's
// no MOCK_M2M_TAGS_BY_QUESTION or hardcoded courses/chapters/topics. The
// taxonomy mock tables were removed in the live-fetch migration.

import type {
  TaxonomyTag,
  TaxonomyTagRow,
  InventoryCounts,
  TestGenerateInput,
  BlueprintSection,
} from '@/types/taxonomy'

// Re-exports keep existing FE imports (`from '@/lib/ui/mocks/m2m'`) working
// while the canonical definition lives in `@/types/taxonomy`.
export type { TaxonomyTag, TaxonomyTagRow, InventoryCounts, BlueprintSection }
// `GenerateTestPayload` is the FE-facing alias for the canonical
// `TestGenerateInput`; preserved so /tests/new and the blueprint builder
// don't have to chase the rename.
export type GenerateTestPayload = TestGenerateInput

// Deterministic `InventoryCounts` fallback used by the blueprint builder
// when the real endpoint isn't reachable. Returns the canonical flat shape
// so callers can read counts[difficulty] directly without bridging.
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

// Chip label for a TaxonomyTagRow (server-populated wire shape with the
// denormalized name fields). Walks the 4-tier hierarchy
// course → subject → chapter → topic, joining with `→`, then appends the
// exam type. Falls back to a short id when a name is missing (locally
// constructed Row before the server round-trip; legacy un-named tag).
export function formatTagLabel(tag: TaxonomyTagRow): string {
  const parts: string[] = [tag.course_name ?? shortId(tag.course_id)]
  if (tag.subject_id) {
    parts.push(tag.subject_name ?? tag.subject ?? shortId(tag.subject_id))
  }
  if (tag.chapter_id) {
    parts.push(tag.chapter_name ?? shortId(tag.chapter_id))
  }
  if (tag.topic_id) {
    parts.push(tag.topic_name ?? shortId(tag.topic_id))
  }
  parts.push(tag.exam_type)
  return parts.join(' → ')
}

// "00000000-0000-…-deadbeef" → "deadbeef" — keeps the chip readable when
// a name lookup hasn't happened yet.
function shortId(id: string): string {
  const tail = id.includes('-') ? id.split('-').pop() ?? id : id
  return tail.length > 12 ? tail.slice(0, 12) : tail
}
