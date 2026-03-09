// oxlint-disable promise/prefer-await-to-then

// biome-ignore-all lint/performance/noImgElement: x
// biome-ignore-all lint/performance/noAwaitInLoops: x
// biome-ignore-all lint/suspicious/noExplicitAny: x
'use client'
import type { AnyFieldApi } from '@tanstack/react-form'
import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import type { ZodObject, ZodRawShape } from 'zod/v4'

import { cn } from '@a/ui'
import { Button } from '@a/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@a/ui/command'
import { Field, FieldError, FieldLabel } from '@a/ui/field'
import { Input } from '@a/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@a/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@a/ui/select'
import { Slider as UISlider } from '@a/ui/slider'
import { Spinner } from '@a/ui/spinner'
import { Switch } from '@a/ui/switch'
import { Textarea } from '@a/ui/textarea'
import { format } from 'date-fns'
import { CalendarIcon, Check, ChevronsUpDown, Star, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { createContext, use, useState } from 'react'
import { toast } from 'sonner'

import type { Api, FieldKind, FieldMetaMap } from '../react/form'

import { unwrapZod } from '../zod'

const CAMEL_RE = /(?<lower>[a-z\d])(?<upper>[A-Z])/gu,
  FIRST_CHAR_RE = /^./u,
  Calendar = dynamic(async () => import('@a/ui/calendar').then(m => ({ default: m.Calendar })), {
    loading: () => <div className='h-64 w-full animate-pulse rounded-md bg-muted' />,
    ssr: false
  }),
  HEX_COLOR_REGEX = /^#[\dA-Fa-f]{6}$/u,
  DynamicFileField = dynamic(async () => import('./file-field'), {
    loading: () => <div className='h-32 w-full animate-pulse rounded-lg bg-muted' />,
    ssr: false
  }),
  FormContext = createContext<null | {
    form: Api<Record<string, unknown>>
    meta: FieldMetaMap
    schema: ZodObject<ZodRawShape>
    serverErrors: Record<string, string>
  }>(null),
  useFCtx = () => {
    const c = use(FormContext)
    if (!c) throw new Error('Field must be inside <Form>')
    return c
  },
  useField = (name: string, kind: FieldKind) => {
    const ctx = useFCtx(),
      info = ctx.meta[name]
    if (!info) throw new Error(`Unknown field: ${name}`)
    if (info.kind !== kind) throw new Error(`Field ${name} is not ${kind}`)
    return { form: ctx.form, info, schema: ctx.schema, serverErrors: ctx.serverErrors }
  },
  deriveLabel = (name: string): string => name.replace(CAMEL_RE, '$1 $2').replace(FIRST_CHAR_RE, c => c.toUpperCase()),
  defaultEnumOptions = (schema: ZodObject<ZodRawShape>, name: string): { label: string; value: string }[] => {
    const { schema: inner } = unwrapZod(schema.shape[name])
    if (inner && 'options' in inner) {
      const opts = (inner as { options: readonly string[] }).options
      return opts.map(v => ({ label: v.charAt(0).toUpperCase() + v.slice(1), value: v }))
    }
    throw new Error(`Choose: field "${name}" has no enum options. Pass options prop.`)
  },
  ServerFieldError = ({ className, name, ...props }: ComponentProps<'div'> & { name: string }) => {
    const ctx = useFCtx(),
      msg = ctx.serverErrors[name]
    if (!msg) return null
    return (
      <div
        className={cn('text-sm font-normal text-destructive', className)}
        data-slot='server-field-error'
        role='alert'
        {...props}>
        {msg}
      </div>
    )
  },
  fields = {
    Arr: ({
      containerClassName,
      'data-testid': testId,
      disabled,
      inputClassName,
      label,
      name,
      placeholder,
      tagClassName,
      transform,
      ...props
    }: Omit<ComponentProps<typeof Field>, 'children'> & {
      containerClassName?: string
      'data-testid'?: string
      disabled?: boolean
      inputClassName?: string
      label?: false | string
      name: string
      placeholder?: string
      tagClassName?: string
      transform?: (v: string) => string
    }) => {
      const { form, info } = useField(name, 'stringArray')
      return (
        <form.Field mode='array' name={name}>
          {(f: AnyFieldApi) => {
            const tags = (f.state.value ?? []) as string[],
              inv = f.state.meta.isTouched && !f.state.meta.isValid,
              mx = info.max,
              tid = testId ?? f.name,
              errorId = `${f.name}-error`
            return (
              <Field {...props} data-invalid={inv} data-testid={tid}>
                {label === false ? null : <FieldLabel htmlFor={f.name}>{label ?? deriveLabel(name)}</FieldLabel>}
                <div
                  className={cn(
                    'relative flex min-h-10 w-full flex-wrap items-center gap-0.75 rounded-md border border-input bg-transparent p-1 text-sm transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50 dark:bg-background',
                    containerClassName
                  )}>
                  {tags.map((t, i) => (
                    <p
                      className={cn(
                        'flex h-7 items-center gap-0.5 rounded-full bg-muted pr-1.5 pl-3 transition-all duration-300 hover:bg-input',
                        tagClassName,
                        disabled && 'cursor-not-allowed opacity-50 *:cursor-not-allowed'
                      )}
                      key={t}>
                      <span className='mb-px'>{t}</span>
                      <X
                        className='size-4 cursor-pointer rounded-full stroke-1 p-0.5 text-muted-foreground transition-all duration-300 hover:scale-110 hover:bg-background hover:stroke-2 hover:text-destructive active:scale-75'
                        onClick={() => {
                          if (!disabled) f.removeValue(i)
                        }}
                      />
                    </p>
                  ))}
                  <input
                    aria-describedby={inv ? errorId : undefined}
                    aria-invalid={inv}
                    className={cn(
                      'peer ml-1 w-0 flex-1 outline-none placeholder:text-muted-foreground placeholder:capitalize',
                      tags.length > 0 ? 'placeholder:opacity-0' : 'pl-1',
                      inputClassName
                    )}
                    disabled={disabled}
                    id={f.name}
                    name={f.name}
                    onBlur={f.handleBlur}
                    onKeyDown={e => {
                      const { value } = e.currentTarget
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (!value.trim()) return
                        const v = transform ? transform(value) : value
                        if (tags.includes(v)) {
                          toast.error('Item duplicated')
                          return
                        }
                        if (mx && tags.length + 1 > mx) {
                          toast.error(`Max ${mx}`)
                          return
                        }

                        f.handleChange([...new Set([...tags, v])])
                        e.currentTarget.value = ''
                      } else if (e.key === 'Backspace' && tags.length > 0 && !value.trim()) {
                        e.preventDefault()
                        f.removeValue(tags.length - 1)
                      }
                    }}
                    placeholder={tags.length > 0 ? undefined : placeholder}
                  />
                </div>
                {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
                <ServerFieldError name={name} />
              </Field>
            )
          }}
        </form.Field>
      )
    },
    Choose: ({
      'data-testid': testId,
      label,
      name,
      options: explicitOptions,
      placeholder,
      ...props
    }: Omit<ComponentProps<typeof Field>, 'children'> & {
      'data-testid'?: string
      label?: false | string
      name: string
      options?: readonly { label: string; value: string }[]
      placeholder?: string
    }) => {
      const { form, schema } = useField(name, 'string'),
        options = explicitOptions ?? defaultEnumOptions(schema, name)
      return (
        <form.Field name={name}>
          {(f: AnyFieldApi) => {
            const inv = f.state.meta.isTouched && !f.state.meta.isValid,
              tid = testId ?? f.name,
              errorId = `${f.name}-error`
            return (
              <Field {...props} data-invalid={inv} data-testid={tid}>
                {label === false ? null : <FieldLabel htmlFor={f.name}>{label ?? deriveLabel(name)}</FieldLabel>}
                <Select name={f.name} onValueChange={v => f.handleChange(v)} value={f.state.value ?? ''}>
                  <SelectTrigger
                    aria-describedby={inv ? errorId : undefined}
                    aria-invalid={inv}
                    id={f.name}
                    onBlur={f.handleBlur}>
                    <SelectValue placeholder={placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
                <ServerFieldError name={name} />
              </Field>
            )
          }}
        </form.Field>
      )
    },
    Colorpick: ({
      'data-testid': testId,
      label,
      name,
      ...props
    }: Omit<ComponentProps<typeof Field>, 'children'> & {
      'data-testid'?: string
      label?: false | string
      name: string
    }) => {
      const { form } = useField(name, 'string')
      return (
        <form.Field name={name}>
          {(f: AnyFieldApi) => {
            const inv = f.state.meta.isTouched && !f.state.meta.isValid,
              tid = testId ?? f.name,
              errorId = `${f.name}-error`,
              val = f.state.value ?? '#000000'
            return (
              <Field {...props} data-invalid={inv} data-testid={tid}>
                {label === false ? null : <FieldLabel htmlFor={f.name}>{label ?? deriveLabel(name)}</FieldLabel>}
                <div className='flex gap-2'>
                  <input
                    aria-describedby={inv ? errorId : undefined}
                    aria-invalid={inv}
                    className='size-10 cursor-pointer rounded-md border border-input'
                    id={f.name}
                    name={f.name}
                    onBlur={f.handleBlur}
                    onChange={e => f.handleChange(e.target.value)}
                    type='color'
                    value={val}
                  />
                  <Input
                    className='flex-1 font-mono'
                    onBlur={f.handleBlur}
                    onChange={e => {
                      const v = e.target.value
                      if (HEX_COLOR_REGEX.test(v)) f.handleChange(v)
                    }}
                    placeholder='#000000'
                    value={val}
                  />
                </div>
                {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
                <ServerFieldError name={name} />
              </Field>
            )
          }}
        </form.Field>
      )
    },
    Combobox: ({
      'data-testid': testId,
      emptyText = 'No results found.',
      label,
      name,
      options,
      placeholder = 'Select...',
      searchPlaceholder = 'Search...',
      ...props
    }: Omit<ComponentProps<typeof Field>, 'children'> & {
      'data-testid'?: string
      emptyText?: string
      label?: false | string
      name: string
      options: readonly { label: string; value: string }[]
      placeholder?: string
      searchPlaceholder?: string
    }) => {
      const { form } = useField(name, 'string'),
        [open, setOpen] = useState(false)
      return (
        <form.Field name={name}>
          {(f: AnyFieldApi) => {
            const inv = f.state.meta.isTouched && !f.state.meta.isValid,
              tid = testId ?? f.name,
              errorId = `${f.name}-error`,
              selected = options.find(o => o.value === f.state.value),
              listId = `${f.name}-listbox`
            return (
              <Field {...props} data-invalid={inv} data-testid={tid}>
                {label === false ? null : <FieldLabel htmlFor={f.name}>{label ?? deriveLabel(name)}</FieldLabel>}
                <Popover onOpenChange={setOpen} open={open}>
                  <PopoverTrigger asChild>
                    <Button
                      aria-controls={listId}
                      aria-describedby={inv ? errorId : undefined}
                      aria-expanded={open}
                      aria-invalid={inv}
                      className='w-full justify-between font-normal'
                      id={f.name}
                      onBlur={f.handleBlur}
                      role='combobox'
                      variant='outline'>
                      {selected ? selected.label : <span className='text-muted-foreground'>{placeholder}</span>}
                      <ChevronsUpDown className='ml-2 size-4 shrink-0 opacity-50' />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className='w-(--radix-popover-trigger-width) p-0'>
                    <Command>
                      <CommandInput placeholder={searchPlaceholder} />
                      <CommandList id={listId}>
                        <CommandEmpty>{emptyText}</CommandEmpty>
                        <CommandGroup>
                          {options.map(o => (
                            <CommandItem
                              key={o.value}
                              onSelect={() => {
                                f.handleChange(o.value === f.state.value ? '' : o.value)
                                setOpen(false)
                              }}
                              value={o.label}>
                              <Check
                                className={cn('mr-2 size-4', f.state.value === o.value ? 'opacity-100' : 'opacity-0')}
                              />
                              {o.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
                <ServerFieldError name={name} />
              </Field>
            )
          }}
        </form.Field>
      )
    },
    Datepick: ({
      clearable = true,
      'data-testid': testId,
      disabled,
      label,
      name,
      placeholder = 'Pick a date',
      ...props
    }: Omit<ComponentProps<typeof Field>, 'children'> & {
      clearable?: boolean
      'data-testid'?: string
      disabled?: boolean
      label?: false | string
      name: string
      placeholder?: string
    }) => {
      const { form } = useField(name, 'number')
      return (
        <form.Field name={name}>
          {(f: AnyFieldApi) => {
            const inv = f.state.meta.isTouched && !f.state.meta.isValid,
              ts = f.state.value as null | number | undefined,
              dateVal = ts ? new Date(ts) : undefined,
              tid = testId ?? f.name,
              errorId = `${f.name}-error`
            return (
              <Field {...props} data-invalid={inv} data-testid={tid}>
                {label === false ? null : <FieldLabel htmlFor={f.name}>{label ?? deriveLabel(name)}</FieldLabel>}
                <div className='flex gap-1'>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        aria-describedby={inv ? errorId : undefined}
                        aria-invalid={inv}
                        className={cn('flex-1 justify-start text-left font-normal', !dateVal && 'text-muted-foreground')}
                        data-testid={`${tid}-trigger`}
                        disabled={disabled}
                        id={f.name}
                        variant='outline'>
                        <CalendarIcon className='mr-2 size-4' />
                        {/* biome-ignore lint/nursery/noLeakedRender: ternary with string values is safe */}
                        {dateVal ? format(dateVal, 'PPP') : placeholder}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align='start' className='w-auto p-0' data-testid={`${tid}-calendar`}>
                      <Calendar
                        mode='single'
                        onSelect={d => {
                          f.handleChange(d ? d.getTime() : null)
                          f.handleBlur()
                        }}
                        selected={dateVal}
                      />
                    </PopoverContent>
                  </Popover>
                  {clearable && dateVal ? (
                    <Button
                      data-testid={`${tid}-clear`}
                      disabled={disabled}
                      onClick={() => {
                        f.handleChange(null)
                        f.handleBlur()
                      }}
                      size='icon'
                      type='button'
                      variant='outline'>
                      <X className='size-4' />
                    </Button>
                  ) : null}
                </div>
                {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
                <ServerFieldError name={name} />
              </Field>
            )
          }}
        </form.Field>
      )
    },
    Err: ({ className, error, ...props }: ComponentProps<'p'> & { error: Error | null }) =>
      error ? (
        <p className={cn('rounded-lg bg-destructive/10 p-3 text-sm text-destructive', className)} {...props} role='alert'>
          {error.message}
        </p>
      ) : null,
    File: ({
      accept,
      compressImg,
      'data-testid': testId,
      disabled,
      dropClassName,
      label,
      maxSize,
      name,
      ...props
    }: Omit<ComponentProps<typeof Field>, 'children'> & {
      accept?: string
      compressImg?: boolean
      'data-testid'?: string
      disabled?: boolean
      dropClassName?: string
      label?: false | string
      maxSize?: number
      name: string
    }) => {
      const { form } = useField(name, 'file')
      return (
        <form.Field name={name}>
          {(f: AnyFieldApi) => (
            <DynamicFileField
              accept={accept}
              compressImg={compressImg}
              data-testid={testId}
              disabled={disabled}
              dropClassName={dropClassName}
              field={f}
              label={label === false ? undefined : (label ?? deriveLabel(name))}
              maxSize={maxSize}
              {...props}
            />
          )}
        </form.Field>
      )
    },
    Files: ({
      accept,
      compressImg,
      'data-testid': testId,
      disabled,
      dropClassName,
      label,
      max,
      maxSize,
      name,
      ...props
    }: Omit<ComponentProps<typeof Field>, 'children'> & {
      accept?: string
      compressImg?: boolean
      'data-testid'?: string
      disabled?: boolean
      dropClassName?: string
      label?: false | string
      max?: number
      maxSize?: number
      name: string
    }) => {
      const { form, info } = useField(name, 'files')
      return (
        <form.Field mode='array' name={name}>
          {(f: AnyFieldApi) => (
            <DynamicFileField
              accept={accept}
              compressImg={compressImg}
              data-testid={testId}
              disabled={disabled}
              dropClassName={dropClassName}
              field={f}
              label={label === false ? undefined : (label ?? deriveLabel(name))}
              max={max ?? info.max}
              maxSize={maxSize}
              multiple
              {...props}
            />
          )}
        </form.Field>
      )
    },
    MultiSelect: ({
      'data-testid': testId,
      label,
      name,
      options,
      placeholder,
      ...props
    }: Omit<ComponentProps<typeof Field>, 'children'> & {
      'data-testid'?: string
      label?: false | string
      name: string
      options: readonly { label: string; value: string }[]
      placeholder?: string
    }) => {
      const { form, info } = useField(name, 'stringArray')
      return (
        <form.Field mode='array' name={name}>
          {(f: AnyFieldApi) => {
            const selected = (f.state.value ?? []) as string[],
              inv = f.state.meta.isTouched && !f.state.meta.isValid,
              mx = info.max,
              tid = testId ?? f.name,
              errorId = `${f.name}-error`
            return (
              <Field {...props} data-invalid={inv} data-testid={tid}>
                {label === false ? null : <FieldLabel htmlFor={f.name}>{label ?? deriveLabel(name)}</FieldLabel>}
                <Select
                  name={f.name}
                  onValueChange={v => {
                    if (selected.includes(v)) f.handleChange(selected.filter(x => x !== v))
                    else {
                      if (mx && selected.length >= mx) {
                        toast.error(`Max ${mx}`)
                        return
                      }
                      f.handleChange([...selected, v])
                    }
                  }}
                  value=''>
                  <SelectTrigger
                    aria-describedby={inv ? errorId : undefined}
                    aria-invalid={inv}
                    id={f.name}
                    onBlur={f.handleBlur}>
                    <SelectValue placeholder={selected.length > 0 ? `${selected.length} selected` : placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(o => (
                      <SelectItem className={selected.includes(o.value) ? 'bg-accent' : ''} key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selected.length > 0 ? (
                  <div className='flex flex-wrap gap-1'>
                    {selected.map(v => {
                      const opt = options.find(o => o.value === v)
                      return (
                        <p
                          className='flex h-7 items-center gap-0.5 rounded-full bg-muted pr-1.5 pl-3 text-sm transition-all duration-300 hover:bg-input'
                          key={v}>
                          <span className='mb-px'>{opt?.label ?? v}</span>
                          <X
                            className='size-4 cursor-pointer rounded-full stroke-1 p-0.5 text-muted-foreground transition-all duration-300 hover:scale-110 hover:bg-background hover:stroke-2 hover:text-destructive active:scale-75'
                            onClick={() => f.handleChange(selected.filter(x => x !== v))}
                          />
                        </p>
                      )
                    })}
                  </div>
                ) : null}
                {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
                <ServerFieldError name={name} />
              </Field>
            )
          }}
        </form.Field>
      )
    },
    Num: ({
      'data-testid': testId,
      label,
      name,
      ...props
    }: Omit<ComponentProps<'input'>, 'form' | 'id' | 'key' | 'name' | 'onBlur' | 'onChange' | 'type' | 'value'> & {
      'data-testid'?: string
      label?: false | string
      name: string
    }) => {
      const { form } = useField(name, 'number')
      return (
        <form.Field name={name}>
          {(f: AnyFieldApi) => {
            const inv = f.state.meta.isTouched && !f.state.meta.isValid,
              tid = testId ?? f.name,
              errorId = `${f.name}-error`
            return (
              <Field data-invalid={inv} data-testid={tid}>
                {label === false ? null : <FieldLabel htmlFor={f.name}>{label ?? deriveLabel(name)}</FieldLabel>}
                <Input
                  aria-describedby={inv ? errorId : undefined}
                  aria-invalid={inv}
                  id={f.name}
                  name={f.name}
                  onBlur={f.handleBlur}
                  onChange={e => {
                    const { value, valueAsNumber } = e.currentTarget
                    f.handleChange(value === '' || Number.isNaN(valueAsNumber) ? undefined : valueAsNumber)
                  }}
                  type='number'
                  value={f.state.value ?? ''}
                  {...props}
                />
                {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
                <ServerFieldError name={name} />
              </Field>
            )
          }}
        </form.Field>
      )
    },
    Rating: ({
      'data-testid': testId,
      label,
      max = 5,
      name,
      ...props
    }: Omit<ComponentProps<typeof Field>, 'children'> & {
      'data-testid'?: string
      label?: false | string
      max?: number
      name: string
    }) => {
      const { form } = useField(name, 'number')
      return (
        <form.Field name={name}>
          {(f: AnyFieldApi) => {
            const inv = f.state.meta.isTouched && !f.state.meta.isValid,
              tid = testId ?? f.name,
              errorId = `${f.name}-error`,
              val = f.state.value ?? 0
            return (
              <Field {...props} data-invalid={inv} data-testid={tid}>
                {label === false ? null : <FieldLabel htmlFor={f.name}>{label ?? deriveLabel(name)}</FieldLabel>}
                <div className='flex gap-1'>
                  {Array.from({ length: max }, (_, i) => i + 1).map(i => (
                    <Star
                      className={cn(
                        'size-6 cursor-pointer transition-all',
                        i <= val ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'
                      )}
                      key={i}
                      onBlur={f.handleBlur}
                      onClick={() => f.handleChange(i)}
                    />
                  ))}
                </div>
                {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
                <ServerFieldError name={name} />
              </Field>
            )
          }}
        </form.Field>
      )
    },
    Slider: ({
      'data-testid': testId,
      label,
      max = 100,
      min = 0,
      name,
      step = 1,
      ...props
    }: Omit<ComponentProps<typeof Field>, 'children'> & {
      'data-testid'?: string
      label?: false | string
      max?: number
      min?: number
      name: string
      step?: number
    }) => {
      const { form } = useField(name, 'number')
      return (
        <form.Field name={name}>
          {(f: AnyFieldApi) => {
            const inv = f.state.meta.isTouched && !f.state.meta.isValid,
              tid = testId ?? f.name,
              errorId = `${f.name}-error`,
              val = f.state.value ?? min
            return (
              <Field {...props} data-invalid={inv} data-testid={tid}>
                <div className='flex items-center justify-between'>
                  {label === false ? null : <FieldLabel htmlFor={f.name}>{label ?? deriveLabel(name)}</FieldLabel>}
                  <span className='text-sm text-muted-foreground'>{val}</span>
                </div>
                <UISlider
                  aria-describedby={inv ? errorId : undefined}
                  aria-invalid={inv}
                  id={f.name}
                  max={max}
                  min={min}
                  name={f.name}
                  onBlur={f.handleBlur}
                  onValueChange={([v]) => f.handleChange(v)}
                  step={step}
                  value={[val]}
                />
                {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
                <ServerFieldError name={name} />
              </Field>
            )
          }}
        </form.Field>
      )
    },
    Submit: ({
      children,
      disabled,
      Icon,
      ...props
    }: Omit<ComponentProps<typeof Button>, 'key' | 'type'> & { children: ReactNode; Icon?: LucideIcon }) => {
      const { form } = useFCtx()
      return (
        <form.Subscribe selector={s => s.isSubmitting}>
          {pending => (
            <Button disabled={disabled ?? pending} type='submit' {...props}>
              {pending ? <Spinner /> : Icon ? <Icon /> : null}
              {children}
            </Button>
          )}
        </form.Subscribe>
      )
    },
    Text: ({
      asyncDebounceMs = 300,
      asyncValidate,
      'data-testid': testId,
      label,
      maxLength,
      multiline,
      name,
      ...props
    }: Omit<
      ComponentProps<'input'> & ComponentProps<'textarea'>,
      'form' | 'id' | 'key' | 'maxLength' | 'name' | 'onBlur' | 'onChange' | 'value'
    > & {
      asyncDebounceMs?: number
      asyncValidate?: (value: string) => Promise<string | undefined>
      'data-testid'?: string
      label?: false | string
      maxLength?: number
      multiline?: boolean
      name: string
    }) => {
      const { form } = useField(name, 'string')
      return (
        <form.Field
          asyncDebounceMs={asyncDebounceMs}
          name={name}
          validators={
            asyncValidate
              ? {
                  onChangeAsync: async ({ value }: { value: string }) => {
                    const error = await asyncValidate(value)
                    return error
                  }
                }
              : undefined
          }>
          {(f: AnyFieldApi) => {
            const inv = f.state.meta.isTouched && !f.state.meta.isValid,
              validating = f.state.meta.isValidating,
              C = multiline ? Textarea : Input,
              val = f.state.value ?? '',
              tid = testId ?? f.name,
              errorId = `${f.name}-error`
            return (
              <Field data-invalid={inv} data-testid={tid}>
                <div className='flex items-center justify-between'>
                  {label === false ? null : <FieldLabel htmlFor={f.name}>{label ?? deriveLabel(name)}</FieldLabel>}
                  <div className='flex items-center gap-2'>
                    {validating ? (
                      <div className='flex items-center gap-1 text-xs text-muted-foreground'>
                        <Spinner className='size-3' />
                        <span>Validating...</span>
                      </div>
                    ) : null}
                    {maxLength ? (
                      <span className='text-xs text-muted-foreground'>
                        {String(val).length}/{maxLength}
                      </span>
                    ) : null}
                  </div>
                </div>
                <C
                  aria-describedby={inv ? errorId : undefined}
                  aria-invalid={inv}
                  id={f.name}
                  maxLength={maxLength}
                  name={f.name}
                  onBlur={f.handleBlur}
                  onChange={e => f.handleChange(e.target.value)}
                  value={val}
                  {...props}
                />
                {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
                <ServerFieldError name={name} />
              </Field>
            )
          }}
        </form.Field>
      )
    },
    Timepick: ({
      'data-testid': testId,
      label,
      name,
      placeholder = 'HH:MM',
      ...props
    }: Omit<ComponentProps<typeof Field>, 'children'> & {
      'data-testid'?: string
      label?: false | string
      name: string
      placeholder?: string
    }) => {
      const { form } = useField(name, 'string')
      return (
        <form.Field name={name}>
          {(f: AnyFieldApi) => {
            const inv = f.state.meta.isTouched && !f.state.meta.isValid,
              tid = testId ?? f.name,
              errorId = `${f.name}-error`
            return (
              <Field {...props} data-invalid={inv} data-testid={tid}>
                {label === false ? null : <FieldLabel htmlFor={f.name}>{label ?? deriveLabel(name)}</FieldLabel>}
                <Input
                  aria-describedby={inv ? errorId : undefined}
                  aria-invalid={inv}
                  id={f.name}
                  name={f.name}
                  onBlur={f.handleBlur}
                  onChange={e => f.handleChange(e.target.value)}
                  placeholder={placeholder}
                  type='time'
                  value={f.state.value ?? ''}
                />
                {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
                <ServerFieldError name={name} />
              </Field>
            )
          }}
        </form.Field>
      )
    },
    Toggle: ({
      'data-testid': testId,
      falseLabel,
      name,
      trueLabel,
      ...props
    }: Omit<ComponentProps<typeof Field>, 'children'> & {
      'data-testid'?: string
      falseLabel?: string
      name: string
      trueLabel: string
    }) => {
      const { form } = useField(name, 'boolean')
      return (
        <form.Field name={name}>
          {(f: AnyFieldApi) => {
            const inv = f.state.meta.isTouched && !f.state.meta.isValid,
              tid = testId ?? f.name,
              errorId = `${f.name}-error`
            return (
              <Field {...props} data-invalid={inv} data-testid={tid}>
                <div className='flex items-center gap-2'>
                  <Switch
                    aria-describedby={inv ? errorId : undefined}
                    aria-invalid={inv}
                    checked={f.state.value ?? false}
                    id={f.name}
                    name={f.name}
                    onBlur={f.handleBlur}
                    onCheckedChange={v => f.handleChange(v)}
                  />
                  <FieldLabel htmlFor={f.name}>{f.state.value ? trueLabel : (falseLabel ?? trueLabel)}</FieldLabel>
                </div>
                {inv ? <FieldError errors={f.state.meta.errors} id={errorId} /> : null}
                <ServerFieldError name={name} />
              </Field>
            )
          }}
        </form.Field>
      )
    }
  }

/** Exports form fields, context, and server error component. */
export type { Api }

export { deriveLabel, fields, FormContext, ServerFieldError }
