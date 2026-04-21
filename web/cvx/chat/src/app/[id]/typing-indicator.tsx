'use client'
import { api } from '@a/be-convex'
import { usePresence } from 'noboil/convex/react'
import { useEffect, useRef } from 'react'
const TYPING_TIMEOUT_MS = 3000
const presenceRefs = {
  heartbeat: api.presence.heartbeat,
  leave: api.presence.leave,
  list: api.presence.list
}
const TypingIndicator = ({ chatId }: { chatId: string }) => {
  const { updatePresence, users } = usePresence(presenceRefs, chatId)
  const timerRef = useRef<null | ReturnType<typeof setTimeout>>(null)
  const updateRef = useRef(updatePresence)
  useEffect(() => {
    updateRef.current = updatePresence
  }, [updatePresence])
  const typingUsers = users.filter(
    u => typeof u.data === 'object' && u.data !== null && 'typing' in u.data && u.data.typing === true
  )
  useEffect(() => {
    const el = document.querySelector('[data-testid="chat-input"]')
    if (!el) return
    const onKeyDown = () => {
      updateRef.current({ typing: true })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        updateRef.current({ typing: false })
      }, TYPING_TIMEOUT_MS)
    }
    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [])
  if (typingUsers.length === 0) return null
  return (
    <p className='px-4 py-1 text-xs text-muted-foreground' data-testid='typing-indicator'>
      {typingUsers.length === 1 ? 'Someone is typing...' : `${String(typingUsers.length)} people are typing...`}
    </p>
  )
}
export default TypingIndicator
