// oxlint-disable promise/avoid-new
/* eslint-disable no-console */
import { callReducer, cleanup, createTestContext, queryTable } from '@noboil/spacetimedb/server'

interface BlogRow {
  content: string
  id: number
  title: string
  updated_at: unknown
  user_id: unknown
}

type Ctx = Awaited<ReturnType<typeof createTestContext>>

const sleep = async (ms: number) =>
    new Promise<void>(resolve => {
      setTimeout(resolve, ms)
    }),
  assert = (condition: boolean, msg: string) => {
    if (!condition) throw new Error(`ASSERTION_FAILED: ${msg}`)
  },
  testCreate = async (ctx: Ctx) => {
    console.log('[2/6] Creating a blog post...')
    await callReducer(ctx, 'create_blog', { content: 'My first post', title: 'Hello World' })
    await sleep(200)
    const blogs = (await queryTable(ctx, 'blog')) as BlogRow[],
      [blog] = blogs
    if (!blog) throw new Error('No blogs found')
    console.log(`  Found ${String(blogs.length)} blog(s)`)
    assert(blogs.length === 1, `Expected 1 blog, got ${String(blogs.length)}`)
    assert(blog.title === 'Hello World', `Expected title "Hello World", got "${blog.title}"`)
    assert(blog.content === 'My first post', `Expected content "My first post", got "${blog.content}"`)
    console.log(`  Blog ID: ${String(blog.id)}, title: "${blog.title}"`)
    return blog
  },
  testUpdate = async (ctx: Ctx, blogId: number) => {
    console.log('[3/6] Updating the blog (same user)...')
    await callReducer(ctx, 'update_blog', [blogId, { none: [] }, { some: 'Updated Title' }])
    await sleep(200)
    const updated = (await queryTable(ctx, 'blog')) as BlogRow[],
      [updatedBlog] = updated
    if (!updatedBlog) throw new Error('No blogs found after update')
    assert(updatedBlog.title === 'Updated Title', `Expected "Updated Title", got "${updatedBlog.title}"`)
    console.log(`  Updated title: "${updatedBlog.title}"`)
  },
  testForbidden = async (ctx: Ctx, blogId: number) => {
    console.log('[4/6] Trying update as different user (should fail)...')
    const [, secondUser] = ctx.users

    if (!secondUser) return
    let forbidden = false
    try {
      await callReducer(ctx, 'update_blog', [blogId, { none: [] }, { some: 'Hacked' }], secondUser)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      forbidden = msg.includes('FORBIDDEN') || msg.includes('REDUCER_CALL_FAILED')
      console.log(`  Correctly rejected: ${msg.slice(0, 80)}`)
    }
    assert(forbidden, 'Expected FORBIDDEN error for unauthorized update')
  },
  testDelete = async (ctx: Ctx, blogId: number) => {
    console.log('[5/6] Deleting the blog...')
    await callReducer(ctx, 'rm_blog', { id: blogId })
    await sleep(200)
    console.log('[6/6] Verifying deletion...')
    const after = (await queryTable(ctx, 'blog')) as BlogRow[]
    assert(after.length === 0, `Expected 0 blogs after deletion, got ${String(after.length)}`)
    console.log('  Blog deleted successfully')
  },
  run = async () => {
    console.log('[1/6] Creating test context...')
    const ctx = await createTestContext({ moduleName: 'noboil', userCount: 2 }),
      [, user2] = ctx.users
    if (!user2) throw new Error('Missing second test user')
    console.log(`  Connected as ${ctx.defaultUser.identity.slice(0, 12)}...`)
    console.log(`  Second user: ${user2.identity.slice(0, 12)}...`)
    const blog = await testCreate(ctx)
    await testUpdate(ctx, blog.id)
    await testForbidden(ctx, blog.id)
    await testDelete(ctx, blog.id)
    await cleanup(ctx)
    console.log('\n Walking skeleton PASSED!')
  }

// oxlint-disable-next-line unicorn/prefer-top-level-await, promise/prefer-await-to-then, promise/prefer-await-to-callbacks
run().catch((error: unknown) => {
  console.error('\n Walking skeleton FAILED:', error)
  // oxlint-disable-next-line unicorn/no-process-exit
  process.exit(1)
})
