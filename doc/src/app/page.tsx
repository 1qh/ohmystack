import Link from 'next/link'

const Page = () => (
  <main className='flex flex-1 flex-col items-center justify-center gap-4 text-center'>
    <h1 className='text-4xl font-bold'>noboil</h1>
    <p className='text-lg text-muted-foreground'>One schema. Typed backend. Auto forms. Zero boilerplate.</p>
    <Link className='rounded-lg bg-primary px-6 py-3 text-primary-foreground' href='/docs'>
      Get Started
    </Link>
  </main>
)

export default Page
