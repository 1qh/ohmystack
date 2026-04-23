/** biome-ignore-all lint/suspicious/noArrayIndexKey: stable per-field */
/** biome-ignore-all lint/style/noNonNullAssertion: bounded pick-list */
/* oxlint-disable eslint-plugin-react(no-array-index-key), no-promise-executor-return, eslint-plugin-promise(param-names), typescript-eslint(strict-void-return), typescript-eslint(no-unnecessary-condition), typescript-eslint(no-non-null-assertion) */
/* eslint-disable react/no-array-index-key, @eslint-react/no-array-index-key, @typescript-eslint/no-non-null-assertion */
import type { ReactNode } from 'react'
import { Box, render, Text, useApp, useInput } from 'ink'
import { useCallback, useState } from 'react'
interface Field {
  enumValues?: string[]
  name: string
  optional: boolean
  type: FieldType
}
type FieldType = 'boolean' | 'enum' | 'number' | 'string'
type TableType = 'cache' | 'child' | 'org' | 'owned' | 'singleton'
interface WizardConfig {
  kind: 'convex' | 'spacetimedb'
  typeDescriptions: Record<TableType, string>
}
interface WizardResult {
  fields: Field[]
  name: string
  parent: string
  type: TableType
}
const TABLE_TYPES: TableType[] = ['owned', 'org', 'singleton', 'cache', 'child']
const FIELD_TYPES: FieldType[] = ['string', 'number', 'boolean', 'enum']
type Phase = 'enum' | 'field-add' | 'field-name' | 'field-optional' | 'field-type' | 'name' | 'parent' | 'review' | 'type'
const NameInput = ({
  initial = '',
  label,
  onConfirm
}: {
  initial?: string
  label: string
  onConfirm: (v: string) => void
}) => {
  const [value, setValue] = useState(initial)
  useInput((input, key) => {
    if (key.return && value.trim()) onConfirm(value.trim())
    else if (key.backspace || key.delete) setValue(v => v.slice(0, -1))
    else if (input && !key.ctrl && !key.meta) setValue(v => v + input)
  })
  return (
    <Box flexDirection='column'>
      <Text bold>{label}</Text>
      <Box marginTop={1}>
        <Text color='cyan'>› </Text>
        <Text>{value}</Text>
        <Text color='cyan'>_</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↵ confirm</Text>
      </Box>
    </Box>
  )
}
const PickList = <T extends string>({
  getDesc,
  items,
  label,
  onPick
}: {
  getDesc?: (item: T) => string
  items: T[]
  label: string
  onPick: (v: T) => void
}) => {
  const [idx, setIdx] = useState(0)
  useInput((input, key) => {
    if (key.upArrow || input === 'k') setIdx(i => (i === 0 ? items.length - 1 : i - 1))
    else if (key.downArrow || input === 'j') setIdx(i => (i === items.length - 1 ? 0 : i + 1))
    else if (key.return) onPick(items[idx]!)
  })
  return (
    <Box flexDirection='column'>
      <Text bold>{label}</Text>
      <Box flexDirection='column' marginTop={1}>
        {items.map((item, i) => (
          <Box key={item}>
            <Text color={i === idx ? 'cyan' : undefined}>{i === idx ? '› ' : '  '}</Text>
            <Text bold={i === idx} color={i === idx ? 'cyan' : undefined}>
              {item.padEnd(12)}
            </Text>
            {getDesc ? <Text dimColor>{getDesc(item)}</Text> : null}
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓/jk select · ↵ confirm</Text>
      </Box>
    </Box>
  )
}
const YesNo = ({ label, onConfirm }: { label: string; onConfirm: (v: boolean) => void }) => {
  const [yes, setYes] = useState(false)
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') onConfirm(true)
    else if (input === 'n' || input === 'N') onConfirm(false)
    else if (key.leftArrow || key.rightArrow || input === ' ') setYes(v => !v)
    else if (key.return) onConfirm(yes)
  })
  return (
    <Box flexDirection='column'>
      <Text bold>{label}</Text>
      <Box marginTop={1}>
        <Text color={yes ? 'green' : undefined}>{yes ? '[ yes ] ' : '  yes  '}</Text>
        <Text dimColor> / </Text>
        <Text color={yes ? undefined : 'yellow'}>{yes ? '  no   ' : '[ no  ]'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>y/n · space toggle · ↵ confirm</Text>
      </Box>
    </Box>
  )
}
const Summary = ({
  fields,
  name,
  onConfirm,
  parent,
  type
}: {
  fields: Field[]
  name: string
  onConfirm: (accept: boolean) => void
  parent: string
  type: TableType
}) => {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y' || key.return) onConfirm(true)
    else if (input === 'n' || input === 'N' || input === 'q') onConfirm(false)
  })
  return (
    <Box flexDirection='column'>
      <Text bold color='cyan'>
        Review
      </Text>
      <Box flexDirection='column' marginTop={1}>
        <Text>
          <Text dimColor>name: </Text>
          {name}
        </Text>
        <Text>
          <Text dimColor>type: </Text>
          {type}
        </Text>
        {parent ? (
          <Text>
            <Text dimColor>parent: </Text>
            {parent}
          </Text>
        ) : null}
        <Text dimColor>fields:</Text>
        {fields.length === 0 ? (
          <Text dimColor> (none — defaults will be used)</Text>
        ) : (
          fields.map((f, i) => (
            <Text key={i}>
              <Text dimColor> · </Text>
              {f.name}: {f.type === 'enum' ? `enum(${(f.enumValues ?? []).join(',')})` : f.type}
              {f.optional ? <Text dimColor> (optional)</Text> : null}
            </Text>
          ))
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↵/y generate · n cancel</Text>
      </Box>
    </Box>
  )
}
const AddWizardApp = ({ config, onExit }: { config: WizardConfig; onExit: (r: null | WizardResult) => void }) => {
  const app = useApp()
  const [name, setName] = useState('')
  const [type, setType] = useState<TableType>('owned')
  const [parent, setParent] = useState('')
  const [fields, setFields] = useState<Field[]>([])
  const [currentField, setCurrentField] = useState<Partial<Field>>({})
  const [phase, setPhase] = useState<Phase>('name')
  const handleNameConfirm = useCallback((v: string) => {
    setName(v)
    setPhase('type')
  }, [])
  const handleTypePick = useCallback((v: TableType) => {
    setType(v)
    if (v === 'child') setPhase('parent')
    else setPhase('field-add')
  }, [])
  const handleParent = useCallback((v: string) => {
    setParent(v)
    setPhase('field-add')
  }, [])
  const handleFieldAdd = useCallback((addMore: boolean) => {
    if (addMore) setPhase('field-name')
    else setPhase('review')
  }, [])
  const handleFieldName = useCallback((v: string) => {
    setCurrentField({ name: v })
    setPhase('field-type')
  }, [])
  const handleFieldType = useCallback((v: FieldType) => {
    setCurrentField(f => ({ ...f, type: v }))
    if (v === 'enum') setPhase('enum')
    else setPhase('field-optional')
  }, [])
  const handleEnumValues = useCallback((v: string) => {
    const values = v
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    setCurrentField(f => ({ ...f, enumValues: values }))
    setPhase('field-optional')
  }, [])
  const handleFieldOptional = useCallback(
    (optional: boolean) => {
      const finalized: Field = {
        enumValues: currentField.enumValues,
        name: currentField.name ?? '',
        optional,
        type: currentField.type ?? 'string'
      }
      setFields(fs => [...fs, finalized])
      setCurrentField({})
      setPhase('field-add')
    },
    [currentField]
  )
  const handleReview = useCallback(
    (accept: boolean) => {
      app.exit()
      onExit(accept ? { fields, name, parent, type } : null)
    },
    [app, fields, name, onExit, parent, type]
  )
  const header: ReactNode = (
    <Box flexDirection='column' marginBottom={1}>
      <Text bold color='cyan'>
        noboil-{config.kind === 'convex' ? 'convex' : 'stdb'} add
      </Text>
      <Text dimColor>scaffold a new table + endpoints + page</Text>
    </Box>
  )
  return (
    <Box flexDirection='column' padding={1}>
      {header}
      {phase === 'name' ? <NameInput label='Table name' onConfirm={handleNameConfirm} /> : null}
      {phase === 'type' ? (
        <PickList<TableType>
          getDesc={t => config.typeDescriptions[t]}
          items={TABLE_TYPES}
          label='Table type'
          onPick={handleTypePick}
        />
      ) : null}
      {phase === 'parent' ? <NameInput label='Parent table name' onConfirm={handleParent} /> : null}
      {phase === 'field-add' ? (
        <YesNo
          label={fields.length > 0 ? `Add another field? (${fields.length} added)` : 'Add a field?'}
          onConfirm={handleFieldAdd}
        />
      ) : null}
      {phase === 'field-name' ? (
        <NameInput label={`Field #${fields.length + 1} name`} onConfirm={handleFieldName} />
      ) : null}
      {phase === 'field-type' ? (
        <PickList<FieldType> items={FIELD_TYPES} label={`Field #${fields.length + 1} type`} onPick={handleFieldType} />
      ) : null}
      {phase === 'enum' ? (
        <NameInput label='Enum values (comma-separated, e.g. low,medium,high)' onConfirm={handleEnumValues} />
      ) : null}
      {phase === 'field-optional' ? <YesNo label='Optional field?' onConfirm={handleFieldOptional} /> : null}
      {phase === 'review' ? (
        <Summary fields={fields} name={name} onConfirm={handleReview} parent={parent} type={type} />
      ) : null}
    </Box>
  )
}
const runAddWizard = async (config: WizardConfig): Promise<null | WizardResult> =>
  new Promise(resolve => {
    const { unmount } = render(<AddWizardApp config={config} onExit={resolve} />)
    process.on('SIGINT', () => {
      unmount()
      resolve(null)
    })
  })
export type { Field, TableType, WizardConfig, WizardResult }
export { runAddWizard }
