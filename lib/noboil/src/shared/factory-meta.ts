/** Single source of truth for per-factory metadata used in docs and tooling. */
interface FactoryMeta {
  /** Fields the factory injects on every row, beyond the user-defined schema. */
  autoFields: readonly string[]
  description: string
  /** Indexes the factory creates automatically. */
  indexes: readonly string[]
  /** Wrapper helper invoked at table registration. */
  wrapper: string
}
const FACTORY_META: Record<string, FactoryMeta> = {
  base: {
    autoFields: ['updatedAt? (optional)'],
    description: 'External-data cache (TTL, refresh, invalidate)',
    indexes: ['(none — keyed by upstream id)'],
    wrapper: 'baseTable / cacheCrud'
  },
  child: {
    autoFields: ['parentId', 'updatedAt'],
    description: 'Child-of-parent CRUD with cascade options',
    indexes: ['by_parent'],
    wrapper: 'childTable / childCrud'
  },
  kv: {
    autoFields: ['key', 'updatedAt', 'createdAt', 'deletedAt? (when softDelete)'],
    description: 'Named key → value, public reads + role-gated writes',
    indexes: ['by_key (unique)'],
    wrapper: 'kvTable / kv'
  },
  log: {
    autoFields: ['parent', 'seq', 'userId', 'createdAt', 'idempotencyKey?', 'deletedAt? (when softDelete)'],
    description: 'Append-only event log with atomic seq + idempotency',
    indexes: ['by_parent_seq', 'by_idempotency'],
    wrapper: 'logTable / log'
  },
  org: {
    autoFields: ['userId', 'orgId', 'updatedAt'],
    description: 'Org-scoped CRUD with membership + role checks',
    indexes: ['by_org', 'by_org_user'],
    wrapper: 'orgTable / orgCrud'
  },
  orgDef: {
    autoFields: ['(n/a — org definition itself)'],
    description: 'The org definition (passed as orgSchema to noboil())',
    indexes: ['(n/a)'],
    wrapper: 'orgTables (via setup)'
  },
  owned: {
    autoFields: ['userId', 'updatedAt'],
    description: 'User-owned CRUD',
    indexes: ['by_user'],
    wrapper: 'ownedTable / crud'
  },
  quota: {
    autoFields: ['owner', 'timestamps[]'],
    description: 'Sliding-window rate limit primitive',
    indexes: ['by_owner (unique)'],
    wrapper: 'quotaTable / quota'
  },
  singleton: {
    autoFields: ['userId', 'updatedAt'],
    description: 'One row per user (get + upsert)',
    indexes: ['by_user'],
    wrapper: 'singletonTable / singletonCrud'
  }
}
export type { FactoryMeta }
export { FACTORY_META }
