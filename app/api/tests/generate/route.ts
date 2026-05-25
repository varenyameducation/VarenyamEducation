import { type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { err, ok } from '@/lib/api/response'
import { logAudit } from '@/lib/auth/audit'
import { isAuthFailure, isParseFailure, parseJsonBody, requireAuth } from '@/lib/api/taxonomy'
import { getClientIp } from '@/lib/api/questions'
import {
  DIFFICULTY_VALUES,
  generateTestSchema,
  type GenerateTestInput,
} from '@/lib/api/tests'

type Difficulty = (typeof DIFFICULTY_VALUES)[number]

type Section = GenerateTestInput['sections'][number]

type Pick = {
  question_id: string
  difficulty: Difficulty
  section_label: string
}

// Fisher–Yates shuffle (in-place). We sample without replacement *across* the
// whole test, so once a question is picked for one section it can't appear in
// another.
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response

  const parsed = await parseJsonBody(request, generateTestSchema)
  if (isParseFailure(parsed)) return parsed.response

  const input = parsed.data

  type InsufficientDetail = {
    section_label: string
    difficulty: Difficulty
    available: number
    requested: number
  }
  const insufficient: InsufficientDetail[] = []
  const picks: Pick[] = []
  const alreadyPicked = new Set<string>()

  // Loop sections; for each (section, difficulty) bucket fetch candidate IDs,
  // exclude already-picked ones, random-sample without replacement.
  for (const section of input.sections) {
    const reqs: Array<[Difficulty, number]> = (
      ['easy', 'medium', 'hard', 'advanced'] as const
    ).flatMap((d) => {
      const n = section.blueprint[d] ?? 0
      return n > 0 ? [[d, n] as [Difficulty, number]] : []
    })

    for (const [difficulty, count] of reqs) {
      const candidates = await fetchCandidates({
        input,
        section,
        difficulty,
      })

      const eligible = candidates.filter((id) => !alreadyPicked.has(id))

      if (eligible.length < count) {
        insufficient.push({
          section_label: section.label,
          difficulty,
          available: eligible.length,
          requested: count,
        })
        continue
      }

      shuffle(eligible)
      for (let i = 0; i < count; i++) {
        const id = eligible[i]
        alreadyPicked.add(id)
        picks.push({ question_id: id, difficulty, section_label: section.label })
      }
    }
  }

  if (insufficient.length > 0) {
    return err(400, {
      code: 'INSUFFICIENT_QUESTIONS',
      message: 'Not enough questions in inventory to satisfy this blueprint',
      details: insufficient,
    })
  }

  if (picks.length === 0) {
    return err(400, {
      code: 'EMPTY_BLUEPRINT',
      message: 'Blueprint resolved to zero questions',
    })
  }

  // Preserve section order; within a section, picks are already shuffled.
  const sectionOrder = new Map(input.sections.map((s, i) => [s.label, i]))
  picks.sort((a, b) => {
    const sa = sectionOrder.get(a.section_label) ?? 0
    const sb = sectionOrder.get(b.section_label) ?? 0
    return sa - sb
  })

  const created = await prisma.$transaction(async (tx) => {
    const test = await tx.test.create({
      data: {
        title: input.title,
        course_id: input.course_id,
        subject: input.subject,
        exam_type: input.exam_type,
        duration_minutes: input.duration_minutes,
        created_by: auth.user.id,
        ...(input.instructions ? { instructions: input.instructions } : {}),
      },
    })

    await tx.testQuestion.createMany({
      data: picks.map((p, idx) => ({
        test_id: test.id,
        question_id: p.question_id,
        position: idx + 1,
        section_label: p.section_label,
      })),
    })

    return tx.test.findUnique({
      where: { id: test.id },
      include: {
        test_questions: {
          orderBy: { position: 'asc' },
          include: { question: true },
        },
      },
    })
  })

  await logAudit({
    user_id: auth.user.id,
    action: 'tests.generate',
    entity_type: 'test',
    entity_id: created!.id,
    meta: {
      actor_role: auth.payload.role,
      title: input.title,
      course_id: input.course_id,
      subject: input.subject,
      exam_type: input.exam_type,
      section_count: input.sections.length,
      question_count: picks.length,
    },
    ip_address: getClientIp(request),
  })

  return ok(created, { status: 201 })
}

async function fetchCandidates(args: {
  input: GenerateTestInput
  section: Section
  difficulty: Difficulty
}): Promise<string[]> {
  const { input, section, difficulty } = args

  const taxonomyAnd: Prisma.QuestionTaxonomyWhereInput = {
    course_id: input.course_id,
    exam_type: input.exam_type,
    ...(section.chapter_ids && section.chapter_ids.length > 0
      ? { chapter_id: { in: section.chapter_ids } }
      : {}),
    ...(section.topic_ids && section.topic_ids.length > 0
      ? { topic_id: { in: section.topic_ids } }
      : {}),
  }

  const where: Prisma.QuestionWhereInput = {
    deleted_at: null,
    subject: input.subject,
    difficulty,
    ...(section.question_type ? { question_type: section.question_type } : {}),
    question_taxonomies: { some: taxonomyAnd },
  }

  const rows = await prisma.question.findMany({
    where,
    select: { id: true },
  })
  return rows.map((r) => r.id)
}
