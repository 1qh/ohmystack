interface QueryResult<T> {
  rows: T[]
}
interface SqlResultRow {
  rows: unknown[][]
  schema: { elements: { name: { some?: string } }[] }
}
const queryTable = async <T>(config: {
  columns?: string[]
  limit?: number
  moduleName: string
  table: string
  token: string
  uri: string
  where?: string
}): Promise<QueryResult<T>> => {
  const { columns = ['*'], limit, moduleName, table, token, uri, where } = config
  const cols = columns.join(', ')
  const sql = `SELECT ${cols} FROM ${table}${where ? ` WHERE ${where}` : ''}${limit ? ` LIMIT ${limit}` : ''}`
  const response = await fetch(`${uri}/v1/database/${moduleName}/sql`, {
    body: sql,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    method: 'POST'
  })
  if (!response.ok) return { rows: [] }
  const body = (await response.json().catch(() => [])) as SqlResultRow[]
  if (!Array.isArray(body) || body.length === 0) return { rows: [] }
  const result = body[0]
  if (!result) return { rows: [] }
  const keys = result.schema.elements.map(e => e.name.some ?? '')
  const rows: T[] = []
  for (const row of result.rows) {
    const arr = row
    const obj: Record<string, unknown> = {}
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i]
      if (key) obj[key] = arr[i]
    }
    rows.push(obj as T)
  }
  return { rows }
}
export { queryTable }
