type ActiveOrgQuery<T> = ((args: { orgId: string }) => Promise<null | T>) | SqlQueryConfig

interface SqlQueryConfig {
  sql: string
}

export type { ActiveOrgQuery, SqlQueryConfig }
