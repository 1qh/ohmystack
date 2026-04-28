import { describe, expect, test } from 'bun:test'
import type { LogLevel } from '../log'
import { log, setLogSink } from '../log'
describe('log', () => {
  test('emits JSON line through custom sink', () => {
    const lines: { level: LogLevel; raw: string }[] = []
    setLogSink((raw, level) => {
      lines.push({ level, raw })
    })
    log('info', 'hello', { x: 1 })
    log('error', 'boom', { reason: 'bad' })
    setLogSink(null)
    expect(lines).toHaveLength(2)
    const first = JSON.parse(lines[0]?.raw ?? '{}') as Record<string, unknown>
    expect(first.event).toBe('hello')
    expect(first.level).toBe('info')
    expect(first.x).toBe(1)
    expect(typeof first.ts).toBe('number')
    const second = JSON.parse(lines[1]?.raw ?? '{}') as Record<string, unknown>
    expect(second.event).toBe('boom')
    expect(second.level).toBe('error')
    expect(second.reason).toBe('bad')
    expect(lines[0]?.level).toBe('info')
    expect(lines[1]?.level).toBe('error')
  })
  test('default sink is restored when null passed', () => {
    setLogSink(() => undefined)
    setLogSink(null)
    expect(() => log('info', 'restored')).not.toThrow()
  })
})
