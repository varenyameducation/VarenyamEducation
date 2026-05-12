import {
  Document,
  Header,
  Footer,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  PageNumber,
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

export async function renderLatexToPng(latex: string): Promise<Buffer> {
  const mathHtml = katex.renderToString(latex, {
    output: 'mathml',
    throwOnError: true,
    displayMode: false,
    strict: 'ignore',
  })

  // Wrap MathML in a minimal SVG so sharp can rasterize it. sharp's underlying
  // librsvg handles xhtml MathML namespaces well enough for inline equations.
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

function brandColorHex(branding: Branding): string {
  return branding.brand_color_hex.replace(/^#/, '')
}

async function buildHeader(branding: Branding): Promise<Header> {
  return new Header({
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: branding.logo_position === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [
          new TextRun({
            text: branding.inst_name,
            bold: true,
            color: brandColorHex(branding),
            size: 28,
          }),
        ],
      }),
      ...(branding.tagline
        ? [
            new Paragraph({
              children: [new TextRun({ text: branding.tagline, italics: true, size: 18 })],
            }),
          ]
        : []),
    ],
  })
}

function buildFooter(branding: Branding): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: branding.footer_text, size: 16 }),
          new TextRun({ text: '    ', size: 16 }),
          new TextRun({ text: 'Page ', size: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16 }),
          new TextRun({ text: ' / ', size: 16 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16 }),
        ],
      }),
    ],
  })
}

async function buildQuestionParagraphs(
  test: TestWithQuestions,
): Promise<Paragraph[]> {
  const paragraphs: Paragraph[] = []
  let lastSection: string | null | undefined = undefined

  for (let i = 0; i < test.test_questions.length; i++) {
    const row = test.test_questions[i]
    if (row.section_label !== lastSection) {
      lastSection = row.section_label
      if (row.section_label) {
        paragraphs.push(
          new Paragraph({
            spacing: { before: 240, after: 120 },
            children: [new TextRun({ text: row.section_label, bold: true, size: 22 })],
          }),
        )
      }
    }

    const q = row.question
    const marks = row.marks_override ?? q.marks_correct

    paragraphs.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({ text: `Q${i + 1}.`, bold: true }),
          new TextRun({ text: `   [${String(marks)} marks]`, color: '666666' }),
        ],
      }),
    )

    const bodyRuns = await inlineRuns(q.question_body)
    paragraphs.push(new Paragraph({ children: bodyRuns }))

    if (q.question_type === 'mcq' || q.question_type === 'multi_select') {
      for (const letter of ['a', 'b', 'c', 'd'] as const) {
        const option = (q as Record<string, unknown>)[`option_${letter}`]
        if (typeof option !== 'string' || !option) continue
        const runs = await inlineRuns(option)
        paragraphs.push(
          new Paragraph({
            indent: { left: 360 },
            children: [new TextRun({ text: `(${letter}) ` }), ...runs],
          }),
        )
      }
    }
  }

  return paragraphs
}

export async function generateTestDOCX(testId: string): Promise<Buffer> {
  const test = await getTestWithQuestions(testId)
  if (!test) throw new Error(`Test ${testId} not found`)

  const branding = await getInstituteBranding()

  const titleParagraph = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text: test.title, bold: true, size: 30 })],
  })

  const metaBits: string[] = []
  if (test.subject) metaBits.push(`Subject: ${test.subject}`)
  if (test.exam_type) metaBits.push(`Exam: ${test.exam_type.toUpperCase()}`)
  metaBits.push(`Duration: ${test.duration_minutes} min`)
  const metaParagraph = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: metaBits.join('  •  '), size: 20, color: '444444' })],
  })

  const section: ISectionOptions = {
    properties: {},
    headers: { default: await buildHeader(branding) },
    footers: { default: buildFooter(branding) },
    children: [
      titleParagraph,
      metaParagraph,
      ...(test.instructions
        ? [new Paragraph({ children: [new TextRun({ text: test.instructions, size: 18, italics: true })] })]
        : []),
      ...(await buildQuestionParagraphs(test)),
    ],
  }

  const doc = new Document({ sections: [section] })
  return Packer.toBuffer(doc) as Promise<Buffer>
}
