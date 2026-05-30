import {
  Document,
  Header,
  Footer,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  ImportedXmlComponent,
  AlignmentType,
  BorderStyle,
  PageNumber,
  ShadingType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  type ISectionOptions,
  type ParagraphChild,
} from 'docx'
import katex from 'katex'
import { mml2omml } from 'mathml2omml'
import sharp from 'sharp'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { splitBody } from '@/lib/ui/render-body-html'
import { getInstituteBranding, getTestWithQuestions, type Branding, type TestWithQuestions } from './branding'

// Brand palette — locked by orchestrator; hex values without `#` for docx.
const BRAND_DEFAULT = '0E6E84' // primary teal
const BRAND_LEGACY = '1B3A6B' // old navy default — treat as missing
const BRAND_RED = 'D63D2F'
const COLOR_TEXT = '1F2937'
const COLOR_SUBTLE = '6B7280'
const COLOR_HAIRLINE = 'D1D5DB'

function brandColorHex(branding: Branding): string {
  const raw = (branding.brand_color_hex ?? '').replace(/^#/, '').toUpperCase()
  if (!raw || raw === BRAND_LEGACY) return BRAND_DEFAULT
  return raw
}

function brandTintHex(brandHex: string): string {
  const m = /^([0-9a-fA-F]{6})$/.exec(brandHex)
  if (!m) return 'F4F6FA'
  const r = parseInt(brandHex.slice(0, 2), 16)
  const g = parseInt(brandHex.slice(2, 4), 16)
  const b = parseInt(brandHex.slice(4, 6), 16)
  const mix = (c: number) => Math.round(c * 0.1 + 255 * 0.9)
  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()
  return `${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`
}

// Load the bundled Varenyam icon-only mark off disk. Cached for the process.
let cachedLogo: Buffer | null = null
function readBrandLogoBuffer(): Buffer | null {
  if (cachedLogo) return cachedLogo
  try {
    const p = path.join(process.cwd(), 'public', 'brand', 'varenyam-logo-mark.png')
    cachedLogo = fs.readFileSync(p)
    return cachedLogo
  } catch {
    return null
  }
}

// Render math as NATIVE Word equations (OOXML OMath), not raster images.
// Pipeline: LaTeX --katex--> MathML --mathml2omml--> OMML, embedded as raw
// XML via docx's ImportedXmlComponent. OMath scales with the font, is
// editable in Word's equation editor, and adds no media files — unlike the
// previous MathJax-SVG-to-PNG approach, which the user rejected for shipping
// oversized raster blocks instead of real equations.
//
// Note: mathml2omml@0.5.0 (latest published) exposes a NAMED export
// `mml2omml(mathmlString) -> ommlString`, not the default export the original
// plan assumed; the call below uses the real API. Its output already starts
// with <m:oMath>, so no extra wrapping is needed in practice.
function latexToOmathXml(tex: string, display: boolean): string | null {
  try {
    const mathml = katex.renderToString(tex, {
      output: 'mathml',
      throwOnError: true,
      displayMode: display,
      strict: 'ignore',
    })
    // katex wraps output in <span class="katex"><math>...</math></span>.
    // Extract the inner <math> element — mathml2omml expects a pure MathML root.
    const inner = mathml.match(/<math[\s\S]*?<\/math>/)?.[0]
    if (!inner) return null
    return mml2omml(inner)
  } catch {
    return null
  }
}

function mathRunFromLatex(tex: string, display: boolean): ImportedXmlComponent | null {
  const omath = latexToOmathXml(tex, display)
  if (!omath) return null
  // Word expects OMath wrapped in <m:oMath> (mathml2omml already emits this).
  // Guard anyway in case a future version returns a bare child element.
  const wrapped = /^<m:oMath/.test(omath)
    ? omath
    : `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${omath}</m:oMath>`
  try {
    return ImportedXmlComponent.fromXmlString(wrapped)
  } catch {
    return null
  }
}

// Walk the body through the canonical splitter so `\(...\)`, `\[...\]`,
// `$$...$$` segments each become their own native OMath equation, and prose
// stays as plain text runs. The old implementation passed the entire
// prose-with-delimiters string to katex.renderToString which exploded on the
// `\(` token and silently fell back to a plain TextRun of the raw LaTeX.
async function inlineRuns(source: string | null | undefined): Promise<ParagraphChild[]> {
  if (!source) return []
  const segments = splitBody(source)
  if (segments.every((s) => s.kind === 'prose')) {
    return [new TextRun(source)]
  }
  const runs: ParagraphChild[] = []
  for (const seg of segments) {
    if (seg.kind === 'prose') {
      if (seg.text.length > 0) runs.push(new TextRun(seg.text))
    } else if (seg.kind === 'inline-math' || seg.kind === 'display-math') {
      const run = mathRunFromLatex(seg.tex, seg.kind === 'display-math')
      if (run) {
        runs.push(run)
      } else {
        // Fallback: raw LaTeX in delimiters so the math is at least readable.
        const fallback =
          seg.kind === 'inline-math' ? `\\(${seg.tex}\\)` : `\\[${seg.tex}\\]`
        runs.push(new TextRun(fallback))
      }
    }
    // 'img' segments are stripped by buildBodyParagraphs before calling here.
  }
  return runs
}

const IMG_PLACEHOLDER_RE = /\[\[IMG:([^\]]+)\]\]/g
// Diagram cap — matches PaperTemplate.tsx (max 200×140 px).
const DOC_IMAGE_MAX_W = 200
const DOC_IMAGE_MAX_H = 140

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
    const widthScale = w0 > DOC_IMAGE_MAX_W ? DOC_IMAGE_MAX_W / w0 : 1
    const heightScale = h0 > DOC_IMAGE_MAX_H ? DOC_IMAGE_MAX_H / h0 : 1
    const scale = Math.min(widthScale, heightScale)
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 60 },
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
        out.push(new Paragraph({ indent: { left: 540 }, children: await inlineRuns(seg) }))
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
            new TextRun({ text: '[image]', italics: true, color: COLOR_SUBTLE }),
          ],
        }),
      )
    }
    last = IMG_PLACEHOLDER_RE.lastIndex
  }
  if (!sawImg) {
    return [new Paragraph({ indent: { left: 540 }, children: await inlineRuns(body) })]
  }
  if (last < body.length) {
    const seg = body.slice(last)
    if (seg.trim()) {
      out.push(new Paragraph({ indent: { left: 540 }, children: await inlineRuns(seg) }))
    }
  }
  return out
}

function buildHeaderBlock(branding: Branding): Paragraph[] {
  const accent = brandColorHex(branding)
  const out: Paragraph[] = []

  // Icon-only mark on a centered line (250×230 source PNG → ~50×46 on page).
  const logoBuf = readBrandLogoBuffer()
  if (logoBuf) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [
          new ImageRun({
            type: 'png',
            data: logoBuf,
            transformation: { width: 50, height: 46 },
          }),
        ],
      }),
    )
  }

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({
          text: branding.inst_name,
          bold: true,
          color: accent,
          size: 36, // 18pt half-points
        }),
      ],
    }),
  )
  // Brand-red 1px horizontal divider under the header.
  out.push(
    new Paragraph({
      spacing: { before: 0, after: 120 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: BRAND_RED },
      },
      children: [],
    }),
  )
  return out
}

function buildMetaBlock(
  branding: Branding,
  test: TestWithQuestions,
  totalMarks: number,
): Paragraph[] {
  const accent = brandColorHex(branding)
  const boardLine = test.course?.name ? `${test.course.name} (Standard)` : null

  const out: Paragraph[] = []

  if (boardLine) {
    out.push(
      new Paragraph({
        spacing: { before: 0, after: 80 },
        children: [
          new TextRun({
            text: `Board: ${boardLine}`,
            bold: true,
            color: accent,
            size: 22,
          }),
        ],
      }),
    )
  }

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      children: [
        new TextRun({
          text: (test.title || 'Untitled Test').toUpperCase(),
          bold: true,
          size: 30,
          color: COLOR_TEXT,
        }),
      ],
    }),
  )

  // 3-column meta row — Time / Maximum Marks / Topic.
  const topic = test.subject ?? '—'
  out.push(
    metaCellRowParagraph([
      { label: 'Time:', value: `${test.duration_minutes} min`, accent },
      { label: 'Maximum Marks:', value: String(totalMarks), accent },
      { label: 'Topic:', value: topic, accent },
    ]),
  )

  // General Instructions block.
  const instructions = parseInstructions(test.instructions)
  out.push(
    new Paragraph({
      spacing: { before: 80, after: 40 },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: brandTintHex(accent) },
      border: {
        left: { style: BorderStyle.SINGLE, size: 18, space: 6, color: accent },
      },
      children: [
        new TextRun({
          text: 'GENERAL INSTRUCTIONS',
          bold: true,
          size: 20,
          color: accent,
        }),
      ],
    }),
  )
  for (const line of instructions) {
    out.push(
      new Paragraph({
        spacing: { before: 0, after: 20 },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: brandTintHex(accent) },
        border: {
          left: { style: BorderStyle.SINGLE, size: 18, space: 6, color: accent },
        },
        bullet: { level: 0 },
        children: [new TextRun({ text: line, size: 20, color: COLOR_TEXT })],
      }),
    )
  }

  return out
}

function metaCellRowParagraph(cells: { label: string; value: string; accent: string }[]): Paragraph {
  const children: ParagraphChild[] = []
  cells.forEach((c, i) => {
    if (i > 0) children.push(new TextRun({ text: '     ' }))
    children.push(new TextRun({ text: c.label, bold: true, color: c.accent, size: 22 }))
    children.push(new TextRun({ text: ` ${c.value}`, color: COLOR_TEXT, size: 22 }))
  })
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children,
  })
}

const DEFAULT_INSTRUCTIONS = [
  'All questions are compulsory.',
  'Read each question carefully before answering.',
  'Write answers in the space provided; use the rough sheet for working.',
  'Calculators are not allowed unless explicitly stated.',
  'Marks for each question are indicated on the right.',
]

function parseInstructions(raw: string | null | undefined): string[] {
  if (!raw) return DEFAULT_INSTRUCTIONS
  const lines = raw
    .split(/\r?\n|•|·/u)
    .map((l) => l.replace(/^[\s\d.)\-]+/, '').trim())
    .filter(Boolean)
  return lines.length > 0 ? lines : DEFAULT_INSTRUCTIONS
}

type MarkingSchemeRow = {
  section: string
  marksPerQuestion: number | string
  numQuestions: number
  total: number
}

function buildMarkingSchemeTable(rows: MarkingSchemeRow[], accent: string): Table {
  const headerCells = [
    'Section',
    'Marks / Question',
    '# of Questions',
    'Total Marks',
    'Marks Obtained',
  ].map(
    (label) =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: brandTintHex(accent) },
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: label, bold: true, color: accent, size: 20 }),
            ],
          }),
        ],
      }),
  )

  const bodyRows = rows.map((r) =>
    new TableRow({
      children: [
        cell(r.section),
        cell(String(r.marksPerQuestion)),
        cell(String(r.numQuestions)),
        cell(String(r.total)),
        cell(''),
      ],
    }),
  )

  return new Table({
    width: { size: '100%', type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, children: headerCells }), ...bodyRows],
  })
}

function cell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 20, color: COLOR_TEXT })],
      }),
    ],
  })
}

function buildSectionBar(label: string, brandHex: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 80 },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: brandHex },
    children: [
      new TextRun({
        text: label.toUpperCase(),
        bold: true,
        color: 'FFFFFF',
        size: 24,
      }),
    ],
  })
}

function groupBySection(rows: TestWithQuestions['test_questions']) {
  type Group = { label: string | null; rows: TestWithQuestions['test_questions'] }
  const groups: Group[] = []
  for (const row of rows) {
    const label = row.section_label?.trim() || null
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.rows.push(row)
    else groups.push({ label, rows: [row] })
  }
  return groups
}

function markingSchemeFromGroups(
  groups: { label: string | null; rows: TestWithQuestions['test_questions'] }[],
): MarkingSchemeRow[] {
  return groups.map((g, idx) => {
    const marks = g.rows.map((r) => {
      const m = r.marks_override != null ? Number(r.marks_override) : Number(r.question.marks_correct)
      return Number.isFinite(m) ? m : 0
    })
    const total = marks.reduce((a, b) => a + b, 0)
    const uniform = marks.every((m) => m === marks[0]) ? marks[0] : null
    return {
      section: g.label ?? `Section ${String.fromCharCode(65 + idx)}`,
      marksPerQuestion: uniform != null ? uniform : 'Mixed',
      numQuestions: g.rows.length,
      total,
    }
  })
}

async function buildMcqTable(
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
      runs.push(new TextRun({ text: '—', color: COLOR_SUBTLE }))
    }
    cells.push(
      new TableCell({
        width: { size: '50%', type: WidthType.PERCENTAGE },
        borders: blankCellBorders(),
        children: [new Paragraph({ children: runs })],
      }),
    )
  }
  const rows: TableRow[] = [
    new TableRow({ children: [cells[0], cells[1]] }),
    new TableRow({ children: [cells[2], cells[3]] }),
  ]
  return new Table({
    width: { size: '100%', type: WidthType.PERCENTAGE },
    indent: { size: 540, type: WidthType.DXA },
    rows,
  })
}

function blankCellBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const
  return { top: none, bottom: none, left: none, right: none, start: none, end: none }
}

function marksChipParagraph(marks: number | string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 20, after: 80 },
    border: {
      // No paragraph-level pill in DOCX; we approximate with a small run
      // in brand-red bracketed text. The PaperTemplate's pill is css-only.
    },
    children: [
      new TextRun({
        text: `[ ${String(marks)} ]`,
        bold: true,
        color: BRAND_RED,
        size: 18,
      }),
    ],
  })
}

async function buildQuestionParagraphs(
  test: TestWithQuestions,
  brandHex: string,
): Promise<Array<Paragraph | Table>> {
  const out: Array<Paragraph | Table> = []
  const groups = groupBySection(test.test_questions)
  let runningIndex = 1

  for (const [gi, group] of groups.entries()) {
    out.push(buildSectionBar(group.label ?? `Section ${String.fromCharCode(65 + gi)}`, brandHex))

    for (const row of group.rows) {
      const q = row.question
      const marksRaw = row.marks_override ?? q.marks_correct
      const indexNum = runningIndex
      runningIndex += 1

      out.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          children: [
            new TextRun({ text: `Q${indexNum}.`, bold: true, color: COLOR_TEXT, size: 22 }),
            new TextRun({ text: ' ', size: 22 }),
          ],
        }),
      )

      const bodyParas = await buildBodyParagraphs(q.question_body)
      out.push(...bodyParas)

      if (q.question_type === 'mcq' || q.question_type === 'multi_select') {
        out.push(await buildMcqTable(q))
      }
      out.push(marksChipParagraph(String(marksRaw)))
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
          new TextRun({ text: branding.footer_text, size: 16, color: COLOR_SUBTLE }),
          new TextRun({ text: '  ·  ', size: 16, color: COLOR_SUBTLE }),
          new TextRun({ text: branding.inst_name, size: 16, color: COLOR_SUBTLE }),
          new TextRun({ text: '  ·  ', size: 16, color: COLOR_SUBTLE }),
          new TextRun({ text: 'Page ', size: 16, color: COLOR_SUBTLE }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLOR_SUBTLE }),
          new TextRun({ text: ' of ', size: 16, color: COLOR_SUBTLE }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: COLOR_SUBTLE }),
        ],
      }),
    ],
  })
}

function buildRunningHeader(branding: Branding): Header {
  const accent = brandColorHex(branding)
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, space: 2, color: accent } },
        children: [
          new TextRun({ text: branding.inst_name, size: 16, color: accent, bold: true }),
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
  const accent = brandColorHex(branding)
  const totalMarks = computeTotalMarks(test)
  const groups = groupBySection(test.test_questions)
  const markingScheme = markingSchemeFromGroups(groups)

  const section: ISectionOptions = {
    properties: {
      page: {
        margin: {
          // US Letter narrow-top / narrow-right / wide-left margins to
          // match the reference DOCX. docx uses twips (1mm ≈ 56.7 twips).
          top: 794, // 14mm
          right: 340, // 6mm
          bottom: 1020, // 18mm
          left: 1417, // 25mm
        },
      },
    },
    headers: { default: buildRunningHeader(branding) },
    footers: { default: buildFooter(branding) },
    children: [
      ...buildHeaderBlock(branding),
      ...buildMetaBlock(branding, test, totalMarks),
      buildMarkingSchemeTable(markingScheme, accent),
      ...(await buildQuestionParagraphs(test, accent)),
    ],
  }

  const doc = new Document({ sections: [section] })
  return Packer.toBuffer(doc) as Promise<Buffer>
}
