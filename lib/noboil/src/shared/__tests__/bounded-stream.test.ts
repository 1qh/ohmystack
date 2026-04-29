import { describe, expect, test } from 'bun:test'
import { boundedBody, withCancelHook } from '../bounded-stream'
const makeStream = (chunks: Uint8Array[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start: c => {
      for (const ch of chunks) c.enqueue(ch)
      c.close()
    }
  })
const drain = async (s: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const reader = s.getReader()
  const out: number[] = []
  let done = false
  while (!done) {
    const { done: d, value } = await reader.read()
    done = d
    if (value) for (const b of value) out.push(b)
  }
  return new Uint8Array(out)
}
describe('boundedBody', () => {
  test('null body returns null', () => {
    expect(boundedBody(null, 1000)).toBeNull()
  })
  test('passes through under limit', async () => {
    const s = makeStream([new Uint8Array([1, 2, 3, 4])])
    const wrapped = boundedBody(s, 100)
    if (!wrapped) throw new Error('expected stream')
    const drained = await drain(wrapped)
    expect([...drained]).toEqual([1, 2, 3, 4])
  })
  test('errors when exceeding max + onExceed fires', async () => {
    let exceeded = false
    let aborted = false
    const s = makeStream([new Uint8Array(50), new Uint8Array(60)])
    const wrapped = boundedBody(s, 100, {
      onAbort: () => {
        aborted = true
      },
      onExceed: () => {
        exceeded = true
      }
    })
    if (!wrapped) throw new Error('expected stream')
    await expect(drain(wrapped)).rejects.toThrow('body too large')
    expect(exceeded).toBe(true)
    expect(aborted).toBe(true)
  })
  test('onClose fires on normal completion', async () => {
    let closed = false
    const s = makeStream([new Uint8Array([1])])
    const wrapped = boundedBody(s, 100, {
      onClose: () => {
        closed = true
      }
    })
    if (!wrapped) throw new Error('expected stream')
    await drain(wrapped)
    expect(closed).toBe(true)
  })
})
describe('withCancelHook', () => {
  test('passes data through unchanged', async () => {
    const s = makeStream([new Uint8Array([1, 2, 3])])
    const wrapped = withCancelHook(s, () => undefined)
    expect([...(await drain(wrapped))]).toEqual([1, 2, 3])
  })
  test('fires onCancel when stream cancelled', async () => {
    let cancelled = false
    const s = makeStream([new Uint8Array([1])])
    const wrapped = withCancelHook(s, () => {
      cancelled = true
    })
    const reader = wrapped.getReader()
    await reader.cancel('test')
    expect(cancelled).toBe(true)
  })
})
