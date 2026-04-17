'use client'
import { api } from '@a/be-convex'
import ChatSidebar from '@a/fe/chat-sidebar'
import { Spinner } from '@a/ui/spinner'
import { useList } from '@noboil/convex/react'
import { useMutation } from 'convex/react'
import { Check } from 'lucide-react'
import { useEffect } from 'react'
import { useInView } from 'react-intersection-observer'
const Sb = () => {
  const { inView, ref } = useInView()
  const { data, loadMore, status } = useList(api.chat.list, { where: { own: true } })
  const deleteChat = useMutation(api.chat.rm)
  const handleDelete = async (chatId: string) => {
    await deleteChat({ id: chatId })
  }
  useEffect(() => {
    if (inView && status === 'CanLoadMore') loadMore()
  }, [inView, loadMore, status])
  return (
    <>
      <ChatSidebar basePath='' getThreadId={thread => thread._id} onDelete={handleDelete} threads={data} />
      <div className='flex justify-center p-2'>
        {status === 'LoadingMore' ? (
          <Spinner />
        ) : status === 'CanLoadMore' ? (
          <p className='h-4' ref={ref} />
        ) : status === 'Exhausted' && data.length > 20 ? (
          <Check className='animate-[fadeOut_2s_forwards] text-primary' />
        ) : null}
      </div>
    </>
  )
}
export default Sb
