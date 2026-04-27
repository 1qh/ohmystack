'use client'
/* oxlint-disable forbid-component-props -- shadcn/Tailwind pattern requires className/style on shared components */
/* oxlint-disable eslint-plugin-react(forbid-component-props) */
import { api } from '@a/be-convex'
import { Conversation, ConversationContent, ConversationEmptyState } from '@a/ui/ai-elements/conversation'
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from '@a/ui/ai-elements/prompt-input'
import { Label } from '@a/ui/label'
import { Switch } from '@a/ui/switch'
import { useMutation } from 'convex/react'
import { SparklesIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createElement, useId, useState, useTransition } from 'react'
const Page = () => {
  const router = useRouter()
  const createChat = useMutation(api.chat.create)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [isPending, startTransition] = useTransition()
  const toggleId = useId()
  const emptyStateIcon = createElement(SparklesIcon, { className: 'size-8' })
  const handleSubmit = async ({ text }: { text: string }) => {
    if (!text.trim() || isSubmitting) return
    setIsSubmitting(true)
    try {
      const created = await createChat({ isPublic, title: text })
      const chatId = Array.isArray(created) ? created[0] : created
      if (typeof chatId !== 'string') return
      startTransition(() => router.push(`/${chatId}?query=${encodeURIComponent(text)}`))
    } finally {
      setIsSubmitting(false)
    }
  }
  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <Conversation>
        <ConversationContent className='mx-auto flex max-w-3xl flex-col items-center justify-center'>
          <ConversationEmptyState
            data-testid='empty-state'
            description='Ask me about the weather anywhere in the world'
            icon={emptyStateIcon}
            title='How can I help you today?'
          />
        </ConversationContent>
      </Conversation>
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-2'>
        <div className='flex items-center gap-2 px-1'>
          <Switch checked={isPublic} data-testid='public-toggle' id={toggleId} onCheckedChange={setIsPublic} />
          <Label htmlFor={toggleId}>{isPublic ? 'Public' : 'Private'}</Label>
        </div>
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            data-testid='chat-input'
            disabled={isSubmitting || isPending}
            placeholder='Send a message...'
          />
          <PromptInputFooter>
            <div />
            <PromptInputSubmit
              data-testid={isSubmitting || isPending ? 'stop-button' : 'send-button'}
              status={isSubmitting || isPending ? 'submitted' : 'ready'}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
export default Page
