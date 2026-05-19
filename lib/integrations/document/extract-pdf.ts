// PDF text extraction. pdf-parse returns the document as one big string;
// we split on linebreaks and treat each non-empty line as a paragraph. PDFs
// are inherently less structured than DOCX so we trust the question parser
// downstream to be tolerant of fragmentation.

export async function extractPdfParagraphs(buf: Buffer): Promise<string[]> {
  const pdfParse = (await import('pdf-parse')).default
  const result = await pdfParse(buf)
  const raw = result.text ?? ''
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
  return lines
}
