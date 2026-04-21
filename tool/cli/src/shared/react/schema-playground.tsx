/* oxlint-disable eslint/complexity */
'use client'
import { cn } from '@a/ui'
import { useCallback, useMemo, useState } from 'react'
interface FactoryCall {
  factory: string
  file: string
  options: string
  table: string
}
interface PlaygroundLabels {
  generatedCountNoun: string
  generatedEmptyWithoutSchema: string
  generatedEmptyWithSchema: string
  generatedTitle: string
  tableItemsLabel: string
}
interface PlaygroundProps {
  className?: string
  defaultValue?: string
  endpointClassName?: string
  endpointsForFactory: (call: FactoryCall) => string[]
  extractSchemaFields: (content: string) => SchemaTable[]
  inputClassName?: string
  labels: PlaygroundLabels
  onChange?: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  tableClassName?: string
}
interface SchemaField {
  field: string
  type: string
}
interface SchemaTable {
  factory: string
  fields: SchemaField[]
  table: string
}
const FACTORY_COLORS: Record<string, string> = {
  cacheCrud: 'text-primary',
  childCrud: 'text-primary',
  crud: 'text-primary',
  orgCrud: 'text-primary',
  singletonCrud: 'text-foreground'
}
const FACTORY_DESCRIPTIONS: Record<string, string> = {
  cacheCrud: 'Cache with TTL, SWR, purge',
  childCrud: 'Parent-child with cascading',
  crud: 'Owned CRUD with soft-delete',
  orgCrud: 'Org-scoped with ACL & roles',
  singletonCrud: 'Single-row config store'
}
const DEFAULT_SCHEMA = `const owned = makeOwned({
  blog: object({
    title: string().min(1),
    content: string(),
    published: boolean(),
  }),
})
const orgScoped = makeOrgScoped({
  project: object({
    name: string(),
    description: optional(string()),
  }),
})`
const FieldBadge = ({ field }: { field: SchemaField }) => (
  <span className='inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs'>
    <span className='font-mono text-foreground'>{field.field}</span>
    <span className='text-foreground/70'>{field.type}</span>
  </span>
)
const TableCard = ({
  endpointsForFactory,
  labels,
  table
}: {
  endpointsForFactory: (call: FactoryCall) => string[]
  labels: PlaygroundLabels
  table: SchemaTable
}) => {
  const colorClass = FACTORY_COLORS[table.factory] ?? 'text-muted-foreground'
  const items = endpointsForFactory({ factory: table.factory, file: '', options: '', table: table.table })
  return (
    <div className='rounded-lg border border-border bg-background/50 p-3'>
      <div className='flex items-center gap-2'>
        <span className='font-mono font-medium text-foreground'>{table.table}</span>
        <span className={cn('rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium', colorClass)}>{table.factory}</span>
      </div>
      {table.fields.length > 0 ? (
        <div className='mt-2 flex flex-wrap gap-1'>
          {table.fields.map(f => (
            <FieldBadge field={f} key={f.field} />
          ))}
        </div>
      ) : null}
      <div className='mt-2 border-t border-border pt-2'>
        <p className='mb-1 text-xs text-muted-foreground'>
          {labels.tableItemsLabel} ({items.length})
        </p>
        <div className='flex flex-wrap gap-1'>
          {items.map(item => (
            <span className='rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground' key={item}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
const SchemaPlayground = ({
  className,
  defaultValue = DEFAULT_SCHEMA,
  endpointClassName,
  extractSchemaFields,
  endpointsForFactory,
  inputClassName,
  labels,
  onChange,
  placeholder = 'Paste your schema here...',
  readOnly = false,
  tableClassName
}: PlaygroundProps) => {
  const [value, setValue] = useState(defaultValue)
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value)
      onChange?.(e.target.value)
    },
    [onChange]
  )
  const tables = useMemo(() => extractSchemaFields(value), [extractSchemaFields, value])
  const totalFields = useMemo(() => {
    let count = 0
    for (const t of tables) count += t.fields.length
    return count
  }, [tables])
  const totalItems = useMemo(() => {
    let count = 0
    for (const t of tables)
      count += endpointsForFactory({ factory: t.factory, file: '', options: '', table: t.table }).length
    return count
  }, [endpointsForFactory, tables])
  return (
    <div className={cn('flex flex-col gap-4 lg:flex-row', className)}>
      <div className='flex min-w-0 flex-1 flex-col'>
        <div className='flex items-center justify-between pb-2'>
          <span className='text-sm font-medium text-foreground'>Schema Definition</span>
          <span className='text-xs text-muted-foreground'>
            {tables.length} table{tables.length === 1 ? '' : 's'} · {totalFields} field
            {totalFields === 1 ? '' : 's'}
          </span>
        </div>
        <textarea
          className={cn(
            'min-h-48 w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none',
            inputClassName
          )}
          onChange={handleChange}
          placeholder={placeholder}
          readOnly={readOnly}
          value={value}
        />
      </div>
      <div className={cn('flex min-w-0 flex-1 flex-col', tableClassName)}>
        <div className='flex items-center justify-between pb-2'>
          <span className='text-sm font-medium text-foreground'>{labels.generatedTitle}</span>
          <span className={cn('text-xs text-muted-foreground', endpointClassName)}>
            {totalItems} {labels.generatedCountNoun}
            {totalItems === 1 ? '' : 's'}
          </span>
        </div>
        {tables.length === 0 ? (
          <div className='flex flex-1 items-center justify-center rounded-lg border border-dashed border-border p-8'>
            <p className='text-sm text-muted-foreground'>
              {value.trim() ? labels.generatedEmptyWithSchema : labels.generatedEmptyWithoutSchema}
            </p>
          </div>
        ) : (
          <div className='space-y-3'>
            {tables.map(t => (
              <TableCard
                endpointsForFactory={endpointsForFactory}
                key={`${t.factory}-${t.table}`}
                labels={labels}
                table={t}
              />
            ))}
            <div className='rounded-lg border border-border/50 bg-background/30 p-3'>
              <p className='text-xs text-muted-foreground'>
                Factory types:{' '}
                {[...new Set(tables.map(t => t.factory))].map(f => (
                  <span className={cn('mr-2', FACTORY_COLORS[f])} key={f}>
                    {f}
                  </span>
                ))}
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>
                {[...new Set(tables.map(t => t.factory))].map(f => (
                  <span className='mr-3' key={f}>
                    {f}: {FACTORY_DESCRIPTIONS[f] ?? ''}
                  </span>
                ))}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
export default SchemaPlayground
export type { FactoryCall, PlaygroundLabels, PlaygroundProps, SchemaField, SchemaTable }
