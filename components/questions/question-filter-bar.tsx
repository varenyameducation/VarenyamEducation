'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type { QuestionTypeValue, DifficultyValue } from '@/lib/validation/question'

export interface QuestionFilters {
  search: string
  type: QuestionTypeValue | 'all'
  difficulty: DifficultyValue | 'all'
  verified: 'all' | 'verified' | 'needs_review'
}

export const DEFAULT_FILTERS: QuestionFilters = {
  search: '',
  type: 'all',
  difficulty: 'all',
  verified: 'all',
}

interface QuestionFilterBarProps {
  filters: QuestionFilters
  onChange: (filters: QuestionFilters) => void
}

const TYPE_OPTIONS: { value: QuestionTypeValue | 'all'; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'mcq', label: 'MCQ' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'numerical', label: 'Numerical' },
  { value: 'subjective', label: 'Subjective' },
  { value: 'matrix_match', label: 'Matrix match' },
]

const DIFFICULTY_OPTIONS: { value: DifficultyValue | 'all'; label: string }[] = [
  { value: 'all', label: 'All difficulties' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'advanced', label: 'Advanced' },
]

const VERIFIED_OPTIONS: { value: QuestionFilters['verified']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'verified', label: 'Verified' },
  { value: 'needs_review', label: 'Needs review' },
]

function activeChips(filters: QuestionFilters): { key: keyof QuestionFilters; label: string }[] {
  const chips: { key: keyof QuestionFilters; label: string }[] = []
  if (filters.search) chips.push({ key: 'search', label: `Search: "${filters.search}"` })
  if (filters.type !== 'all') {
    const opt = TYPE_OPTIONS.find((o) => o.value === filters.type)
    chips.push({ key: 'type', label: opt?.label ?? filters.type })
  }
  if (filters.difficulty !== 'all') {
    const opt = DIFFICULTY_OPTIONS.find((o) => o.value === filters.difficulty)
    chips.push({ key: 'difficulty', label: opt?.label ?? filters.difficulty })
  }
  if (filters.verified !== 'all') {
    const opt = VERIFIED_OPTIONS.find((o) => o.value === filters.verified)
    chips.push({ key: 'verified', label: opt?.label ?? filters.verified })
  }
  return chips
}

export function QuestionFilterBar({ filters, onChange }: QuestionFilterBarProps) {
  const searchRef = React.useRef<HTMLInputElement>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, search: value })
    }, 200)
  }

  const clearChip = (key: keyof QuestionFilters) => {
    const defaults: QuestionFilters = { ...filters }
    if (key === 'search') {
      defaults.search = ''
      if (searchRef.current) searchRef.current.value = ''
    }
    if (key === 'type') defaults.type = 'all'
    if (key === 'difficulty') defaults.difficulty = 'all'
    if (key === 'verified') defaults.verified = 'all'
    onChange(defaults)
  }

  const clearAll = () => {
    if (searchRef.current) searchRef.current.value = ''
    onChange(DEFAULT_FILTERS)
  }

  const chips = activeChips(filters)
  const hasFilters = chips.length > 0

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input
          ref={searchRef}
          placeholder="Search questions…"
          defaultValue={filters.search}
          onChange={handleSearchChange}
          className="h-8 w-56 text-sm"
          aria-label="Search questions"
        />
        <Select
          value={filters.type}
          onChange={(e) =>
            onChange({ ...filters, type: e.target.value as QuestionFilters['type'] })
          }
          className="h-8 w-40 text-sm"
          aria-label="Filter by type"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select
          value={filters.difficulty}
          onChange={(e) =>
            onChange({ ...filters, difficulty: e.target.value as QuestionFilters['difficulty'] })
          }
          className="h-8 w-44 text-sm"
          aria-label="Filter by difficulty"
        >
          {DIFFICULTY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select
          value={filters.verified}
          onChange={(e) =>
            onChange({ ...filters, verified: e.target.value as QuestionFilters['verified'] })
          }
          className="h-8 w-36 text-sm"
          aria-label="Filter by verification status"
        >
          {VERIFIED_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground hover:text-foreground"
            onClick={clearAll}
          >
            Clear all
          </Button>
        )}
      </div>
      {hasFilters && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 text-xs text-foreground"
            >
              {chip.label}
              <button
                type="button"
                onClick={() => clearChip(chip.key)}
                className="ml-0.5 rounded-full text-muted-foreground hover:text-foreground"
                aria-label={`Remove filter: ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
