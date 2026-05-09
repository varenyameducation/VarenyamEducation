import * as XLSX from 'xlsx'
import { questionBaseSchema, type QuestionBaseInput } from '@/lib/validation/question'

export type ParsedRow = QuestionBaseInput & {
  course_name: string
  chapter_name: string
  topic_name: string
  image_filename?: string
}

export type ParseError = { row: number; reason: string }

export type ParseResult = {
  rows: ParsedRow[]
  errors: ParseError[]
}

const EXPECTED_COLUMNS = [
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
] as const

type Raw = Record<string, unknown>

function parseCorrectOption(value: unknown): string[] | undefined {
  if (value == null || value === '') return undefined
  const str = String(value).trim()
  if (!str) return undefined
  return str
    .split(/[,;|]/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
}

function toNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

function trimStr(value: unknown): string | undefined {
  if (value == null) return undefined
  const s = String(value).trim()
  return s ? s : undefined
}

export function parseQuestionsExcel(buffer: Buffer | ArrayBuffer): ParseResult {
  const rows: ParsedRow[] = []
  const errors: ParseError[] = []

  const data =
    buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const workbook = XLSX.read(data, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { rows, errors: [{ row: 0, reason: 'Workbook has no sheets' }] }
  }
  const sheet = workbook.Sheets[sheetName]
  const records = XLSX.utils.sheet_to_json<Raw>(sheet, { defval: '', raw: true })

  records.forEach((record, idx) => {
    const rowNumber = idx + 2

    const courseName = trimStr(record.course_name)
    const chapterName = trimStr(record.chapter_name)
    const topicName = trimStr(record.topic_name)

    if (!courseName || !chapterName || !topicName) {
      errors.push({ row: rowNumber, reason: 'course_name / chapter_name / topic_name are required' })
      return
    }

    const candidate = {
      course_id: '00000000-0000-0000-0000-000000000000',
      chapter_id: '00000000-0000-0000-0000-000000000000',
      topic_id: '00000000-0000-0000-0000-000000000000',
      subject: trimStr(record.subject) as unknown,
      question_type: trimStr(record.question_type) as unknown,
      difficulty: trimStr(record.difficulty) as unknown,
      exam_type: trimStr(record.exam_type) as unknown,
      marks_correct: toNumber(record.marks_correct) ?? 0,
      marks_negative: toNumber(record.marks_negative) ?? 0,
      question_body: trimStr(record.question_body) ?? '',
      option_a: trimStr(record.option_a),
      option_b: trimStr(record.option_b),
      option_c: trimStr(record.option_c),
      option_d: trimStr(record.option_d),
      correct_option: parseCorrectOption(record.correct_option),
      numerical_answer: toNumber(record.numerical_answer),
      solution: trimStr(record.solution),
      explanation: trimStr(record.explanation),
    }

    const result = questionBaseSchema.safeParse(candidate)
    if (!result.success) {
      const issue = result.error.issues[0]
      const reason = issue
        ? `${issue.path.join('.') || '(row)'}: ${issue.message}`
        : 'unknown validation error'
      errors.push({ row: rowNumber, reason })
      return
    }

    rows.push({
      ...result.data,
      course_name: courseName,
      chapter_name: chapterName,
      topic_name: topicName,
      image_filename: trimStr(record.image_filename),
    })
  })

  return { rows, errors }
}

export { EXPECTED_COLUMNS }
