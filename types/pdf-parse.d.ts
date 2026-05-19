declare module 'pdf-parse' {
  interface PdfParseResult {
    numpages: number
    numrender: number
    info: unknown
    metadata: unknown
    version: string
    text: string
  }
  function pdfParse(buffer: Buffer | Uint8Array, options?: unknown): Promise<PdfParseResult>
  export default pdfParse
}
