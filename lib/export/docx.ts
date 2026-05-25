import {
  Document,
  Header,
  Footer,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  BorderStyle,
  PageNumber,
  ShadingType,
  Tab,
  Table,
  TableRow,
  TableCell,
  TabStopType,
  WidthType,
  type ISectionOptions,
  type ParagraphChild,
} from 'docx'
import katex from 'katex'
import sharp from 'sharp'
import { getInstituteBranding, getTestWithQuestions, type Branding, type TestWithQuestions } from './branding'

// Single-token LaTeX detection — anything with a backslash command or a
// dollar-delimited math run gets the KaTeX→PNG treatment.
const LATEX_HINT = /\\[a-zA-Z]+|\$[^$]+\$/

const PNG_PIXEL_WIDTH = 600

// Greys mirror the PaperTemplate so docx + pdf read the same.
const COLOR_TEXT = '1A1A1A'
const COLOR_MUTED = '666666'

function brandColorHex(branding: Branding): string {
  return (branding.brand_color_hex || '1B3A6B').replace(/^#/, '').toUpperCase()
}

// A very light tint of brand color for the instructions box background — mixes
// 8% brand with white. Returns an uppercased 6-char hex (docx wants no '#').
function brandTintHex(brandHex: string): string {
  const m = /^([0-9a-fA-F]{6})$/.exec(brandHex)
  if (!m) return 'F4F6FA'
  const r = parseInt(brandHex.slice(0, 2), 16)
  const g = parseInt(brandHex.slice(2, 4), 16)
  const b = parseInt(brandHex.slice(4, 6), 16)
  const mix = (c: number) => Math.round(c * 0.08 + 255 * 0.92)
  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()
  return `${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`
}

export async function renderLatexToPng(latex: string): Promise<Buffer> {
  const mathHtml = katex.renderToString(latex, {
    output: 'mathml',
    throwOnError: true,
    displayMode: false,
    strict: 'ignore',
  })

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml"
     width="${PNG_PIXEL_WIDTH}" height="80">
  <foreignObject width="100%" height="100%">
    <xhtml:div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'Latin Modern Math', serif; font-size: 18px;">
      ${mathHtml}
    </xhtml:div>
  </foreignObject>
</svg>`

  return sharp(Buffer.from(svg))
    .resize({ width: PNG_PIXEL_WIDTH, withoutEnlargement: true })
    .png()
    .toBuffer()
}

async function inlineRuns(source: string | null | undefined): Promise<ParagraphChild[]> {
  if (!source) return []
  if (!LATEX_HINT.test(source)) {
    return [new TextRun(source)]
  }
  try {
    const png = await renderLatexToPng(source)
    const meta = await sharp(png).metadata()
    return [
      new ImageRun({
        type: 'png',
        data: png,
        transformation: {
          width: Math.min(meta.width ?? PNG_PIXEL_WIDTH, PNG_PIXEL_WIDTH),
          height: Math.min(meta.height ?? 40, 60),
        },
      }),
    ]
  } catch {
    return [new TextRun(source)]
  }
}

const IMG_PLACEHOLDER_RE = /\[\[IMG:([^\]]+)\]\]/g
// 4cm ≈ 113px at 72 DPI. docx transformation widths are in pixels at 96 DPI;
// height cap of ~150px keeps inline images at ~4cm visual height.
const DOC_IMAGE_MAX_W = 420
const DOC_IMAGE_MAX_H = 150

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

async function imageParagraph(url: string): Promise<Paragraph | null> {
  const buf = await fetchImageBuffer(url)
  if (!buf) return null
  try {
    const png = await sharp(buf).png().toBuffer()
    const meta = await sharp(png).metadata()
    const w0 = meta.width ?? DOC_IMAGE_MAX_W
    const h0 = meta.height ?? Math.round(DOC_IMAGE_MAX_W * 0.6)
    // Honor both width and height caps so a tall figure doesn't blow past 4cm.
    const widthScale = w0 > DOC_IMAGE_MAX_W ? DOC_IMAGE_MAX_W / w0 : 1
    const heightScale = h0 > DOC_IMAGE_MAX_H ? DOC_IMAGE_MAX_H / h0 : 1
    const scale = Math.min(widthScale, heightScale)
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 80 },
      children: [
        new ImageRun({
          type: 'png',
          data: png,
          transformation: {
            width: Math.round(w0 * scale),
            height: Math.round(h0 * scale),
          },
        }),
      ],
    })
  } catch {
    return null
  }
}

async function buildBodyParagraphs(
  body: string | null | undefined,
): Promise<Paragraph[]> {
  if (!body) return []
  const out: Paragraph[] = []
  IMG_PLACEHOLDER_RE.lastIndex = 0
  let last = 0
  let m: RegExpExecArray | null
  let sawImg = false
  while ((m = IMG_PLACEHOLDER_RE.exec(body))) {
    sawImg = true
    if (m.index > last) {
      const seg = body.slice(last, m.index)
      if (seg.trim()) {
        out.push(new Paragraph({ indent: { left: 720 }, children: await inlineRuns(seg) }))
      }
    }
    const imgP = await imageParagraph(m[1])
    if (imgP) {
      out.push(imgP)
    } else {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: '[image]', italics: true, color: COLOR_MUTED }),
          ],
        }),
      )
    }
    last = IMG_PLACEHOLDER_RE.lastIndex
  }
  if (!sawImg) {
    return [new Paragraph({ indent: { left: 720 }, children: await inlineRuns(body) })]
  }
  if (last < body.length) {
    const seg = body.slice(last)
    if (seg.trim()) {
      out.push(new Paragraph({ indent: { left: 720 }, children: await inlineRuns(seg) }))
    }
  }
  return out
}

function buildHeaderBlock(branding: Branding): Paragraph[] {
  const accent = brandColorHex(branding)
  const out: Paragraph[] = []
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({
          text: branding.inst_name,
          bold: true,
          color: accent,
          size: 36, // 18pt → docx uses half-points
        }),
      ],
    }),
  )
  if (branding.tagline) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 100 },
        children: [
          new TextRun({ text: branding.tagline, italics: true, size: 22, color: COLOR_MUTED }),
        ],
      }),
    )
  }
  // Brand-color divider via a thick bottom border on an empty paragraph.
  out.push(
    new Paragraph({
      spacing: { before: 0, after: 120 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, space: 1, color: accent },
      },
      children: [],
    }),
  )
  return out
}

function buildMetaBlock(branding: Branding, test: TestWithQuestions, totalMarks: number): Paragraph[] {
  const accent = brandColorHex(branding)
  const leftBits: string[] = []
  if (test.course?.name) leftBits.push(`Course: ${test.course.name}`)
  const centerBits: string[] = []
  if (test.subject) centerBits.push(`Subject: ${test.subject}`)
  if (test.exam_type) centerBits.push(`Exam: ${test.exam_type.toUpperCase()}`)
  const rightBits: string[] = [
    `Duration: ${test.duration_minutes} min`,
    `Max Marks: ${totalMarks}`,
  ]
  const metaLine = [leftBits.join(' '), centerBits.join(' · '), rightBits.join(' · ')]
    .filter(Boolean)
    .join('    ·    ')

  const out: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 100 },
      children: [new TextRun({ text: metaLine, size: 20, color: COLOR_TEXT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, space: 2, color: accent },
      },
      children: [
        new TextRun({
          text: (test.title || 'Untitled Test').toUpperCase(),
          bold: true,
          size: 28, // 14pt
          color: COLOR_TEXT,
        }),
      ],
    }),
  ]
  if (test.instructions) {
    out.push(
      new Paragraph({
        spacing: { before: 0, after: 60 },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: brandTintHex(accent) },
        border: {
          left: { style: BorderStyle.SINGLE, size: 18, space: 6, color: accent },
        },
        children: [
          new TextRun({
            text: 'GENERAL INSTRUCTIONS',
            bold: true,
            size: 18,
            color: accent,
          }),
        ],
      }),
      new Paragraph({
        spacing: { before: 0, after: 200 },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: brandTintHex(accent) },
        border: {
          left: { style: BorderStyle.SINGLE, size: 18, space: 6, color: accent },
        },
        children: [
          new TextRun({ text: test.instructions, size: 20, color: COLOR_TEXT }),
        ],
      }),
    )
  }
  return out
}

function buildSectionHeader(label: string, summary: string, branding: Branding): Paragraph[] {
  const accent = brandColorHex(branding)
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 220, after: 0 },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: accent },
      children: [
        new TextRun({
          text: label.toUpperCase(),
          bold: true,
          color: 'FFFFFF',
          size: 24,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 120 },
      children: [
        new TextRun({ text: summary, italics: true, size: 18, color: COLOR_MUTED }),
      ],
    }),
  ]
}

function sectionBlueprintSummary(
  rows: TestWithQuestions['test_questions'],
  startIndex: number,
): string {
  if (rows.length === 0) return ''
  const endIndex = startIndex + rows.length - 1
  const marks = rows.map((r) => {
    const m = r.marks_override != null ? Number(r.marks_override) : Number(r.question.marks_correct)
    return Number.isFinite(m) ? m : 0
  })
  const total = marks.reduce((a, b) => a + b, 0)
  const uniform = marks.every((m) => m === marks[0]) ? marks[0] : null
  const range = startIndex === endIndex ? `Q${startIndex}` : `Q${startIndex}–Q${endIndex}`
  if (uniform != null) return `(${range} · ${rows.length} × ${uniform} = ${total} marks)`
  return `(${range} · ${rows.length} questions · ${total} marks)`
}

async function buildMcqTable(
  branding: Branding,
  q: TestWithQuestions['test_questions'][number]['question'],
): Promise<Table> {
  const optionLetters: Array<['a', 'A'] | ['b', 'B'] | ['c', 'C'] | ['d', 'D']> = [
    ['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D'],
  ]
  const cells: TableCell[] = []
  for (const [keyLower, keyUpper] of optionLetters) {
    const value = (q as Record<string, unknown>)[`option_${keyLower}`]
    const runs: ParagraphChild[] = [new TextRun({ text: `(${keyUpper}) `, bold: true })]
    if (typeof value === 'string' && value) {
      runs.push(...(await inlineRuns(value)))
    } else {
      runs.push(new TextRun({ text: '—', color: COLOR_MUTED }))
    }
    cells.push(
      new TableCell({
        width: { size: '50%', type: WidthType.PERCENTAGE },
        borders: blankCellBorders(),
        children: [new Paragraph({ children: runs })],
      }),
    )
  }
  // Two cells per row → two rows total.
  const rows: TableRow[] = [
    new TableRow({ children: [cells[0], cells[1]] }),
    new TableRow({ children: [cells[2], cells[3]] }),
  ]
  void branding
  return new Table({
    width: { size: '100%', type: WidthType.PERCENTAGE },
    indent: { size: 720, type: WidthType.DXA },
    rows,
  })
}

function blankCellBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const
  return { top: none, bottom: none, left: none, right: none, start: none, end: none }
}

function answerLineParagraphs(qtype: string, marks: number): Paragraph[] {
  let n: number
  if (qtype === 'numerical') n = 1
  else if (qtype === 'matrix_match') n = 0
  else n = Math.min(6, Math.max(2, Math.ceil(marks * 2)))
  const out: Paragraph[] = []
  for (let i = 0; i < n; i++) {
    out.push(
      new Paragraph({
        spacing: { before: 60, after: 0 },
        indent: { left: 720 },
        border: { bottom: { style: BorderStyle.DOTTED, size: 6, space: 1, color: 'BBBBBB' } },
        children: [new TextRun({ text: '' })],
      }),
    )
  }
  return out
}

async function buildQuestionParagraphs(
  test: TestWithQuestions,
  branding: Branding,
): Promise<Array<Paragraph | Table>> {
  const out: Array<Paragraph | Table> = []
  // Group by section_label so we can render brand-bar headers + blueprint summary.
  type Group = { label: string | null; rows: TestWithQuestions['test_questions'] }
  const groups: Group[] = []
  for (const row of test.test_questions) {
    const label = row.section_label?.trim() || null
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.rows.push(row)
    else groups.push({ label, rows: [row] })
  }

  let runningIndex = 1
  for (const group of groups) {
    if (group.label) {
      out.push(...buildSectionHeader(group.label, sectionBlueprintSummary(group.rows, runningIndex), branding))
    }
    for (const row of group.rows) {
      const q = row.question
      const marksRaw = row.marks_override ?? q.marks_correct
      const marksNum = Number(marksRaw) || 0
      const indexNum = runningIndex
      runningIndex += 1

      out.push(
        new Paragraph({
          spacing: { before: 160, after: 40 },
          tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
          children: [
            new TextRun({ text: `Q${indexNum}.`, bold: true, color: COLOR_TEXT }),
            new TextRun({ children: [new Tab()] }),
            new TextRun({ text: `[${String(marksRaw)}]`, color: COLOR_MUTED }),
          ],
        }),
      )

      const bodyParas = await buildBodyParagraphs(q.question_body)
      out.push(...bodyParas)

      if (q.question_type === 'mcq' || q.question_type === 'multi_select') {
        out.push(await buildMcqTable(branding, q))
      } else {
        out.push(...answerLineParagraphs(q.question_type, marksNum))
      }
    }
  }
  return out
}

function buildFooter(branding: Branding): Footer {
  const accent = brandColorHex(branding)
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 6, space: 4, color: accent } },
        children: [
          new TextRun({ text: branding.footer_text, size: 16, color: COLOR_MUTED }),
          new TextRun({ text: '  ·  ', size: 16, color: COLOR_MUTED }),
          new TextRun({ text: branding.inst_name, size: 16, color: COLOR_MUTED }),
          new TextRun({ text: '  ·  ', size: 16, color: COLOR_MUTED }),
          new TextRun({ text: 'Page ', size: 16, color: COLOR_MUTED }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLOR_MUTED }),
          new TextRun({ text: ' of ', size: 16, color: COLOR_MUTED }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: COLOR_MUTED }),
        ],
      }),
    ],
  })
}

function buildRunningHeader(branding: Branding): Header {
  // Subsequent-page running header — minimal, brand-colored line so the
  // body's full branded block on page 1 isn't repeated noisily.
  const accent = brandColorHex(branding)
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, space: 2, color: accent } },
        children: [
          new TextRun({ text: branding.inst_name, size: 16, color: accent, bold: true }),
          ...(branding.tagline
            ? [
                new TextRun({ text: '   ' + branding.tagline, size: 14, italics: true, color: COLOR_MUTED }),
              ]
            : []),
        ],
      }),
    ],
  })
}

function computeTotalMarks(test: TestWithQuestions): number {
  let total = 0
  for (const tq of test.test_questions) {
    const m = tq.marks_override != null ? Number(tq.marks_override) : Number(tq.question.marks_correct)
    if (Number.isFinite(m)) total += m
  }
  return total
}

export async function generateTestDOCX(testId: string): Promise<Buffer> {
  const test = await getTestWithQuestions(testId)
  if (!test) throw new Error(`Test ${testId} not found`)

  const branding = await getInstituteBranding()
  const totalMarks = computeTotalMarks(test)

  const section: ISectionOptions = {
    properties: {},
    headers: { default: buildRunningHeader(branding) },
    footers: { default: buildFooter(branding) },
    children: [
      ...buildHeaderBlock(branding),
      ...buildMetaBlock(branding, test, totalMarks),
      ...(await buildQuestionParagraphs(test, branding)),
    ],
  }

  const doc = new Document({ sections: [section] })
  return Packer.toBuffer(doc) as Promise<Buffer>
}
