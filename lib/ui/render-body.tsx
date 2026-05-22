'use client'

import * as React from 'react'
import {
  escapeHtml,
  renderMathHtml,
  splitBody,
} from '@/lib/ui/render-body-core'

export {
  type BodySegment,
  renderBodyHtml,
  splitBody,
  stripImagePlaceholders,
} from '@/lib/ui/render-body-core'

export function RenderedBody({
  body,
  className,
}: {
  body: string | null | undefined
  className?: string
}) {
  const segments = React.useMemo(() => splitBody(body), [body])
  return (
    <div className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === 'img') {
          return (
            <img
              key={i}
              src={seg.url}
              alt=""
              className="my-2 max-h-72 max-w-full rounded border"
            />
          )
        }
        if (seg.kind === 'inline-math') {
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: renderMathHtml(seg.latex, false) }}
            />
          )
        }
        if (seg.kind === 'display-math') {
          return (
            <div
              key={i}
              className="my-2 text-center"
              dangerouslySetInnerHTML={{ __html: renderMathHtml(seg.latex, true) }}
            />
          )
        }
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: escapeHtml(seg.text) }}
          />
        )
      })}
    </div>
  )
}
