/**
 * Seed sample courses, chapters, and topics for the M2M-taxonomy sprint.
 *
 * Re-runnable: finds existing rows by (name + grade + stream) / (course_id +
 * name) / (chapter_id + name) and updates instead of inserting duplicates.
 * Prints IDs at the end so the operator can paste them straight into the
 * import dialog without UI clicking.
 *
 * Run:
 *   node scripts/seed-taxonomy.mjs
 *
 * Requires .env.local with DATABASE_URL.
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
loadEnvLocal()

const prisma = new PrismaClient()

const COURSES = [
  {
    name: 'Class 8 — CBSE',
    grade: 8,
    stream: 'School',
    description: 'Sample CBSE course for M2M-taxonomy testing.',
    chapter: {
      name: 'Algebra Play',
      subject: 'Maths',
      chapter_no: 1,
      topic: { name: 'Number Pyramids', topic_no: 1 },
    },
  },
  {
    name: 'Class 8 — ICSE',
    grade: 8,
    stream: 'School',
    description: 'Sample ICSE course for M2M-taxonomy testing.',
    chapter: {
      name: 'Algebra Play',
      subject: 'Maths',
      chapter_no: 1,
      topic: { name: 'Number Pyramids', topic_no: 1 },
    },
  },
]

async function upsertCourse(spec) {
  const existing = await prisma.course.findFirst({
    where: {
      name: spec.name,
      grade: spec.grade,
      stream: spec.stream,
      deleted_at: null,
    },
  })
  if (existing) {
    return prisma.course.update({
      where: { id: existing.id },
      data: { description: spec.description, is_active: true },
    })
  }
  return prisma.course.create({
    data: {
      name: spec.name,
      grade: spec.grade,
      stream: spec.stream,
      description: spec.description,
      is_active: true,
    },
  })
}

async function upsertChapter(course_id, spec) {
  const existing = await prisma.chapter.findFirst({
    where: { course_id, name: spec.name, deleted_at: null },
  })
  if (existing) {
    return prisma.chapter.update({
      where: { id: existing.id },
      data: {
        subject: spec.subject,
        chapter_no: spec.chapter_no,
        is_active: true,
      },
    })
  }
  return prisma.chapter.create({
    data: {
      course_id,
      name: spec.name,
      subject: spec.subject,
      chapter_no: spec.chapter_no,
      is_active: true,
    },
  })
}

async function upsertTopic(chapter_id, spec) {
  const existing = await prisma.topic.findFirst({
    where: { chapter_id, name: spec.name, deleted_at: null },
  })
  if (existing) {
    return prisma.topic.update({
      where: { id: existing.id },
      data: { topic_no: spec.topic_no, is_active: true },
    })
  }
  return prisma.topic.create({
    data: {
      chapter_id,
      name: spec.name,
      topic_no: spec.topic_no,
      is_active: true,
    },
  })
}

async function main() {
  const rows = []
  for (const spec of COURSES) {
    const course = await upsertCourse(spec)
    const chapter = await upsertChapter(course.id, spec.chapter)
    const topic = await upsertTopic(chapter.id, spec.chapter.topic)
    rows.push({
      course: { id: course.id, name: course.name },
      chapter: { id: chapter.id, name: chapter.name },
      topic: { id: topic.id, name: topic.name },
    })
  }

  console.log('\nSeeded taxonomy:')
  for (const r of rows) {
    console.log(`\n  ${r.course.name}`)
    console.log(`    course_id   = ${r.course.id}`)
    console.log(`    chapter_id  = ${r.chapter.id}    (${r.chapter.name})`)
    console.log(`    topic_id    = ${r.topic.id}    (${r.topic.name})`)
  }
  console.log('\nDone.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
