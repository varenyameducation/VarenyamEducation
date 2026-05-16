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
// question start; downstream guards (monotonic numbering, body-length-and-
// options-cluster check in classifyBlock) reject false positives like
// "1. All questions are compulsory".
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

// Maximum characters allowed in any single MCQ option. Real CBSE/ICSE/JEE
// options never exceed this; longer is almost always Option D having
// absorbed the next question's body because the source paper's question
// boundary got swallowed during text extraction.
const MAX_OPTION_CHARS = 300

// Find the LAST occurrence of an (A) (B) (C) (D) options cluster in `text`.
// Returns { startIndex, options } if a clean 4-option cluster is found, else null.
// "Last" matters for assertion-reasoning questions where (A) / (R) labels
// appear earlier in the body before the actual answer options.
//
// `currentQuestionNo`, when known, lets us bound Option D's text at the next
// question's number marker (e.g. " 8. ") rather than running it to the end
// of the cleaned text. Without this bound, Q7's Option D will absorb Q8/Q9
// bodies when they were merged into Q7's block by an over-greedy
// iterateBlocks pass (typically caused by PDF text extraction collapsing a
// newline before "8." into a space).
function findOptionsCluster(
  text: string,
  currentQuestionNo?: number | null,
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

    // Determine Option D's end. Default: end of cleaned text. Then trim back
    // at the first next-question-number marker (whitespace + digits + dot +
    // whitespace, where the number is > currentQuestionNo if known). Then
    // apply the hard 300-char cap as a fallback.
    let dEnd = cleaned.length
    const nextQRe = /\s(\d{1,3})\s*\.\s/g
    nextQRe.lastIndex = dM.endIdx
    let nq: RegExpExecArray | null
    while ((nq = nextQRe.exec(cleaned))) {
      const candidateNo = Number(nq[1])
      if (currentQuestionNo == null || candidateNo > currentQuestionNo) {
        dEnd = nq.index
        break
      }
    }
    if (dEnd - dM.endIdx > MAX_OPTION_CHARS) {
      dEnd = dM.endIdx + MAX_OPTION_CHARS
    }

    // Extract option texts: between this marker's end and the next marker's start.
    const A = cleaned.slice(aM.endIdx, bM.idx).trim().replace(/[,;]\s*$/, '')
    const B = cleaned.slice(bM.endIdx, cM.idx).trim().replace(/[,;]\s*$/, '')
    const C = cleaned.slice(cM.endIdx, dM.idx).trim().replace(/[,;]\s*$/, '')
    const D = cleaned
      .slice(dM.endIdx, dEnd)
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
//      no options cluster (handled there).
function shouldAcceptQuestionNumber(
  candidate: number,
  lastAccepted: number | null,
): boolean {
  if (candidate <= 0) return false
  if (lastAccepted === null) return candidate <= 5
  return candidate > lastAccepted
}

// Minimum joined-body-text length for the *current* block to be considered
// real enough to anchor monotonic numbering. A block whose only "body" so
// far is a single digit or letter is almost certainly the parser drifting
// through a layout table — we use the pre-cur baseline instead.
const MIN_BODY_FOR_MONOTONIC_ANCHOR = 20

function joinedBodyLen(block: Block | null): number {
  if (!block) return 0
  return block.paragraphs.join(' ').trim().length
}

function* iterateBlocks(paragraphs: string[]): Iterable<Block> {
  let currentSection: string | null = null
  let cur: Block | null = null
  let lastQuestionNo: number | null = null
  // Snapshot of lastQuestionNo from BEFORE we set cur. Used to roll back
  // when a block flushes with thin or no body — that's a false-positive
  // question start (e.g. a lone "1." instruction marker or a layout-table
  // cell), and we don't want it poisoning the monotonicity baseline for
  // later candidates.
  let lastQuestionNoBeforeCur: number | null = null

  function* flush(): Iterable<Block> {
    if (cur) {
      if (joinedBodyLen(cur) < MIN_BODY_FOR_MONOTONIC_ANCHOR) {
        lastQuestionNo = lastQuestionNoBeforeCur
      }
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

    // If the open `cur` block hasn't accumulated a real body yet, its
    // question number is unreliable — likely a lonely "1." marker or a
    // layout-table cell. Use the pre-cur baseline for the monotonicity
    // check so a "7." following an unreliable "1" is still rejected when
    // there is nothing real before it in the doc.
    const effectiveLastQNo: number | null =
      joinedBodyLen(cur) < MIN_BODY_FOR_MONOTONIC_ANCHOR
        ? lastQuestionNoBeforeCur
        : lastQuestionNo

    const qMatch = Q_START.exec(p)
    if (qMatch) {
      const n = Number(qMatch[1])
      if (shouldAcceptQuestionNumber(n, effectiveLastQNo)) {
        yield* flush()
        cur = {
          no: n,
          section: currentSection,
          paragraphs: [],
          marks: null,
          ansMarkerSeen: false,
        }
        lastQuestionNoBeforeCur = effectiveLastQNo
        lastQuestionNo = n
        continue
      }
    }
    const qInline = Q_INLINE.exec(p)
    if (qInline) {
      const n = Number(qInline[1])
      if (shouldAcceptQuestionNumber(n, effectiveLastQNo)) {
        yield* flush()
        cur = {
          no: n,
          section: currentSection,
          paragraphs: [qInline[2]],
          marks: null,
          ansMarkerSeen: false,
        }
        lastQuestionNoBeforeCur = effectiveLastQNo
        lastQuestionNo = n
        continue
      }
      // Otherwise: not a real question start (likely an instruction line);
      // fall through so it can attach to the previous question if any.
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

  const cluster = findOptionsCluster(allText, block.no)
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
