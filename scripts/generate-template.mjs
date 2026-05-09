#!/usr/bin/env node
// Regenerate public/templates/question-import-template.xlsx
// Run with: node scripts/generate-template.mjs
// Column order MUST match lib/integrations/excel/parse-questions.ts.

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const HEADERS = [
  'course_name',
  'chapter_name',
  'topic_name',
  'subject',
  'question_type',
  'difficulty',
  'exam_type',
  'marks_correct',
  'marks_negative',
  'question_body',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'correct_option',
  'numerical_answer',
  'solution',
  'explanation',
  'image_filename',
]

const EXAMPLE_MCQ = [
  'Class 11 PCM',
  'Laws of Motion',
  "Newton's Third Law",
  'Physics',
  'mcq',
  'medium',
  'jee',
  4,
  1,
  'A block of mass 2 kg rests on a frictionless surface. A horizontal force of 10 N is applied. What is the magnitude of the reaction force the block exerts on the agent applying the force?',
  '5 N',
  '10 N',
  '15 N',
  '20 N',
  'A',
  '',
  'By Newton\'s third law, the reaction force is equal in magnitude and opposite in direction to the applied force, so it is 10 N.',
  'Action and reaction forces are equal in magnitude regardless of the masses involved.',
  '',
]

const EXAMPLE_NUMERICAL = [
  'Class 11 PCM',
  'Laws of Motion',
  "Newton's Third Law",
  'Physics',
  'numerical',
  'hard',
  'jee',
  4,
  1,
  'A particle in free fall near the surface of the earth accelerates at g. Find the value of g in m/s^2 (round to two decimals).',
  '',
  '',
  '',
  '',
  '',
  9.81,
  'Standard gravity at the earth\'s surface is approximately 9.81 m/s^2.',
  'g varies slightly with latitude and altitude; 9.81 is the conventional reference value.',
  '',
]

const __filename = fileURLToPath(import.meta.url)
const projectRoot = resolve(dirname(__filename), '..')
const outPath = resolve(projectRoot, 'public/templates/question-import-template.xlsx')

mkdirSync(dirname(outPath), { recursive: true })

const ws = XLSX.utils.aoa_to_sheet([HEADERS, EXAMPLE_MCQ, EXAMPLE_NUMERICAL])

const widths = HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }))
widths[HEADERS.indexOf('question_body')] = { wch: 60 }
widths[HEADERS.indexOf('solution')] = { wch: 50 }
widths[HEADERS.indexOf('explanation')] = { wch: 40 }
ws['!cols'] = widths

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'questions')
XLSX.writeFile(wb, outPath)

console.log(`Wrote ${outPath}`)
