// Shared question parser used by both DOCX and PDF importers.
// Walks a stream of paragraphs and groups them into question blocks. For
// each block it then decides whether the block is an MCQ (the last
// `(A) (B) (C) (D)` cluster in the text is treated as the option set) or a
// "subjective" question (no options cluster — short/long-answer/case-based).

export type ParsedQuestion =
  | {
      kind: 'mcq'
      question_no: number | null
      section_label: string | null
      question_body: string
      option_a: string
      option_b: string
      option_c: string
      option_d: string
      marks: number | null
    }
  | {
      kind: 'subjective'
      question_no: number | null
      section_label: string | null
      question_body: string
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
  questions: ParsedQuestion[]
  errors: ParseError[]
}

// Make the leading "Q" optional. Many boards (CBSE, ICSE, state) number
// questions without the Q prefix — "7." instead of "Q7.". After this change
// any paragraph that starts with one-or-more digits + "." is a candidate
// question start; downstream classification (options cluster, body length)
// rejects false positives.
const Q_START = /^Q?\s*(\d+)\s*\.?$/i
const Q_INLINE = /^Q?\s*(\d+)\s*\.\s*(.+)/i
const SECTION = /^Section\s*[-–—]\s*([A-Z])/i
const BONUS_HEADER = /^Bonus\s+Question/i
const MARKS_LINE = /^\[\s*(\d+(?:\.\d+)?)\s*\]$/
const ANS_MARKER = /^Ans\b/i
const DOT_LINE = /^[.…\s_]+$/

function tryParseHeaderMeta(paragraphs: string[]): ParseHeader {
  const header: ParseHeader = {}
  for (const raw of paragraphs.slice(0, 40)) {
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

// Find the LAST occurrence of an (A) (B) (C) (D) options cluster in `text`.
// Returns { startIndex, options } if a clean 4-option cluster is found, else null.
// "Last" matters for assertion-reasoning questions where (A) / (R) labels
// appear earlier in the body before the actual answer options.
function findOptionsCluster(
  text: string,
): { startIndex: number; options: { A: string; B: string; C: string; D: string } } | null {
  const cleaned = text.replace(/\s+/g, ' ')
  // Collect every (A|B|C|D) marker position.
  const markerRe = /\(\s*([A-D])\s*\)/g
  type Marker = { letter: 'A' | 'B' | 'C' | 'D'; idx: number; endIdx: number }
  const markers: Marker[] = []
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(cleaned))) {
    markers.push({
      letter: m[1].toUpperCase() as 'A' | 'B' | 'C' | 'D',
      idx: m.index,
      endIdx: markerRe.lastIndex,
    })
  }
  if (markers.length < 4) return null

  // Walk from end backward looking for a sequence A→B→C→D where the markers
  // appear in monotonically increasing letter order. Closest to end wins.
  for (let aPos = markers.length - 4; aPos >= 0; aPos--) {
    const aM = markers[aPos]
    if (aM.letter !== 'A') continue
    // Find the next B after aM
    const bM = markers.slice(aPos + 1).find((x) => x.letter === 'B')
    if (!bM) continue
    const cM = markers.slice(markers.indexOf(bM) + 1).find((x) => x.letter === 'C')
    if (!cM) continue
    const dM = markers.slice(markers.indexOf(cM) + 1).find((x) => x.letter === 'D')
    if (!dM) continue

    // Extract option texts: between this marker's end and the next marker's start.
    const A = cleaned.slice(aM.endIdx, bM.idx).trim().replace(/[,;]\s*$/, '')
    const B = cleaned.slice(bM.endIdx, cM.idx).trim().replace(/[,;]\s*$/, '')
    const C = cleaned.slice(cM.endIdx, dM.idx).trim().replace(/[,;]\s*$/, '')
    const D = cleaned
      .slice(dM.endIdx)
      .trim()
      .replace(/[,;]\s*$/, '')
      // Strip trailing junk like '[1]' if the marks indicator slipped in
      .replace(/\[\s*\d+(\.\d+)?\s*\]\s*$/, '')
      .trim()

    if (!A || !B || !C || !D) continue
    // Sanity: each option text should be reasonably short — if any is > 500 chars
    // it's probably noise (e.g. case-based body containing (A)/(B) sub-parts).
    if (A.length > 500 || B.length > 500 || C.length > 500 || D.length > 500) continue
    return { startIndex: aM.idx, options: { A, B, C, D } }
  }
  return null
}

type Block = {
  no: number | null
  section: string | null
  paragraphs: string[]
  marks: number | null
  ansMarkerSeen: boolean
}

// Walks the paragraph stream and yields per-question text blocks. Body and
// option lines are kept together; section headers, marks indicators, "Ans"
// markers, and dotted answer lines are pulled out as metadata.
//
// With Q-prefix made optional, plain numbered lines ("1. All questions are
// compulsory") would otherwise be mis-detected as Q1. Defenses:
//  (a) the matched number must be monotonically increasing from the previous
//      accepted question number (reset on Section header). For the FIRST
//      question we only accept n ≤ 5 — paper instructions typically have
//      "1." / "2." for the rubric but never start with "5." for content.
//  (b) downstream classifyBlock drops blocks whose body is too short and have
//      no options cluster (handled in classifyBlock).
function shouldAcceptQuestionNumber(
  candidate: number,
  lastAccepted: number | null,
): boolean {
  if (candidate <= 0) return false
  if (lastAccepted === null) return candidate <= 5
  return candidate > lastAccepted
}

function* iterateBlocks(paragraphs: string[]): Iterable<Block> {
  let currentSection: string | null = null
  let cur: Block | null = null
  let lastQuestionNo: number | null = null

  function* flush(): Iterable<Block> {
    if (cur) {
      yield cur
      cur = null
    }
  }

  for (const raw of paragraphs) {
    const p = raw.replace(/\s+/g, ' ').trim()
    if (!p) continue

    const sectionMatch = SECTION.exec(p)
    if (sectionMatch) {
      yield* flush()
      currentSection = `Section ${sectionMatch[1].toUpperCase()}`
      lastQuestionNo = null
      continue
    }
    if (BONUS_HEADER.test(p)) {
      yield* flush()
      currentSection = 'Bonus'
      lastQuestionNo = null
      continue
    }

    const qMatch = Q_START.exec(p)
    if (qMatch) {
      const n = Number(qMatch[1])
      if (shouldAcceptQuestionNumber(n, lastQuestionNo)) {
        yield* flush()
        cur = {
          no: n,
          section: currentSection,
          paragraphs: [],
          marks: null,
          ansMarkerSeen: false,
        }
        lastQuestionNo = n
        continue
      }
      // Non-monotonic / out-of-range — fall through and treat as body text.
    }
    const qInline = Q_INLINE.exec(p)
    if (qInline) {
      const n = Number(qInline[1])
      if (shouldAcceptQuestionNumber(n, lastQuestionNo)) {
        yield* flush()
        cur = {
          no: n,
          section: currentSection,
          paragraphs: [qInline[2]],
          marks: null,
          ansMarkerSeen: false,
        }
        lastQuestionNo = n
        continue
      }
      // Otherwise: not a real question start (likely "1. All questions are
      // compulsory" instruction). Fall through to body-line handling so the
      // text isn't lost from a preceding question.
    }

    if (!cur) continue

    const marksMatch = MARKS_LINE.exec(p)
    if (marksMatch) {
      cur.marks = Number(marksMatch[1])
      continue
    }
    if (ANS_MARKER.test(p)) {
      cur.ansMarkerSeen = true
      continue
    }
    if (DOT_LINE.test(p)) continue
    cur.paragraphs.push(p)
  }
  yield* flush()
}

// Minimum body length (in chars) to accept a question that has NO options
// cluster. Short bodies without options are almost always parser misfires
// — instruction lines like "1. All questions are compulsory" or stray
// section headers. Real subjective questions are routinely > 30 chars; we
// give a generous floor of 20.
const MIN_BODY_LEN_WITHOUT_OPTIONS = 20

function classifyBlock(block: Block): ParsedQuestion | null {
  const allText = block.paragraphs.join(' ').replace(/\s+/g, ' ').trim()
  if (!allText) return null

  const cluster = findOptionsCluster(allText)
  if (cluster) {
    const body = allText.slice(0, cluster.startIndex).trim().replace(/[:.\s]+$/, '')
    return {
      kind: 'mcq',
      question_no: block.no,
      section_label: block.section,
      question_body: body || allText,
      option_a: cluster.options.A,
      option_b: cluster.options.B,
      option_c: cluster.options.C,
      option_d: cluster.options.D,
      marks: block.marks,
    }
  }

  // No options cluster — only accept if the body is substantive enough to
  // plausibly be a real question. Filters instruction-line false positives.
  if (allText.length < MIN_BODY_LEN_WITHOUT_OPTIONS) return null

  return {
    kind: 'subjective',
    question_no: block.no,
    section_label: block.section,
    question_body: allText,
    marks: block.marks,
  }
}

export function parseQuestionsFromParagraphs(paragraphs: string[]): ParseResult {
  const header = tryParseHeaderMeta(paragraphs)
  const questions: ParsedQuestion[] = []
  const errors: ParseError[] = []

  for (const block of iterateBlocks(paragraphs)) {
    const q = classifyBlock(block)
    if (!q) {
      errors.push({ question_no: block.no, reason: 'Question had no body text' })
      continue
    }
    questions.push(q)
  }

  return { header, questions, errors }
}
