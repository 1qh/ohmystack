'use client'

import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { toIdentityKey } from '@a/fe/utils'
import { Conversation, ConversationContent, ConversationEmptyState } from '@a/ui/ai-elements/conversation'
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from '@a/ui/ai-elements/prompt-input'
import { Label } from '@a/ui/label'
import { Switch } from '@a/ui/switch'
import { useMut } from '@noboil/spacetimedb/react'
import { SparklesIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'

const Page = () => {
  const router = useRouter(),
    publicToggleId = useId(),
    pendingTitleRef = useRef<null | string>(null),
    createChat = useMut(reducers.createChat, {
      onSuccess: () => {
        pendingTitleRef.current = null
      },
      toast: { error: 'Unable to create chat' }
    }),
    { identity } = useSpacetimeDB(),
    [allChats] = useTable(tables.chat),
    [isSubmitting, setIsSubmitting] = useState(false),
    [isPublic, setIsPublic] = useState(false),
    [isPending, startTransition] = useTransition(),
    identityKey = toIdentityKey(identity)

  useEffect(() => {
    if (!pendingTitleRef.current) return
    const title = pendingTitleRef.current
    let newestChat: (typeof allChats)[number] | undefined
    for (const c of allChats)
      if (c.title === title && toIdentityKey(c.userId) === identityKey && (!newestChat || c.id > newestChat.id))
        newestChat = c

    if (newestChat) {
      pendingTitleRef.current = null
      const query = encodeURIComponent(title)
      startTransition(() => router.push(`/${newestChat.id}?query=${query}`))
    }
  }, [allChats, identityKey, router])

  const handleSubmit = async ({ text }: { text: string }) => {
    if (!text.trim() || isSubmitting) return
    setIsSubmitting(true)
    pendingTitleRef.current = text
    try {
      await createChat({ isPublic, title: text })
    } catch {
      pendingTitleRef.current = null
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
            // oxlint-disable-next-line react-perf/jsx-no-jsx-as-prop
            icon={<SparklesIcon className='size-8' />}
            title='How can I help you today?'
          />
        </ConversationContent>
      </Conversation>
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-2'>
        <div className='flex items-center gap-2 px-1'>
          <Switch checked={isPublic} data-testid='public-toggle' id={publicToggleId} onCheckedChange={setIsPublic} />
          <Label htmlFor={publicToggleId}>{isPublic ? 'Public' : 'Private'}</Label>
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
