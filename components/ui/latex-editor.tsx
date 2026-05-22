'use client'

import * as React from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { StreamLanguage } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import 'katex/dist/katex.min.css'
import { RenderedBody } from '@/lib/ui/render-body'
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

    const heightStyle =
      typeof minHeight === 'number' ? `${minHeight}px` : minHeight

    const hasContent = (deferredValue ?? '').trim().length > 0

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
          className="min-h-[inherit] overflow-auto p-3 text-sm"
          style={{ minHeight: heightStyle }}
        >
          {hasContent ? (
            <RenderedBody
              className="katex-preview whitespace-pre-wrap"
              body={deferredValue}
            />
          ) : (
            <p className="text-muted-foreground">{placeholder ?? 'Live preview'}</p>
          )}
        </div>
      </div>
    )
  },
)
