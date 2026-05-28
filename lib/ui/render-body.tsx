'use client'

import * as React from 'react'
import {
  escapeHtml,
  renderMath,
  splitBody,
} from '@/lib/ui/render-body-html'

export {
  type BodySegment,
  renderBodyToHtml,
  renderMath,
  splitBody,
  escapeHtml,
  stripImagePlaceholders,
} from '@/lib/ui/render-body-html'

export function RenderedBody({
  body,
  className,
}: {
  body: string | null | undefined
  className?: string
}) {
  const segments = React.useMemo(() => splitBody(body ?? ''), [body])
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
        if (seg.kind === 'prose') {
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: escapeHtml(seg.text) }}
            />
          )
        }
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{
              __html: renderMath(seg.tex, seg.kind === 'display-math'),
            }}
          />
        )
      })}
    </div>
  )
}
