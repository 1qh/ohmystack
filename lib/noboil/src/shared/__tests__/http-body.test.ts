import { describe, expect, test } from 'bun:test'
import { jsonErr, parseHttpBody } from '../http-body'
describe('jsonErr', () => {
  test('returns Response with JSON body and status', async () => {
    const r = jsonErr('boom', 400)
    expect(r.status).toBe(400)
    const body = (await r.json()) as { error: string }
    expect(body.error).toBe('boom')
  })
})
describe('parseHttpBody', () => {
  test('parses valid JSON', async () => {
    const req = new Request('http://x', {
      body: JSON.stringify({ x: 1 }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    const r = await parseHttpBody(req)
    expect(r).toEqual({ x: 1 })
  })
  test('rejects non-JSON content type', async () => {
    const req = new Request('http://x', {
      body: 'plain',
      headers: { 'Content-Type': 'text/plain' },
      method: 'POST'
    })
    const r = await parseHttpBody(req)
    expect(r).toBeInstanceOf(Response)
    expect((r as Response).status).toBe(400)
  })
  test('rejects oversize via content-length', async () => {
    const req = new Request('http://x', {
      body: 'x',
      headers: { 'Content-Type': 'application/json', 'content-length': '99999999' },
      method: 'POST'
    })
    const r = await parseHttpBody(req, 1000)
    expect(r).toBeInstanceOf(Response)
    expect((r as Response).status).toBe(413)
  })
  test('rejects invalid JSON', async () => {
    const req = new Request('http://x', {
      body: '{not json}',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    const r = await parseHttpBody(req)
    expect(r).toBeInstanceOf(Response)
    expect((r as Response).status).toBe(400)
  })
  test('respects custom max', async () => {
    const big = JSON.stringify({ x: 'y'.repeat(2000) })
    const req = new Request('http://x', {
      body: big,
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
    const r = await parseHttpBody(req, 100)
    expect(r).toBeInstanceOf(Response)
    expect((r as Response).status).toBe(413)
  })
})
