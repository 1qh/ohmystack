/* eslint-disable @next/next/no-img-element */
// biome-ignore-all lint/performance/noImgElement: x
'use client'
import type { api } from '@a/be-convex'
import type { Preloaded } from 'convex/react'

import { usePreloadedQuery } from 'convex/react'
import Link from 'next/link'

import { Author } from '../common'
const Client = ({ preloaded }: { preloaded: Preloaded<typeof api.blog.read> }) => {
  const b = usePreloadedQuery(preloaded)
  if (!b)
    return (
      <p className='text-muted-foreground' data-testid='blog-not-found'>
        Blog not found
      </p>
    )
  if (!(b.own || b.published))
    return (
      <p className='text-muted-foreground' data-testid='blog-not-published'>
        Blog not published
      </p>
    )
  return (
    <div data-testid='blog-detail-page'>
      <Author {...b} />
      {b.coverImageUrl ? (
        <img
          alt=''
          className='mt-3 w-full rounded-lg object-cover'
          data-testid='blog-detail-cover'
          height={1000}
          src={b.coverImageUrl}
          width={1000}
        />
      ) : null}
      <p className='mt-2 text-3xl font-bold' data-testid='blog-detail-title'>
        {b.title}
      </p>
      <p className='whitespace-pre-line' data-testid='blog-detail-content'>
        {b.content.trim()}
      </p>
      <div className='flex flex-col' data-testid='blog-detail-attachments'>
        {b.attachmentsUrls?.map(
          (url: null | string) =>
            url && (
              <Link
                className='hover:text-blue-500 hover:underline'
                href={url}
                key={url}
                rel='noopener noreferrer'
                target='_blank'>
                {url}
              </Link>
            )
        )}
      </div>
    </div>
  )
}
export default Client
