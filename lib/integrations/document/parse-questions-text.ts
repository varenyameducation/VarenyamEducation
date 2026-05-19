// Shared question parser used by both DOCX and PDF importers.
// Input: array of paragraph strings (already split by paragraph in the
// source-specific extractor). Output: a list of MCQ questions plus a list
// of paragraph-level parse errors.

export type ParsedMcq = {
  question_no: number | null
  section_label: string | null
  question_body: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  marks: number | null
}

export type ParseError = {
  question_no: number | null
  reason: string
}

export type ParseHeader = {
  topic?: string | null
  time_minutes?: number | null
  total_marks?: number | null
}

export type ParseResult = {
  header: ParseHeader
  questions: ParsedMcq[]
  errors: ParseError[]
  // Questions we found that weren't MCQs (no 4 options). Reported but not imported.
  skipped_non_mcq: { question_no: number | null; reason: string }[]
}

const Q_START = /^Q\s*(\d+)\s*\.?$/i
const Q_INLINE = /^Q\s*(\d+)\s*\.\s*(.+)/i
const SECTION = /^Section\s*[-–—]\s*([A-Z])/i
const MARKS_LINE = /^\[\s*(\d+(?:\.\d+)?)\s*\]$/
const ANS_MARKER = /^Ans\b/i
const DOT_LINE = /^[.…\s]+$/

function isOptionFragment(line: string): boolean {
  return /\(\s*[A-D]\s*\)/.test(line)
}

function parseOptions(text: string): { A: string; B: string; C: string; D: string } | null {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const result: Record<string, string> = {}
  const re = /\(\s*([A-D])\s*\)\s*([\s\S]*?)(?=\(\s*[A-D]\s*\)|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned))) {
    const letter = m[1].toUpperCase()
    result[letter] = m[2].trim().replace(/[,;]\s*$/, '')
  }
  if (result.A && result.B && result.C && result.D) {
    return { A: result.A, B: result.B, C: result.C, D: result.D }
  }
  return null
}

function tryParseHeaderMeta(paragraphs: string[]): ParseHeader {
  const header: ParseHeader = {}
  for (const raw of paragraphs.slice(0, 30)) {
    const p = raw.replace(/\s+/g, ' ').trim()
    const topicMatch = /^Topic\s*:\s*(.+)$/i.exec(p)
    if (topicMatch && !header.topic) header.topic = topicMatch[1].trim()
    const timeMatch = /^Time\s*:\s*(\d+)\s*min/i.exec(p)
    if (timeMatch && !header.time_minutes) header.time_minutes = Number(timeMatch[1])
    const marksMatch = /^Maximum\s+Marks\s*:\s*(\d+)/i.exec(p)
    if (marksMatch && !header.total_marks) header.total_marks = Number(marksMatch[1])
  }
  return header
}

// Walks the paragraph stream and groups into per-question blocks. Each block
// starts at a "Q<N>." marker and runs until the next question / section /
// marks indicator. Body and option text are accumulated across paragraphs.
export function parseQuestionsFromParagraphs(paragraphs: string[]): ParseResult {
  const header = tryParseHeaderMeta(paragraphs)
  const questions: ParsedMcq[] = []
  const errors: ParseError[] = []
  const skipped_non_mcq: { question_no: number | null; reason: string }[] = []

  let currentSection: string | null = null
  let cur: {
    no: number | null
    body: string[]
    options: string[]
    marks: number | null
    section: string | null
    seenAnsMarker: boolean
  } | null = null

  function finalize() {
    if (!cur) return
    if (cur.seenAnsMarker || cur.options.length === 0) {
      // No options were collected — likely short/long answer. Skip.
      skipped_non_mcq.push({
        question_no: cur.no,
        reason: 'Non-MCQ question (no A/B/C/D options detected) — schema only supports MCQs right now',
      })
      cur = null
      return
    }
    const optionsText = cur.options.join(' ')
    const opts = parseOptions(optionsText)
    if (!opts) {
      errors.push({
        question_no: cur.no,
        reason: `Could not parse 4 distinct (A)(B)(C)(D) options from: "${optionsText.slice(0, 80)}…"`,
      })
      cur = null
      return
    }
    const body = cur.body.join(' ').replace(/\s+/g, ' ').trim()
    if (!body) {
      errors.push({ question_no: cur.no, reason: 'Question body was empty' })
      cur = null
      return
    }
    questions.push({
      question_no: cur.no,
      section_label: cur.section,
      question_body: body,
      option_a: opts.A,
      option_b: opts.B,
      option_c: opts.C,
      option_d: opts.D,
      marks: cur.marks,
    })
    cur = null
  }

  for (const raw of paragraphs) {
    const p = raw.replace(/\s+/g, ' ').trim()
    if (!p) continue

    // Section header
    const sectionMatch = SECTION.exec(p)
    if (sectionMatch) {
      finalize()
      currentSection = `Section ${sectionMatch[1].toUpperCase()}`
      continue
    }

    // Question start (just "Q1." or "Q 1 .")
    const qMatch = Q_START.exec(p)
    if (qMatch) {
      finalize()
      cur = {
        no: Number(qMatch[1]),
        body: [],
        options: [],
        marks: null,
        section: currentSection,
        seenAnsMarker: false,
      }
      continue
    }

    // Question inline "Q1. body text..."
    const qInline = Q_INLINE.exec(p)
    if (qInline) {
      finalize()
      cur = {
        no: Number(qInline[1]),
        body: [qInline[2]],
        options: [],
        marks: null,
        section: currentSection,
        seenAnsMarker: false,
      }
      continue
    }

    if (!cur) continue // not inside a question yet, skip header noise

    // Marks line [1]
    const marksMatch = MARKS_LINE.exec(p)
    if (marksMatch) {
      cur.marks = Number(marksMatch[1])
      continue
    }

    // Ans marker → mark this as a short/long answer, will be skipped
    if (ANS_MARKER.test(p)) {
      cur.seenAnsMarker = true
      continue
    }

    // Dotted answer line — skip
    if (DOT_LINE.test(p)) continue

    // Option fragment
    if (isOptionFragment(p)) {
      cur.options.push(p)
      continue
    }

    // Otherwise — body continuation (only if we haven't seen options yet)
    if (cur.options.length === 0 && !cur.seenAnsMarker) {
      cur.body.push(p)
    }
  }
  finalize()

  return { header, questions, errors, skipped_non_mcq }
}
