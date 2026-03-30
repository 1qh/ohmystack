'use client'
import { SchemaPlayground } from '@noboil/spacetimedb/react'
import Link from 'next/link'
const Page = () => (
  <div className='space-y-4' data-testid='dev-page'>
    <Link className='rounded-lg px-3 py-2 hover:bg-muted' data-testid='dev-back' href='/'>
      &larr; Back
    </Link>
    <h1 className='text-xl font-medium'>Schema Playground</h1>
    <SchemaPlayground />
  </div>
)
export default Page
