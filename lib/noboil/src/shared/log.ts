type LogLevel = 'debug' | 'error' | 'info' | 'warn'
type LogSink = (line: string, level: LogLevel) => void
const defaultSink: LogSink = (line, level) => {
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line)
    return
  }
  // eslint-disable-next-line no-console
  console.log(line)
}
let sink: LogSink = defaultSink
const setLogSink = (s: LogSink | null): void => {
  sink = s ?? defaultSink
}
const log = (level: LogLevel, event: string, fields: Record<string, unknown> = {}): void => {
  const line = JSON.stringify({ event, level, ts: Date.now(), ...fields })
  sink(line, level)
}
export type { LogLevel, LogSink }
export { log, setLogSink }
