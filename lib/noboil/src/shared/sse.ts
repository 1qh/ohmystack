interface SseEvent {
  data: string
  event?: string
  id?: string
}
const FRAME_DELIM = '\n\n'
const parseFrame = (frame: string): null | SseEvent => {
  const lines = frame.split('\n')
  const dataLines: string[] = []
  let event: string | undefined
  let id: string | undefined
  for (const line of lines)
    if (line.startsWith('data: ')) dataLines.push(line.slice(6))
    else if (line.startsWith('data:')) dataLines.push(line.slice(5))
    else if (line.startsWith('event: ')) event = line.slice(7)
    else if (line.startsWith('id: ')) id = line.slice(4)
  if (dataLines.length === 0) return null
  return { data: dataLines.join('\n'), ...(event ? { event } : {}), ...(id ? { id } : {}) }
}
const createSseFrameParser = (): { feed: (chunk: string) => SseEvent[]; flush: () => SseEvent[] } => {
  let buffer = ''
  const feed = (chunk: string): SseEvent[] => {
    buffer += chunk
    const out: SseEvent[] = []
    let idx = buffer.indexOf(FRAME_DELIM)
    while (idx !== -1) {
      const frame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + FRAME_DELIM.length)
      const ev = parseFrame(frame)
      if (ev) out.push(ev)
      idx = buffer.indexOf(FRAME_DELIM)
    }
    return out
  }
  const flush = (): SseEvent[] => {
    if (!buffer) return []
    const ev = parseFrame(buffer)
    buffer = ''
    return ev ? [ev] : []
  }
  return { feed, flush }
}
export type { SseEvent }
export { createSseFrameParser }
