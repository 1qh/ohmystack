import type { UIMessage } from 'ai'
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null,
  toUIRole = (role: unknown): UIMessage['role'] => {
    if (role === 'assistant' || role === 'system' || role === 'user') return role
    return 'assistant'
  },
  toUIParts = (parts: unknown): UIMessage['parts'] => {
    if (!Array.isArray(parts)) return []
    const out: UIMessage['parts'] = []
    for (const p of parts) if (isObject(p) && typeof p.type === 'string') out.push(p as UIMessage['parts'][number])
    return out
  },
  toUIMessage = ({ id, parts, role }: { id: string; parts: unknown; role: unknown }): UIMessage => ({
    id,
    parts: toUIParts(parts),
    role: toUIRole(role)
  })
export { toUIMessage, toUIParts, toUIRole }
