/* oxlint-disable eslint(no-await-in-loop), eslint(complexity), eslint(max-depth), eslint-plugin-unicorn(prefer-ternary) */
/* eslint-disable no-continue, @typescript-eslint/no-unused-vars */
/** biome-ignore-all lint/performance/noAwaitInLoops: sequential mutations in property test */
/** biome-ignore-all lint/nursery/noContinue: skip iter on missing reservation */
import { describe, expect, test } from 'bun:test'
import type { Lcg } from '../../shared/test/index'
import { advanceNow, createLcg, restoreNow, setNow } from '../../shared/test/index'
import { makeBudget, periodKeyFor } from '../server/budget'
const DAY_MS = 24 * 60 * 60 * 1000
const CAP = 1000
const TOLERANCE = CAP * 1.1
const INFLIGHT_MAX = 8
interface DB {
  _next: number
  rows: Row[]
}
interface Row {
  _id: string
  balance: number
  inflight: number
  owner: string
  periodKey: string
}
const createDb = (): DB => ({ _next: 1, rows: [] })
const mkDb = (db: DB) => {
  const query = (_table: string) => {
    let filtered = [...db.rows]
    let ord: 'asc' | 'desc' = 'asc'
    const api = {
      collect: async () => filtered,
      first: async () => filtered[0] ?? null,
      order: (o: 'asc' | 'desc') => {
        ord = o
        return api
      },
      take: async (n: number) => {
        const sorted = ord === 'desc' ? [...filtered].toReversed() : filtered
        return sorted.slice(0, n)
      },
      unique: async () => filtered[0] ?? null,
      withIndex: (_name: string, fn: (q: unknown) => unknown) => {
        const ops: { field: string; op: string; val: unknown }[] = []
        const builder = {
          eq: (field: string, val: unknown) => {
            ops.push({ field, op: 'eq', val })
            return builder
          },
          lt: (field: string, val: unknown) => {
            ops.push({ field, op: 'lt', val })
            return builder
          }
        }
        fn(builder)
        for (const o of ops) {
          if (o.op === 'eq') filtered = filtered.filter(r => (r as unknown as Record<string, unknown>)[o.field] === o.val)
          if (o.op === 'lt')
            filtered = filtered.filter(
              r =>
                (r as unknown as Record<string, unknown>)[o.field] !== undefined &&
                ((r as unknown as Record<string, unknown>)[o.field] as number | string) < (o.val as number | string)
            )
        }
        return api
      }
    }
    return api
  }
  return {
    delete: async (id: string) => {
      db.rows = db.rows.filter(r => r._id !== id)
    },
    insert: async (_table: string, doc: Record<string, unknown>) => {
      const id = `id_${db._next}`
      db._next += 1
      const row: Row = {
        _id: id,
        balance: typeof doc.balance === 'number' ? doc.balance : 0,
        inflight: typeof doc.inflight === 'number' ? doc.inflight : 0,
        owner: typeof doc.owner === 'string' ? doc.owner : '',
        periodKey: typeof doc.periodKey === 'string' ? doc.periodKey : ''
      }
      db.rows.push(row)
      return id
    },
    patch: async (id: string, doc: Record<string, unknown>) => {
      for (const r of db.rows)
        if (r._id === id) {
          if (typeof doc.balance === 'number') r.balance = doc.balance
          if (typeof doc.inflight === 'number') r.inflight = doc.inflight
        }
    },
    query
  }
}
const captureBuilder = () => {
  const handlers: Record<string, (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>> = {}
  const m = ({ handler }: { args: unknown; handler: (...a: unknown[]) => unknown }) => {
    const fn = handler as (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
    return fn
  }
  const q = m
  return { handlers, m, q }
}
const setupBudget = () => {
  const db = createDb()
  const { m, q } = captureBuilder()
  const builders = { m, q } as unknown as Parameters<typeof makeBudget>[0]['builders']
  const exports = makeBudget({ builders, cap: CAP, inflightMax: INFLIGHT_MAX, table: 'budget' })
  const ctx = { db: mkDb(db), storage: {}, user: { _id: 'u1' } } as unknown as Record<string, unknown>
  return { ctx, db, exports }
}
const sumInflight = (db: DB, owner: string): number => {
  let s = 0
  for (const r of db.rows) if (r.owner === owner) s += r.inflight
  return s
}
const todayBalance = (db: DB, owner: string): number => {
  const key = periodKeyFor(Date.now(), DAY_MS)
  const row = db.rows.find(r => r.owner === owner && r.periodKey === key)
  return row?.balance ?? 0
}
interface Op {
  amount: number
  kind: 'reserve' | 'settle'
}
const planOps = (rng: Lcg, n: number): Op[] => {
  const ops: Op[] = []
  for (let i = 0; i < n; i += 1)
    ops.push({
      amount: rng.int(200) + 1,
      kind: rng.next() < 0.55 ? 'reserve' : 'settle'
    })
  return ops
}
describe('budget property invariants', () => {
  test('reserve+settle never exceeds tolerance, never produces negative inflight/balance', async () => {
    const seeds = [1, 7, 42, 99, 12_345]
    for (const seed of seeds) {
      setNow(Date.parse('2026-04-29T12:00:00Z'))
      const { ctx, db, exports } = setupBudget()
      const owner = `seed${seed}`
      const rng = createLcg(seed)
      const ops = planOps(rng, 200)
      const reservations: { amount: number; periodKey: string }[] = []
      for (const op of ops) {
        if (op.kind === 'reserve') {
          const r = await (
            exports.reserve as unknown as (
              c: unknown,
              a: Record<string, unknown>
            ) => Promise<{ balance: number; ok: boolean; periodKey: string; reason?: string }>
          )(ctx, { amount: op.amount, owner })
          if (r.ok) reservations.push({ amount: op.amount, periodKey: r.periodKey })
          expect(r.balance).toBeGreaterThanOrEqual(0)
          expect(r.balance).toBeLessThanOrEqual(TOLERANCE)
        } else if (reservations.length > 0) {
          const idx = rng.int(reservations.length)
          const reservation = reservations[idx]
          if (!reservation) continue
          reservations.splice(idx, 1)
          const actual = Math.max(0, Math.floor(reservation.amount * (rng.next() * 1.5)))
          await (exports.settle as unknown as (c: unknown, a: Record<string, unknown>) => Promise<void>)(ctx, {
            actualAmount: actual,
            owner,
            reservedAmount: reservation.amount,
            reservedPeriodKey: reservation.periodKey
          })
        }
        for (const r of db.rows.filter(rr => rr.owner === owner)) {
          expect(r.balance).toBeGreaterThanOrEqual(0)
          expect(r.inflight).toBeGreaterThanOrEqual(0)
        }
        expect(sumInflight(db, owner)).toBeLessThanOrEqual(INFLIGHT_MAX)
      }
      restoreNow()
    }
  })
  test('cap rejection prevents overshoot', async () => {
    setNow(Date.parse('2026-04-29T12:00:00Z'))
    const db = createDb()
    const { m, q } = captureBuilder()
    const builders = { m, q } as unknown as Parameters<typeof makeBudget>[0]['builders']
    const exports = makeBudget({ builders, cap: CAP, inflightMax: 1000, table: 'budget' })
    const ctx = { db: mkDb(db), storage: {}, user: { _id: 'u1' } } as unknown as Record<string, unknown>
    const owner = 'cap-test'
    let rejections = 0
    for (let i = 0; i < 50; i += 1) {
      const r = await (
        exports.reserve as unknown as (
          c: unknown,
          a: Record<string, unknown>
        ) => Promise<{ balance: number; ok: boolean; reason?: string }>
      )(ctx, { amount: 100, owner })
      if (!r.ok && r.reason === 'cap') rejections += 1
    }
    expect(todayBalance(db, owner)).toBeLessThanOrEqual(CAP)
    expect(rejections).toBeGreaterThan(0)
    restoreNow()
  })
  test('cross-period settlement books overage on current period', async () => {
    const { ctx, db, exports } = setupBudget()
    setNow(Date.parse('2026-04-28T12:00:00Z'))
    const owner = 'cross-period'
    const r = await (
      exports.reserve as unknown as (
        c: unknown,
        a: Record<string, unknown>
      ) => Promise<{ balance: number; ok: boolean; periodKey: string }>
    )(ctx, { amount: 100, owner })
    expect(r.ok).toBe(true)
    advanceNow(DAY_MS + 60_000)
    await (exports.settle as unknown as (c: unknown, a: Record<string, unknown>) => Promise<void>)(ctx, {
      actualAmount: 250,
      owner,
      reservedAmount: 100,
      reservedPeriodKey: r.periodKey
    })
    const today = periodKeyFor(Date.now(), DAY_MS)
    const yest = r.periodKey
    const yestRow = db.rows.find(rr => rr.owner === owner && rr.periodKey === yest)
    const todayRow = db.rows.find(rr => rr.owner === owner && rr.periodKey === today)
    expect(yestRow?.inflight ?? -1).toBe(0)
    expect(todayRow?.balance ?? 0).toBe(150)
    restoreNow()
  })
  test('inflight cap rejects reserve when at limit', async () => {
    const { ctx, exports } = setupBudget()
    setNow(Date.parse('2026-04-29T12:00:00Z'))
    const owner = 'inflight-test'
    let inflightRejections = 0
    for (let i = 0; i < INFLIGHT_MAX + 5; i += 1) {
      const r = await (
        exports.reserve as unknown as (
          c: unknown,
          a: Record<string, unknown>
        ) => Promise<{ balance: number; ok: boolean; reason?: string }>
      )(ctx, { amount: 1, owner })
      if (!r.ok && r.reason === 'inflight') inflightRejections += 1
    }
    expect(inflightRejections).toBeGreaterThanOrEqual(5)
    restoreNow()
  })
})
