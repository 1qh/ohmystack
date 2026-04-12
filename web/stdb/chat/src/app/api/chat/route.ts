// oxlint-disable promise/avoid-new
// biome-ignore-all lint/style/noProcessEnv: intentional process.env access
import type { UIMessage } from 'ai'
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
interface ApprovalResponse {
  approved: boolean
  id: string
}
interface ChatRequestBody {
  id?: string
  message?: UIMessage
  messages?: UIMessage[]
}
interface ToolPart {
  approval?: ApprovalResponse
  input?: Record<string, unknown>
  state?: string
  toolCallId?: string
  toolName?: string
  type?: string
}
const WEATHER_LOCATION_RE = /weather(?:\s+in)?\s+(?<location>[a-zA-Z\s-]+)/u
const TRAILING_PUNCT_RE = /[?.!,]+$/u
const WEATHER_WORD_RE = /\bweather\b/iu
const withUnavailable = () => Response.json({ error: 'AI not available' }, { status: 503 })
const isTestMode = () => process.env.NEXT_PUBLIC_PLAYWRIGHT === '1' || process.env.SPACETIMEDB_TEST_MODE === 'true'
const sleep = async (ms: number) =>
  new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
const getMessages = (body: ChatRequestBody): UIMessage[] => {
  if (body.messages && body.messages.length > 0) return body.messages
  if (body.message) return [body.message]
  return []
}
const getTextFromMessage = (message: UIMessage): string => {
  const values: string[] = []
  for (const part of message.parts) if (part.type === 'text') values.push(part.text)
  return values.join(' ').trim()
}
const getLastUserText = (messages: UIMessage[]): string => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.role === 'user') return getTextFromMessage(message)
  }
  return ''
}
const getLatestApprovalPart = (messages: UIMessage[]): null | ToolPart => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message)
      for (let j = message.parts.length - 1; j >= 0; j -= 1) {
        const part = message.parts[j] as ToolPart
        if (part.type?.startsWith('tool-') && part.state === 'approval-responded' && part.approval?.id) return part
      }
  }
  return null
}
const getLocation = (text: string): string => {
  const match = WEATHER_LOCATION_RE.exec(text)
  if (!match) return 'London'
  const location = match[1]?.trim()
  if (!location) return 'London'
  return location.replace(TRAILING_PUNCT_RE, '')
}
const POST = async (request: Request) => {
  if (!isTestMode()) return withUnavailable()
  const body = (await request.json()) as ChatRequestBody
  const messages = getMessages(body)
  const lastUserText = getLastUserText(messages)
  const latestApproval = getLatestApprovalPart(messages)
  const chatId = body.id ?? 'chat'
  const toolCallId = latestApproval?.toolCallId ?? `${chatId}-getWeather`
  const approvalId = latestApproval?.approval?.id ?? `${toolCallId}-approval`
  const location = getLocation(lastUserText)
  const weatherIntent = WEATHER_WORD_RE.test(lastUserText)
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      await sleep(500)
      writer.write({ type: 'start' })
      if (latestApproval?.approval?.approved === false) {
        writer.write({ toolCallId, type: 'tool-output-denied' })
        writer.write({ id: `${chatId}-text-denied`, type: 'text-start' })
        writer.write({ delta: 'Tool call denied.', id: `${chatId}-text-denied`, type: 'text-delta' })
        writer.write({ id: `${chatId}-text-denied`, type: 'text-end' })
        writer.write({ finishReason: 'stop', type: 'finish' })
        return
      }
      if (latestApproval?.approval?.approved) {
        writer.write({
          output: { condition: 'Clear', location, temperatureCelsius: 22 },
          toolCallId,
          type: 'tool-output-available'
        })
        writer.write({ id: `${chatId}-text-weather`, type: 'text-start' })
        writer.write({
          delta: `The weather in ${location} is clear at 22°C.`,
          id: `${chatId}-text-weather`,
          type: 'text-delta'
        })
        writer.write({ id: `${chatId}-text-weather`, type: 'text-end' })
        writer.write({ finishReason: 'stop', type: 'finish' })
        return
      }
      if (weatherIntent) {
        writer.write({ input: { location }, toolCallId, toolName: 'getWeather', type: 'tool-input-available' })
        writer.write({ approvalId, toolCallId, type: 'tool-approval-request' })
        writer.write({ finishReason: 'tool-calls', type: 'finish' })
        return
      }
      writer.write({ id: `${chatId}-text-main`, type: 'text-start' })
      writer.write({
        delta: `Mock response: ${lastUserText || 'Hello from Playwright test mode.'}`,
        id: `${chatId}-text-main`,
        type: 'text-delta'
      })
      writer.write({ id: `${chatId}-text-main`, type: 'text-end' })
      writer.write({ finishReason: 'stop', type: 'finish' })
    }
  })
  return createUIMessageStreamResponse({ stream })
}
const DELETE = (request: Request) => {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return new Response('Bad request', { status: 400 })
  return new Response(`Deleted ${id}`, { status: 200 })
}
const maxDuration = 60
export { DELETE, maxDuration, POST }
