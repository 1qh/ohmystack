/** biome-ignore-all lint/performance/noAwaitInLoops: sequential dup-row consolidation */
/** biome-ignore-all lint/complexity/useMaxParams: destructured builder options pattern matches singleton/cache-crud */
/* eslint-disable no-await-in-loop, @typescript-eslint/max-params */
/* oxlint-disable eslint(no-await-in-loop), eslint(max-params), eslint-plugin-unicorn(prefer-ternary) */
import { number, optional, string } from 'zod/v4'
import type { DbCtx, DbLike, HookCtx, Mb, MutCtx, Qb } from './types'
import { idx, typed } from './bridge'
import { dbInsert, dbPatch } from './helpers'
const DAY_MS = 24 * 60 * 60 * 1000
const PRUNE_BATCH = 500
const AUDIT_SCAN_BATCH = 1000
interface BudgetAuditSummary {
  overshootBalance: number
  overshootInflight: number
  rows: number
  stuckInflight: number
}
interface BudgetCheckResult {
  balance: number
  ok: boolean
}
interface BudgetExports {
  add: ReturnType<Mb>
  auditInvariants: ReturnType<Mb>
  check: ReturnType<Qb>
  pruneStale: ReturnType<Mb>
  reserve: ReturnType<Mb>
  settle: ReturnType<Mb>
}
interface BudgetHooks {
  afterReserve?: (ctx: HookCtx, args: { owner: string; result: BudgetReserveResult }) => Promise<void> | void
  afterSettle?: (
    ctx: HookCtx,
    args: { actualAmount: number; owner: string; reservedAmount: number }
  ) => Promise<void> | void
  beforeReserve?: (ctx: HookCtx, args: { amount: number; owner: string }) => Promise<void> | void
  onCapExceeded?: (ctx: HookCtx, args: { owner: string; reserve: number }) => Promise<void> | void
  onInflightExceeded?: (ctx: HookCtx, args: { inflight: number; owner: string }) => Promise<void> | void
}
interface BudgetReserveResult {
  balance: number
  ok: boolean
  periodKey: string
  reason?: 'cap' | 'inflight'
}
interface BudgetRow {
  _id: string
  balance: number
  inflight?: number
  owner: string
  periodKey: string
}
const periodKeyFor = (now: number, periodMs: number): string => {
  if (periodMs === DAY_MS) return new Date(now).toISOString().slice(0, 10)
  const idxNum = Math.floor(now / periodMs)
  return String(idxNum)
}
const hk = (c: MutCtx): HookCtx => ({ db: c.db, storage: c.storage, userId: c.user._id as string })
const getRows = async (db: DbLike, table: string, owner: string): Promise<BudgetRow[]> =>
  (await db
    .query(table)
    .withIndex(
      'by_owner',
      idx(o => o.eq('owner', owner))
    )
    .take(10)) as unknown as BudgetRow[]
const findRowForKey = async (
  db: DbLike,
  table: string,
  owner: string,
  key: string
): Promise<{ balance: number; id: null | string; inflight: number }> => {
  const rows = await getRows(db, table, owner)
  const row = rows.find(r => r.periodKey === key)
  return row ? { balance: row.balance, id: row._id, inflight: row.inflight ?? 0 } : { balance: 0, id: null, inflight: 0 }
}
const consolidate = async (
  db: DbLike,
  table: string,
  owner: string,
  current: string
): Promise<{ balance: number; id: null | string; inflight: number }> => {
  const rows = await getRows(db, table, owner)
  if (rows.length === 0) return { balance: 0, id: null, inflight: 0 }
  const cur = rows.find(r => r.periodKey === current)
  const stale = rows.filter(r => r._id !== cur?._id && r.periodKey < current && (r.inflight ?? 0) === 0)
  for (const d of stale) await db.delete(d._id)
  if (!cur) return { balance: 0, id: null, inflight: 0 }
  return { balance: cur.balance, id: cur._id, inflight: cur.inflight ?? 0 }
}
const makeBudget = ({
  builders: b,
  cap,
  capTolerance = 1.1,
  estimatePerCall = 100,
  hooks,
  inflightMax = 8,
  periodMs = DAY_MS,
  table
}: {
  builders: { m: Mb; q: Qb }
  cap: number
  capTolerance?: number
  estimatePerCall?: number
  hooks?: BudgetHooks
  inflightMax?: number
  periodMs?: number
  table: string
}): BudgetExports => {
  const tolerance = cap * capTolerance
  const check = b.q({
    args: typed({ owner: string() }),
    handler: typed(async (c: DbCtx, { owner }: { owner: string }): Promise<BudgetCheckResult> => {
      const key = periodKeyFor(Date.now(), periodMs)
      const rows = await getRows(c.db, table, owner)
      const balance = rows.find(r => r.periodKey === key)?.balance ?? 0
      return { balance, ok: balance < cap }
    })
  })
  const reserve = b.m({
    args: typed({ amount: optional(number()), owner: string() }),
    handler: typed(
      async (c: MutCtx, { amount, owner }: { amount?: number; owner: string }): Promise<BudgetReserveResult> => {
        const reserveAmt = amount ?? estimatePerCall
        if (hooks?.beforeReserve) await hooks.beforeReserve(hk(c), { amount: reserveAmt, owner })
        const key = periodKeyFor(Date.now(), periodMs)
        const before = await consolidate(c.db, table, owner, key)
        if (before.inflight >= inflightMax) {
          const result: BudgetReserveResult = { balance: before.balance, ok: false, periodKey: key, reason: 'inflight' }
          if (hooks?.onInflightExceeded) await hooks.onInflightExceeded(hk(c), { inflight: before.inflight, owner })
          if (hooks?.afterReserve) await hooks.afterReserve(hk(c), { owner, result })
          return result
        }
        if (before.balance + reserveAmt > cap) {
          const result: BudgetReserveResult = { balance: before.balance, ok: false, periodKey: key, reason: 'cap' }
          if (hooks?.onCapExceeded) await hooks.onCapExceeded(hk(c), { owner, reserve: reserveAmt })
          if (hooks?.afterReserve) await hooks.afterReserve(hk(c), { owner, result })
          return result
        }
        const nextBalance = before.balance + reserveAmt
        const nextInflight = before.inflight + 1
        if (before.id) await dbPatch(c.db, before.id, { balance: nextBalance, inflight: nextInflight })
        else await dbInsert(c.db, table, { balance: nextBalance, inflight: 1, owner, periodKey: key })
        const result: BudgetReserveResult = { balance: nextBalance, ok: true, periodKey: key }
        if (hooks?.afterReserve) await hooks.afterReserve(hk(c), { owner, result })
        return result
      }
    )
  })
  const settle = b.m({
    args: typed({
      actualAmount: number(),
      owner: string(),
      reservedAmount: number(),
      reservedPeriodKey: string()
    }),
    handler: typed(
      async (
        c: MutCtx,
        args: { actualAmount: number; owner: string; reservedAmount: number; reservedPeriodKey: string }
      ): Promise<void> => {
        const { actualAmount, owner, reservedAmount, reservedPeriodKey: rKey } = args
        const reserved = await findRowForKey(c.db, table, owner, rKey)
        const cur = periodKeyFor(Date.now(), periodMs)
        if (!reserved.id) {
          if (actualAmount > 0) {
            const curRow = await findRowForKey(c.db, table, owner, cur)
            const next = curRow.balance + actualAmount
            if (curRow.id) await dbPatch(c.db, curRow.id, { balance: next })
            else await dbInsert(c.db, table, { balance: actualAmount, owner, periodKey: cur })
          }
          if (hooks?.afterSettle) await hooks.afterSettle(hk(c), { actualAmount, owner, reservedAmount })
          return
        }
        const inflight = Math.max(0, reserved.inflight - 1)
        if (rKey === cur) {
          const delta = actualAmount - reservedAmount
          const next = Math.max(0, reserved.balance + delta)
          await dbPatch(c.db, reserved.id, { balance: next, inflight })
          if (hooks?.afterSettle) await hooks.afterSettle(hk(c), { actualAmount, owner, reservedAmount })
          return
        }
        const refundOld = Math.min(actualAmount, reservedAmount) - reservedAmount
        const oldNext = Math.max(0, reserved.balance + refundOld)
        await dbPatch(c.db, reserved.id, { balance: oldNext, inflight })
        const overage = Math.max(0, actualAmount - reservedAmount)
        if (overage > 0) {
          const curRow = await findRowForKey(c.db, table, owner, cur)
          const next = curRow.balance + overage
          if (curRow.id) await dbPatch(c.db, curRow.id, { balance: next })
          else await dbInsert(c.db, table, { balance: overage, owner, periodKey: cur })
        }
        if (hooks?.afterSettle) await hooks.afterSettle(hk(c), { actualAmount, owner, reservedAmount })
      }
    )
  })
  const add = b.m({
    args: typed({ amount: number(), owner: string(), periodKey: optional(string()) }),
    handler: typed(async (c: MutCtx, args: { amount: number; owner: string; periodKey?: string }): Promise<void> => {
      const key = args.periodKey ?? periodKeyFor(Date.now(), periodMs)
      const before = await findRowForKey(c.db, table, args.owner, key)
      const next = Math.max(0, before.balance + args.amount)
      if (before.id) await dbPatch(c.db, before.id, { balance: next })
      else if (next > 0) await dbInsert(c.db, table, { balance: next, owner: args.owner, periodKey: key })
    })
  })
  const pruneStale = b.m({
    args: typed({}),
    handler: typed(async (c: MutCtx): Promise<void> => {
      const cur = periodKeyFor(Date.now(), periodMs)
      const candidates = (await c.db
        .query(table)
        .withIndex(
          'by_periodKey',
          idx(o => o.lt('periodKey', cur))
        )
        .take(PRUNE_BATCH)) as unknown as BudgetRow[]
      const deletable = candidates.filter(r => (r.inflight ?? 0) === 0)
      await Promise.all(deletable.map(async r => c.db.delete(r._id)))
    })
  })
  const auditInvariants = b.m({
    args: typed({}),
    handler: typed(async (c: MutCtx): Promise<BudgetAuditSummary> => {
      const cur = periodKeyFor(Date.now(), periodMs)
      const prevKey = periodKeyFor(Date.now() - periodMs, periodMs)
      const rows = (await c.db.query(table).take(AUDIT_SCAN_BATCH)) as unknown as BudgetRow[]
      let overshootBalance = 0
      let overshootInflight = 0
      let stuckInflight = 0
      for (const r of rows) {
        if (r.balance > tolerance) overshootBalance += 1
        if ((r.inflight ?? 0) > inflightMax) overshootInflight += 1
        if (r.periodKey < prevKey && (r.inflight ?? 0) > 0) stuckInflight += 1
      }
      return { overshootBalance, overshootInflight, rows: rows.length, stuckInflight, ...(cur ? {} : {}) }
    })
  })
  return typed({ add, auditInvariants, check, pruneStale, reserve, settle })
}
export type { BudgetAuditSummary, BudgetCheckResult, BudgetExports, BudgetHooks, BudgetReserveResult }
export { makeBudget, periodKeyFor }
