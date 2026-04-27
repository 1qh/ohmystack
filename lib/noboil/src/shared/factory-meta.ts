/** Single source of truth for per-factory metadata used in docs and tooling. */
interface FactoryMeta {
  /** Fields the factory injects on every row, beyond the user-defined schema. */
  autoFields: readonly string[]
  description: string
  /** Generated endpoints/reducers (concise summary). */
  generates: string
  /** Indexes the factory creates automatically. */
  indexes: readonly string[]
  /** Conceptual shape for high-level tables. */
  shape: string
  /** Slot name used in `schema({ ... })` (may differ from brand key). */
  slot: string
  /** Use cases (real-world examples). */
  useFor: string
  /** Wrapper helper invoked at table registration. */
  wrapper: string
}
const FACTORY_META: Record<string, FactoryMeta> = {
  base: {
    autoFields: ['updatedAt? (optional)'],
    description: 'External-data cache (TTL, refresh, invalidate)',
    generates: '`get`/`load`/`refresh`/`invalidate`/`purge`',
    indexes: ['(none — keyed by upstream id)'],
    shape: 'keyed external API cache',
    slot: 'base',
    useFor: 'TMDB movies, Gravatar avatars',
    wrapper: 'baseTable / cacheCrud'
  },
  child: {
    autoFields: ['parentId', 'updatedAt'],
    description: 'Child-of-parent CRUD with cascade options',
    generates: '`create`/`list`/`rm`/`update` by parentId',
    indexes: ['by_parent'],
    shape: 'nested under a parent',
    slot: 'children',
    useFor: 'comments under posts, items under orders',
    wrapper: 'childTable / childCrud'
  },
  kv: {
    autoFields: ['key', 'updatedAt', 'createdAt', 'deletedAt? (when softDelete)'],
    description: 'Named key → value, public reads + role-gated writes',
    generates: '`get` (public) / `set`/`rm` (role-gated)',
    indexes: ['by_key (unique)'],
    shape: 'string-keyed state',
    slot: 'kv',
    useFor: 'feature flags, status banners, site config',
    wrapper: 'kvTable / kv'
  },
  log: {
    autoFields: ['parent', 'seq', 'userId', 'createdAt', 'idempotencyKey?', 'deletedAt? (when softDelete)'],
    description: 'Append-only event log with atomic seq + idempotency',
    generates: '`append`/`listAfter`/`purgeByParent` with per-parent `seq` + idempotency',
    indexes: ['by_parent_seq', 'by_idempotency'],
    shape: 'append-only event stream',
    slot: 'log',
    useFor: 'messages, audit trails, event sourcing',
    wrapper: 'logTable / log'
  },
  org: {
    autoFields: ['userId', 'orgId', 'updatedAt'],
    description: 'Org-scoped CRUD with membership + role checks',
    generates: '`addEditor`/`removeEditor` + full CRUD',
    indexes: ['by_org', 'by_org_user'],
    shape: 'org-scoped with editors',
    slot: 'orgScoped',
    useFor: 'multi-tenant, team-shared resources',
    wrapper: 'orgTable / orgCrud'
  },
  orgDef: {
    autoFields: ['(n/a — org definition itself)'],
    description: 'The org definition (passed as orgSchema to noboil())',
    generates: '(none — used at setup time)',
    indexes: ['(n/a)'],
    shape: '(n/a — meta-schema)',
    slot: 'org',
    useFor: 'orgSchema config for noboil()',
    wrapper: 'orgTables (via setup)'
  },
  owned: {
    autoFields: ['userId', 'updatedAt'],
    description: 'User-owned CRUD',
    generates: '`create`/`list`/`read`/`update`/`rm`',
    indexes: ['by_user'],
    shape: 'user-scoped',
    slot: 'owned',
    useFor: 'user-owned data (posts, chats, tasks)',
    wrapper: 'ownedTable / crud'
  },
  quota: {
    autoFields: ['owner', 'timestamps[]'],
    description: 'Sliding-window rate limit primitive',
    generates: '`check`/`record`/`consume`',
    indexes: ['by_owner (unique)'],
    shape: 'sliding-window rate limit',
    slot: 'quota',
    useFor: 'anti-spam, vote throttling, API limits',
    wrapper: 'quotaTable / quota'
  },
  singleton: {
    autoFields: ['userId', 'updatedAt'],
    description: 'One row per user (get + upsert)',
    generates: '`get`/`upsert`',
    indexes: ['by_user'],
    shape: 'one per user',
    slot: 'singleton',
    useFor: 'user preferences, profiles',
    wrapper: 'singletonTable / singletonCrud'
  }
}
/** Schema marker source patterns used by doctor/check to identify a schema file. */
const SCHEMA_MARKERS = [
  'makeOwned(',
  'makeOrgScoped(',
  'makeSingleton(',
  'makeBase(',
  'makeLog(',
  'makeKv(',
  'makeQuota(',
  'child('
] as const
/** Factory invocation names for the `factoryPat` regex in audit tools. */
const FACTORY_INVOKE_NAMES = ['crud', 'orgCrud', 'childCrud', 'cacheCrud', 'singletonCrud', 'log', 'kv', 'quota'] as const
export type { FactoryMeta }
export { FACTORY_INVOKE_NAMES, FACTORY_META, SCHEMA_MARKERS }
