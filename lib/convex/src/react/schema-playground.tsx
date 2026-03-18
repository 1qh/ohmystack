/* oxlint-disable eslint/complexity */
'use client'
import { useCallback, useMemo, useState } from 'react'

import type { SchemaField, SchemaTable } from '../schema-utils'

import { endpointsForFactory, extractSchemaFields } from '../schema-utils'

/** Props for customizing the SchemaPlayground component. */
interface PlaygroundProps {
  /** Additional CSS class for the outer container. */
  className?: string
  /** Default schema text to display. */
  defaultValue?: string
  /** Additional CSS class for the endpoint list section. */
  endpointClassName?: string
  /** Additional CSS class for the textarea editor. */
  inputClassName?: string
  /** Called when schema text changes. */
  onChange?: (value: string) => void
  /** Placeholder text for the editor. */
  placeholder?: string
  /** If true, the editor is read-only — useful for embedding in docs. */
  readOnly?: boolean
  /** Additional CSS class for the table list section. */
  tableClassName?: string
}

const FACTORY_COLORS: Record<string, string> = {
    cacheCrud: 'text-purple-400',
    childCrud: 'text-cyan-400',
    crud: 'text-emerald-400',
    orgCrud: 'text-blue-400',
    singletonCrud: 'text-orange-400'
  },
  FACTORY_DESCRIPTIONS: Record<string, string> = {
    cacheCrud: 'Cache with TTL, SWR, purge',
    childCrud: 'Parent-child with cascading',
    crud: 'Owned CRUD with soft-delete',
    orgCrud: 'Org-scoped with ACL & roles',
    singletonCrud: 'Single-row config store'
  },
  DEFAULT_SCHEMA = `const owned = makeOwned({
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
})`,
  FieldBadge = ({ field }: { field: SchemaField }) => (
    <span className='inline-flex items-center gap-1 rounded-sm bg-zinc-800 px-1.5 py-0.5 text-xs'>
      <span className='font-mono text-zinc-300'>{field.field}</span>
      <span className='text-zinc-500'>{field.type}</span>
    </span>
  ),
  TableCard = ({ table }: { table: SchemaTable }) => {
    const colorClass = FACTORY_COLORS[table.factory] ?? 'text-zinc-400',
      endpoints = endpointsForFactory({ factory: table.factory, file: '', options: '', table: table.table })
    return (
      <div className='rounded-lg border border-zinc-800 bg-zinc-900/50 p-3'>
        <div className='flex items-center gap-2'>
          <span className='font-mono font-medium text-zinc-200'>{table.table}</span>
          <span className={`rounded-sm px-1.5 py-0.5 text-xs font-medium ${colorClass} bg-zinc-800`}>{table.factory}</span>
        </div>
        {table.fields.length > 0 ? (
          <div className='mt-2 flex flex-wrap gap-1'>
            {table.fields.map(f => (
              <FieldBadge field={f} key={f.field} />
            ))}
          </div>
        ) : null}
        <div className='mt-2 border-t border-zinc-800 pt-2'>
          <p className='mb-1 text-xs text-zinc-500'>Endpoints ({endpoints.length})</p>
          <div className='flex flex-wrap gap-1'>
            {endpoints.map(ep => (
              <span className='rounded-sm bg-zinc-800/80 px-1.5 py-0.5 font-mono text-xs text-zinc-400' key={ep}>
                {ep}
              </span>
            ))}
          </div>
        </div>
      </div>
    )
  },
  /** Interactive playground for previewing @noboil/convex schema tables and their generated endpoints. */
  SchemaPlayground = ({
    className,
    defaultValue = DEFAULT_SCHEMA,
    endpointClassName,
    inputClassName,
    onChange,
    placeholder = 'Paste your schema here...',
    readOnly = false,
    tableClassName
  }: PlaygroundProps) => {
    const [value, setValue] = useState(defaultValue),
      handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
          setValue(e.target.value)
          onChange?.(e.target.value)
        },
        [onChange]
      ),
      tables = useMemo(() => extractSchemaFields(value), [value]),
      totalFields = useMemo(() => {
        let count = 0
        for (const t of tables) count += t.fields.length
        return count
      }, [tables]),
      totalEndpoints = useMemo(() => {
        let count = 0
        for (const t of tables)
          count += endpointsForFactory({ factory: t.factory, file: '', options: '', table: t.table }).length
        return count
      }, [tables])

    return (
      <div className={`flex flex-col gap-4 lg:flex-row ${className ?? ''}`}>
        <div className='flex min-w-0 flex-1 flex-col'>
          <div className='flex items-center justify-between pb-2'>
            <span className='text-sm font-medium text-zinc-300'>Schema Definition</span>
            <span className='text-xs text-zinc-500'>
              {tables.length} table{tables.length === 1 ? '' : 's'} · {totalFields} field
              {totalFields === 1 ? '' : 's'}
            </span>
          </div>
          <textarea
            className={`min-h-48 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none ${inputClassName ?? ''}`}
            onChange={handleChange}
            placeholder={placeholder}
            readOnly={readOnly}
            value={value}
          />
        </div>
        <div className={`flex min-w-0 flex-1 flex-col ${tableClassName ?? ''}`}>
          <div className='flex items-center justify-between pb-2'>
            <span className='text-sm font-medium text-zinc-300'>Generated Preview</span>
            <span className={`text-xs text-zinc-500 ${endpointClassName ?? ''}`}>
              {totalEndpoints} endpoint{totalEndpoints === 1 ? '' : 's'}
            </span>
          </div>
          {tables.length === 0 ? (
            <div className='flex flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-800 p-8'>
              <p className='text-sm text-zinc-500'>
                {value.trim()
                  ? 'No tables detected. Use makeOwned, makeOrgScoped, etc.'
                  : 'Enter a schema to preview generated endpoints'}
              </p>
            </div>
          ) : (
            <div className='space-y-3'>
              {tables.map(t => (
                <TableCard key={`${t.factory}-${t.table}`} table={t} />
              ))}
              <div className='rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-3'>
                <p className='text-xs text-zinc-500'>
                  Factory types:{' '}
                  {[...new Set(tables.map(t => t.factory))].map(f => (
                    <span className={`mr-2 ${FACTORY_COLORS[f] ?? ''}`} key={f}>
                      {f}
                    </span>
                  ))}
                </p>
                <p className='mt-1 text-xs text-zinc-600'>
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
export type { PlaygroundProps }
