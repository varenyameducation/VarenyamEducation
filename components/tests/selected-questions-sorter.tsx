'use client'

import * as React from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { GripVertical, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { stripImagePlaceholders } from '@/lib/ui/render-body'
import type { Question } from '@/lib/ui/api'

const LATEX_TOKEN = /\\[a-zA-Z]+|[\$\^_{}]/

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderInline(body: string): string {
  if (!LATEX_TOKEN.test(body)) return escapeHtml(body)
  try {
    return katex.renderToString(body, {
      throwOnError: false,
      displayMode: false,
      output: 'html',
      strict: 'ignore',
    })
  } catch {
    return escapeHtml(body)
  }
}

function truncate(s: string, limit = 140): string {
  return s.length > limit ? `${s.slice(0, limit)}…` : s
}

export interface SelectedQuestion {
  question: Question
  position: number
  section_label: string
  marks_override: number | null
}

export interface SelectedQuestionsSorterProps {
  items: SelectedQuestion[]
  onReorder: (next: SelectedQuestion[]) => void
  onRemove: (id: string) => void
  onUpdate: (
    id: string,
    patch: Partial<Pick<SelectedQuestion, 'section_label' | 'marks_override'>>,
  ) => void
}

export function SelectedQuestionsSorter({
  items,
  onReorder,
  onRemove,
  onUpdate,
}: SelectedQuestionsSorterProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const totalMarks = React.useMemo(
    () =>
      items.reduce(
        (acc, it) =>
          acc +
          (it.marks_override ?? Number(it.question.marks_correct) ?? 0),
        0,
      ),
    [items],
  )

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = items.findIndex((it) => it.question.id === String(active.id))
    const to = items.findIndex((it) => it.question.id === String(over.id))
    if (from < 0 || to < 0) return
    const reordered = arrayMove(items, from, to).map((it, idx) => ({
      ...it,
      position: idx + 1,
    }))
    onReorder(reordered)
  }

  if (items.length === 0) {
    return (
      <section className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No questions selected yet. Pick from the results list above to build the paper.
      </section>
    )
  }

  return (
    <section className="rounded-md border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Selected questions</h3>
        <span className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {items.length} question{items.length === 1 ? '' : 's'} · {totalMarks} mark
          {totalMarks === 1 ? '' : 's'}
        </span>
      </header>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={items.map((it) => it.question.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="divide-y">
            {items.map((it, idx) => (
              <SortableRow
                key={it.question.id}
                item={it}
                index={idx}
                onRemove={() => onRemove(it.question.id)}
                onSectionChange={(label) =>
                  onUpdate(it.question.id, { section_label: label })
                }
                onMarksChange={(marks) =>
                  onUpdate(it.question.id, { marks_override: marks })
                }
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  )
}

function SortableRow({
  item,
  index,
  onRemove,
  onSectionChange,
  onMarksChange,
}: {
  item: SelectedQuestion
  index: number
  onRemove: () => void
  onSectionChange: (label: string) => void
  onMarksChange: (marks: number | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.question.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-3 bg-card px-4 py-3',
        isDragging && 'opacity-60 ring-2 ring-primary',
      )}
    >
      <button
        type="button"
        className="mt-1 cursor-grab rounded p-1 text-muted-foreground hover:bg-accent"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="mt-1 w-7 shrink-0 text-right font-mono text-sm text-muted-foreground">
        {index + 1}.
      </span>
      <div className="flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-mono uppercase">
            {item.question.question_type.replace('_', ' ')}
          </Badge>
          <Badge variant="secondary">{item.question.subject}</Badge>
          <Badge variant="muted">{item.question.difficulty}</Badge>
        </div>
        <div
          className="text-sm text-foreground/90"
          dangerouslySetInnerHTML={{
            __html: renderInline(truncate(stripImagePlaceholders(item.question.question_body))),
          }}
        />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Input
            className="h-8 max-w-[12rem]"
            placeholder="Section label (optional)"
            value={item.section_label}
            onChange={(e) => onSectionChange(e.target.value)}
            aria-label="Section label"
          />
          <Input
            className="h-8 w-24"
            type="number"
            step="0.25"
            min={0}
            placeholder={`Marks (${Number(item.question.marks_correct)})`}
            value={item.marks_override ?? ''}
            onChange={(e) => {
              const v = e.target.value
              onMarksChange(v === '' ? null : Number(v))
            }}
            aria-label="Marks override"
          />
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Remove question"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </li>
  )
}
