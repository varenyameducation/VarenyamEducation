'use client'

import * as React from 'react'
import { Controller, useFormContext, useFieldArray, useWatch } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import type { QuestionFormValues } from '@/lib/validation/question'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LaTeXEditor } from '@/components/ui/latex-editor'
import { cn } from '@/lib/utils'

const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const
type OptionKey = (typeof OPTION_KEYS)[number]

export function QuestionTypeFields() {
  const { control, register, formState, setValue, getValues } =
    useFormContext<QuestionFormValues>()
  const questionType = useWatch({ control, name: 'question_type' })

  if (questionType === 'mcq' || questionType === 'multi_select') {
    return (
      <McqFields
        multiSelect={questionType === 'multi_select'}
        control={control}
        errors={formState.errors}
        setValue={setValue}
        getValues={getValues}
      />
    )
  }
  if (questionType === 'numerical') {
    return <NumericalFields register={register} errors={formState.errors} />
  }
  if (questionType === 'matrix_match') {
    return <MatrixMatchFields control={control} errors={formState.errors} />
  }
  return null
}

function McqFields({
  multiSelect,
  control,
  errors,
  setValue,
  getValues,
}: {
  multiSelect: boolean
  control: ReturnType<typeof useFormContext<QuestionFormValues>>['control']
  errors: ReturnType<typeof useFormContext<QuestionFormValues>>['formState']['errors']
  setValue: ReturnType<typeof useFormContext<QuestionFormValues>>['setValue']
  getValues: ReturnType<typeof useFormContext<QuestionFormValues>>['getValues']
}) {
  const correctOption =
    useWatch({ control, name: 'correct_option' }) ?? ([] as OptionKey[])

  const toggleCorrect = React.useCallback(
    (key: OptionKey) => {
      const current = (getValues('correct_option') ?? []) as OptionKey[]
      if (multiSelect) {
        const next = current.includes(key)
          ? current.filter((k) => k !== key)
          : [...current, key]
        setValue('correct_option', next, { shouldValidate: true, shouldDirty: true })
      } else {
        setValue('correct_option', [key], { shouldValidate: true, shouldDirty: true })
      }
    },
    [multiSelect, setValue, getValues],
  )

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">
          Options ({multiSelect ? 'multi-select' : 'single correct'})
        </h3>
        <p className="text-xs text-muted-foreground">
          Mark every option that should be considered correct.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {OPTION_KEYS.map((k) => {
          const fieldName = `option_${k}` as const
          const errMessage = errors[fieldName]?.message as string | undefined
          const checked = correctOption.includes(k)
          return (
            <div
              key={k}
              className={cn(
                'space-y-2 rounded-md border p-3',
                checked && 'border-primary bg-primary/5',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={fieldName} className="text-sm uppercase">
                  Option {k}
                </Label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                  <input
                    type={multiSelect ? 'checkbox' : 'radio'}
                    name="correct_option_marker"
                    checked={checked}
                    onChange={() => toggleCorrect(k)}
                    className="h-3.5 w-3.5"
                  />
                  Correct
                </label>
              </div>
              <Controller
                control={control}
                name={fieldName}
                render={({ field }) => (
                  <LaTeXEditor
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder={`Type option ${k.toUpperCase()}`}
                    minHeight={120}
                  />
                )}
              />
              {errMessage && (
                <p className="text-xs text-destructive">{errMessage}</p>
              )}
            </div>
          )
        })}
      </div>
      {errors.correct_option && (
        <p className="text-sm text-destructive">
          {errors.correct_option.message as string}
        </p>
      )}
    </section>
  )
}

function NumericalFields({
  register,
  errors,
}: {
  register: ReturnType<typeof useFormContext<QuestionFormValues>>['register']
  errors: ReturnType<typeof useFormContext<QuestionFormValues>>['formState']['errors']
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Numerical answer</h3>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="numerical_answer">Answer</Label>
          <Input
            id="numerical_answer"
            type="number"
            step="any"
            {...register('numerical_answer', { valueAsNumber: true })}
          />
          {errors.numerical_answer && (
            <p className="text-xs text-destructive">
              {errors.numerical_answer.message as string}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="numerical_min">Min (optional)</Label>
          <Input
            id="numerical_min"
            type="number"
            step="any"
            {...register('numerical_min', { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="numerical_max">Max (optional)</Label>
          <Input
            id="numerical_max"
            type="number"
            step="any"
            {...register('numerical_max', { valueAsNumber: true })}
          />
        </div>
      </div>
    </section>
  )
}

function MatrixMatchFields({
  control,
  errors,
}: {
  control: ReturnType<typeof useFormContext<QuestionFormValues>>['control']
  errors: ReturnType<typeof useFormContext<QuestionFormValues>>['formState']['errors']
}) {
  const leftArray = useFieldArray({ control, name: 'matrix_left' as never })
  const rightArray = useFieldArray({ control, name: 'matrix_right' as never })

  const leftFields = leftArray.fields as Array<{ id: string; key?: string; text?: string }>
  const rightFields = rightArray.fields as Array<{ id: string; key?: string; text?: string }>

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">Matrix match</h3>
      <div className="grid gap-6 md:grid-cols-2">
        <MatrixColumn
          label="Column I (Left)"
          fields={leftFields}
          name="matrix_left"
          remove={leftArray.remove}
          append={() =>
            leftArray.append({
              key: `L${leftFields.length + 1}`,
              text: '',
            } as never)
          }
          control={control}
        />
        <MatrixColumn
          label="Column II (Right)"
          fields={rightFields}
          name="matrix_right"
          remove={rightArray.remove}
          append={() =>
            rightArray.append({
              key: `R${rightFields.length + 1}`,
              text: '',
            } as never)
          }
          control={control}
        />
      </div>
      <MatrixAnswerEditor
        leftKeys={leftFields.map((f) => f.key ?? '')}
        rightKeys={rightFields.map((f) => f.key ?? '')}
        control={control}
      />
      {errors.matrix_left && (
        <p className="text-sm text-destructive">
          {errors.matrix_left.message as string}
        </p>
      )}
    </section>
  )
}

function MatrixColumn({
  label,
  fields,
  name,
  remove,
  append,
  control,
}: {
  label: string
  fields: Array<{ id: string; key?: string }>
  name: 'matrix_left' | 'matrix_right'
  remove: (index: number) => void
  append: () => void
  control: ReturnType<typeof useFormContext<QuestionFormValues>>['control']
}) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" variant="outline" size="sm" onClick={append}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add row
        </Button>
      </div>
      <div className="space-y-2">
        {fields.map((row, idx) => (
          <div key={row.id} className="flex items-start gap-2">
            <Controller
              control={control}
              name={`${name}.${idx}.key` as never}
              render={({ field }) => (
                <Input
                  {...field}
                  value={(field.value as string) ?? ''}
                  className="w-16"
                  placeholder="Key"
                />
              )}
            />
            <Controller
              control={control}
              name={`${name}.${idx}.text` as never}
              render={({ field }) => (
                <Input
                  {...field}
                  value={(field.value as string) ?? ''}
                  className="flex-1"
                  placeholder="Row content"
                />
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(idx)}
              disabled={fields.length <= 2}
              aria-label="Remove row"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function MatrixAnswerEditor({
  leftKeys,
  rightKeys,
  control,
}: {
  leftKeys: string[]
  rightKeys: string[]
  control: ReturnType<typeof useFormContext<QuestionFormValues>>['control']
}) {
  return (
    <div className="rounded-md border p-3">
      <Label className="mb-2 block">Answer map</Label>
      <p className="mb-3 text-xs text-muted-foreground">
        For each left key, tick every right key that matches.
      </p>
      <Controller
        control={control}
        name="matrix_answer"
        render={({ field }) => {
          const value = (field.value ?? {}) as Record<string, string[]>
          const toggle = (lKey: string, rKey: string) => {
            const current = value[lKey] ?? []
            const next = current.includes(rKey)
              ? current.filter((k) => k !== rKey)
              : [...current, rKey]
            field.onChange({ ...value, [lKey]: next })
          }
          return (
            <div className="space-y-2 text-sm">
              {leftKeys.length === 0 || rightKeys.length === 0 ? (
                <p className="text-muted-foreground">Add rows on both sides first.</p>
              ) : (
                leftKeys.map((lKey) => (
                  <div key={lKey} className="flex flex-wrap items-center gap-3">
                    <span className="w-12 font-mono text-xs">{lKey}</span>
                    {rightKeys.map((rKey) => {
                      const checked = (value[lKey] ?? []).includes(rKey)
                      return (
                        <label
                          key={rKey}
                          className={cn(
                            'flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs',
                            checked && 'border-primary bg-primary/10',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-3 w-3"
                            checked={checked}
                            onChange={() => toggle(lKey, rKey)}
                          />
                          {rKey}
                        </label>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          )
        }}
      />
    </div>
  )
}
