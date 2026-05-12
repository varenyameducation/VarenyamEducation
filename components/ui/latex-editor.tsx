'use client'

import * as React from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { StreamLanguage } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/utils'

export interface LaTeXEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: number | string
  className?: string
  id?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}

const LATEX_TOKEN_PATTERN = /\\[a-zA-Z]+|[\$\^_{}]/

function looksLikeLatex(src: string): boolean {
  return LATEX_TOKEN_PATTERN.test(src)
}

const latexExtensions = [StreamLanguage.define(stex)]

export const LaTeXEditor = React.forwardRef<HTMLDivElement, LaTeXEditorProps>(
  function LaTeXEditor(
    { value, onChange, placeholder, minHeight = 160, className, id, ...rest },
    ref,
  ) {
    const [deferredValue, setDeferredValue] = React.useState(value)
    const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    React.useEffect(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => setDeferredValue(value), 300)
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
      }
    }, [value])

    const rendered = React.useMemo(() => {
      const src = deferredValue ?? ''
      if (!src.trim()) {
        return { html: null as string | null, error: null as string | null, plain: true }
      }
      if (!looksLikeLatex(src)) {
        return { html: null, error: null, plain: true }
      }
      try {
        const html = katex.renderToString(src, {
          throwOnError: true,
          displayMode: true,
          output: 'html',
          strict: 'ignore',
        })
        return { html, error: null, plain: false }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'KaTeX parse error'
        return { html: null, error: message, plain: false }
      }
    }, [deferredValue])

    const heightStyle =
      typeof minHeight === 'number' ? `${minHeight}px` : minHeight

    return (
      <div
        ref={ref}
        id={id}
        className={cn(
          'grid grid-cols-1 gap-3 rounded-md border bg-background md:grid-cols-2',
          className,
        )}
        {...rest}
      >
        <div className="border-b md:border-b-0 md:border-r">
          <CodeMirror
            value={value}
            onChange={onChange}
            extensions={latexExtensions}
            placeholder={placeholder}
            minHeight={heightStyle}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
            }}
            className="text-sm"
          />
        </div>
        <div
          aria-live="polite"
          className={cn(
            'min-h-[inherit] overflow-auto p-3 text-sm',
            rendered.error && 'border-l-2 border-destructive bg-destructive/5',
          )}
          style={{ minHeight: heightStyle }}
        >
          {rendered.error ? (
            <p className="font-mono text-xs text-destructive">{rendered.error}</p>
          ) : rendered.html ? (
            <div
              className="katex-preview"
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          ) : rendered.plain && deferredValue ? (
            <p className="whitespace-pre-wrap text-foreground/80">{deferredValue}</p>
          ) : (
            <p className="text-muted-foreground">{placeholder ?? 'Live preview'}</p>
          )}
        </div>
      </div>
    )
  },
)
