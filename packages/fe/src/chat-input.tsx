'use client'

import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from '@a/ui/ai-elements/prompt-input'
import { useState } from 'react'

interface ChatInputProps {
  disabled?: boolean
  isBusy: boolean
  onAbort?: () => void
  onSubmit: (text: string) => Promise<void> | void
  placeholder?: string
}

const ChatInput = ({ disabled = false, isBusy, onAbort, onSubmit, placeholder = 'Type a message...' }: ChatInputProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false),
    handleSubmit = async ({ text }: { text: string }) => {
      if (!text.trim() || isSubmitting || isBusy) return
      setIsSubmitting(true)
      try {
        await Promise.resolve(onSubmit(text))
      } finally {
        setIsSubmitting(false)
      }
    },
    effectiveBusy = isSubmitting || isBusy

  return (
    <PromptInput className='mx-auto max-w-3xl' onSubmit={handleSubmit}>
      <PromptInputTextarea data-testid='chat-input' disabled={disabled ? true : effectiveBusy} placeholder={placeholder} />
      <PromptInputFooter>
        <div />
        <PromptInputSubmit
          data-testid={effectiveBusy ? 'stop-button' : 'send-button'}
          onClick={effectiveBusy && onAbort ? onAbort : undefined}
          status={effectiveBusy ? 'streaming' : 'ready'}
        />
      </PromptInputFooter>
    </PromptInput>
  )
}

export default ChatInput
