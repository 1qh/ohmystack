'use client'
/* oxlint-disable forbid-component-props -- shadcn/Tailwind pattern requires className/style on shared components */
import type { ComponentProps } from 'react'
import { cn } from '@a/ui'
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from '@a/ui/ai-elements/prompt-input'
import { useState } from 'react'
interface ChatInputProps {
  containerClassName?: string
  disabled?: boolean
  footerClassName?: string
  footerProps?: Omit<ComponentProps<typeof PromptInputFooter>, 'children'>
  inputClassName?: string
  inputProps?: Omit<ComponentProps<typeof PromptInputTextarea>, 'disabled' | 'placeholder'>
  isBusy: boolean
  onAbort?: () => void
  onSubmit: (text: string) => Promise<void> | void
  placeholder?: string
  rootProps?: Omit<ComponentProps<typeof PromptInput>, 'children' | 'onSubmit'>
  submitProps?: Omit<ComponentProps<typeof PromptInputSubmit>, 'onClick' | 'status'>
}
const ChatInput = ({
  containerClassName,
  disabled = false,
  footerClassName,
  footerProps,
  inputClassName,
  inputProps,
  isBusy,
  onAbort,
  onSubmit,
  placeholder = 'Type a message...',
  rootProps,
  submitProps
}: ChatInputProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const handleSubmit = async ({ text }: { text: string }) => {
    if (!text.trim() || isSubmitting || isBusy) return
    setIsSubmitting(true)
    try {
      await Promise.resolve(onSubmit(text))
    } finally {
      setIsSubmitting(false)
    }
  }
  const effectiveBusy = isSubmitting || isBusy
  return (
    <PromptInput
      {...rootProps}
      className={cn('mx-auto max-w-3xl', containerClassName, rootProps?.className)}
      onSubmit={handleSubmit}>
      <PromptInputTextarea
        {...inputProps}
        className={cn(inputClassName, inputProps?.className)}
        data-testid='chat-input'
        disabled={disabled ? true : effectiveBusy}
        placeholder={placeholder}
      />
      <PromptInputFooter {...footerProps} className={cn(footerClassName, footerProps?.className)}>
        <div />
        <PromptInputSubmit
          {...submitProps}
          data-testid={effectiveBusy ? 'stop-button' : 'send-button'}
          onClick={effectiveBusy && onAbort ? onAbort : undefined}
          status={effectiveBusy ? 'streaming' : 'ready'}
        />
      </PromptInputFooter>
    </PromptInput>
  )
}
export default ChatInput
