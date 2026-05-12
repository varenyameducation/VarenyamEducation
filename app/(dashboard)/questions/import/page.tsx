'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { apiPost } from '@/lib/ui/api'
import { cn } from '@/lib/utils'

interface ImportError {
  row: number
  reason: string
}

interface ImportResult {
  imported: number
  errors: ImportError[]
}

type Status = 'idle' | 'uploading' | 'done' | 'error'

export default function ImportQuestionsPage() {
  const [xlsx, setXlsx] = React.useState<File | null>(null)
  const [zip, setZip] = React.useState<File | null>(null)
  const [status, setStatus] = React.useState<Status>('idle')
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!xlsx) {
      setErrorMessage('Please pick an .xlsx file first.')
      return
    }
    setErrorMessage(null)
    setStatus('uploading')

    const fd = new FormData()
    fd.append('xlsx', xlsx)
    if (zip) fd.append('images', zip)

    const res = await apiPost<ImportResult>('/api/questions/import', fd)
    if (!res.ok) {
      setErrorMessage(res.error.message)
      setStatus('error')
      return
    }
    setResult(res.data)
    setStatus('done')
  }

  function downloadErrorCsv() {
    if (!result || result.errors.length === 0) return
    const header = 'row,reason\n'
    const body = result.errors
      .map((e) => `${e.row},"${e.reason.replace(/"/g, '""')}"`)
      .join('\n')
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `question-import-errors-${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bulk import questions</h1>
          <p className="text-sm text-muted-foreground">
            Upload a filled-in .xlsx template and an optional ZIP of referenced images.
          </p>
        </div>
        {/* TODO: add static template once integration ships the canonical column list */}
        <Button asChild variant="outline">
          <a href="/templates/question-import-template.xlsx" download>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Download template
          </a>
        </Button>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-md border bg-card p-5"
        aria-label="Bulk import"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="xlsx">Questions spreadsheet (.xlsx)</Label>
            <input
              id="xlsx"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              onChange={(e) => setXlsx(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
            />
            {xlsx && (
              <p className="text-xs text-muted-foreground">
                {xlsx.name} · {(xlsx.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="zip">Image bundle (.zip, optional)</Label>
            <input
              id="zip"
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setZip(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
            />
            {zip && (
              <p className="text-xs text-muted-foreground">
                {zip.name} · {(zip.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Button asChild variant="ghost">
            <Link href="/questions">Cancel</Link>
          </Button>
          <Button type="submit" disabled={status === 'uploading'}>
            {status === 'uploading' ? 'Uploading…' : 'Start import'}
          </Button>
        </div>

        {errorMessage && (
          <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {errorMessage}
          </p>
        )}
      </form>

      {result && (
        <section className="space-y-4 rounded-md border bg-card p-5">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold">
                {result.imported} imported · {result.errors.length} failed
              </h2>
            </div>
            {result.errors.length > 0 && (
              <Button type="button" variant="outline" onClick={downloadErrorCsv}>
                <Download className="mr-2 h-4 w-4" />
                Download error CSV
              </Button>
            )}
          </header>

          {result.errors.length > 0 && (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, idx) => (
                    <tr
                      key={`${e.row}-${idx}`}
                      className={cn('border-t', idx % 2 === 0 && 'bg-muted/10')}
                    >
                      <td className="px-3 py-2 font-mono">{e.row}</td>
                      <td className="px-3 py-2">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
