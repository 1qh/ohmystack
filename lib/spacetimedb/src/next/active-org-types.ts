type ActiveOrgQuery<T> = ((args: { orgId: string }) => Promise<null | T>) | SqlQueryConfig | TableQueryConfig
interface SqlQueryConfig {
  sql: string
}
interface TableQueryConfig {
  table: string
}
export type { ActiveOrgQuery, SqlQueryConfig, TableQueryConfig }
