'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked)
      onChange?.(e)
    }
    return (
      <span className="relative inline-flex h-4 w-4 shrink-0">
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          onChange={handleChange}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
          {...props}
        />
        <span
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded-sm border border-primary shadow transition-colors peer-focus-visible:ring-1 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            checked ? 'bg-primary text-primary-foreground' : 'bg-background',
            className,
          )}
          aria-hidden
        >
          {checked && <Check className="h-3 w-3" />}
        </span>
      </span>
    )
  },
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
