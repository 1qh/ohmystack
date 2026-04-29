import { describe, expect, test } from 'bun:test'
import { arrayBufferToBase64, base64ToBytes } from '../binary'
import { errorMessage } from '../errors'
import { flagEmoji } from '../flag-emoji'
import { bucket, BUCKET_ORDER, groupByTime } from '../time-bucket'
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
describe('errorMessage', () => {
  test('Error → message', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })
  test('object with data → stringified data', () => {
    expect(errorMessage({ data: 'detail' })).toBe('detail')
  })
  test('primitive → string', () => {
    expect(errorMessage(42)).toBe('42')
    expect(errorMessage(null)).toBe('null')
    expect(errorMessage('plain')).toBe('plain')
  })
})
describe('flagEmoji', () => {
  test('valid ISO2 returns flag', () => {
    expect(flagEmoji('US')).toBe('🇺🇸')
    expect(flagEmoji('vn')).toBe('🇻🇳')
    expect(flagEmoji('JP')).toBe('🇯🇵')
  })
  test('invalid input returns empty', () => {
    expect(flagEmoji(undefined)).toBe('')
    expect(flagEmoji('')).toBe('')
    expect(flagEmoji('USA')).toBe('')
    expect(flagEmoji('1A')).toBe('')
  })
})
describe('time-bucket', () => {
  test('bucket labels by age', () => {
    const now = Date.now()
    expect(bucket(now - HOUR_MS, now)).toBe('Today')
    expect(bucket(now - DAY_MS - HOUR_MS, now)).toBe('Yesterday')
    expect(bucket(now - 5 * DAY_MS, now)).toBe('Previous 7 days')
    expect(bucket(now - 30 * DAY_MS, now)).toBe('Older')
  })
  test('groupByTime preserves order', () => {
    const now = Date.now()
    const items = [
      { label: 'today1', updatedAt: now - HOUR_MS },
      { label: 'old', updatedAt: now - 30 * DAY_MS },
      { label: 'yest', updatedAt: now - DAY_MS - HOUR_MS },
      { label: 'prev', updatedAt: now - 5 * DAY_MS }
    ]
    const groups = groupByTime(items, now)
    expect(groups.map(g => g.label)).toEqual(BUCKET_ORDER.filter(l => groups.some(g => g.label === l)))
  })
  test('empty input → empty groups', () => {
    expect(groupByTime([], Date.now())).toEqual([])
  })
})
describe('binary utils', () => {
  test('arrayBufferToBase64 / base64ToBytes round-trip', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const b64 = arrayBufferToBase64(original.buffer)
    const restored = base64ToBytes(b64)
    expect([...restored]).toEqual([...original])
  })
  test('large buffer chunks correctly', () => {
    const big = new Uint8Array(20_000)
    for (let i = 0; i < big.length; i += 1) big[i] = i % 256
    const b64 = arrayBufferToBase64(big.buffer)
    const restored = base64ToBytes(b64)
    expect(restored.length).toBe(big.length)
    expect(restored[0]).toBe(0)
    expect(restored[100]).toBe(100)
    expect(restored[256]).toBe(0)
  })
})
