import { describe, expect, test } from 'bun:test'
import { createSseFrameParser } from '../sse'
describe('createSseFrameParser', () => {
  test('parses single data frame', () => {
    const p = createSseFrameParser()
    const events = p.feed('data: hello\n\n')
    expect(events).toEqual([{ data: 'hello' }])
  })
  test('parses event + data', () => {
    const p = createSseFrameParser()
    const events = p.feed('event: ping\ndata: hello\n\n')
    expect(events).toEqual([{ data: 'hello', event: 'ping' }])
  })
  test('parses id + data', () => {
    const p = createSseFrameParser()
    const events = p.feed('id: 42\ndata: x\n\n')
    expect(events).toEqual([{ data: 'x', id: '42' }])
  })
  test('parses multi-line data joined with newline', () => {
    const p = createSseFrameParser()
    const events = p.feed('data: line1\ndata: line2\n\n')
    expect(events).toEqual([{ data: 'line1\nline2' }])
  })
  test('handles split chunks', () => {
    const p = createSseFrameParser()
    expect(p.feed('data: he')).toEqual([])
    expect(p.feed('llo\n\n')).toEqual([{ data: 'hello' }])
  })
  test('emits multiple frames in single feed', () => {
    const p = createSseFrameParser()
    const events = p.feed('data: a\n\ndata: b\n\n')
    expect(events).toEqual([{ data: 'a' }, { data: 'b' }])
  })
  test('skips frame with no data', () => {
    const p = createSseFrameParser()
    const events = p.feed(': comment only\n\n')
    expect(events).toEqual([])
  })
  test('flush returns final partial frame if it has data', () => {
    const p = createSseFrameParser()
    p.feed('data: pending')
    expect(p.flush()).toEqual([{ data: 'pending' }])
  })
  test('flush on empty buffer returns []', () => {
    const p = createSseFrameParser()
    expect(p.flush()).toEqual([])
  })
  test('handles data: without space', () => {
    const p = createSseFrameParser()
    const events = p.feed('data:nospace\n\n')
    expect(events).toEqual([{ data: 'nospace' }])
  })
})
