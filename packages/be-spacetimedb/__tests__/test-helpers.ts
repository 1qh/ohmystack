/* eslint-disable @typescript-eslint/max-params, @typescript-eslint/no-unsafe-assignment */
import type { TestContext, TestUser } from '@noboil/spacetimedb/test'

import { callReducer, cleanup, createTestContext, queryTable } from '@noboil/spacetimedb/test'

type Row = Record<string, unknown>

const none = { none: [] as [] },
  some = <T>(value: T) => ({ some: value }),
  toIdentityCell = (identity: string) => `0x${identity}`,
  getNumber = (row: Row, key: string): number => {
    const value = row[key]
    if (typeof value !== 'number') throw new Error(`Expected number at ${key}`)
    return value
  },
  getString = (row: Row, key: string): string => {
    const value = row[key]
    if (typeof value !== 'string') throw new Error(`Expected string at ${key}`)
    return value
  },
  hasIdentity = (row: Row, identity: string): boolean => {
    const raw = row.user_id
    if (!Array.isArray(raw) || raw.length === 0) return false

    const [first] = raw
    return first === toIdentityCell(identity)
  },
  findMine = (rows: Row[], identity: string): Row[] => {
    const output: Row[] = []
    for (const row of rows) if (hasIdentity(row, identity)) output.push(row)
    return output
  },
  withCtx = async <T>(fn: (ctx: TestContext) => Promise<T>) => {
    const ctx = await createTestContext({
      moduleName: 'noboil',
      userCount: 3
    })
    try {
      return await fn(ctx)
    } finally {
      await cleanup(ctx)
    }
  },
  createBlog = async (ctx: TestContext, user: TestUser, title: string) => {
    await callReducer(
      ctx,
      'create_blog',
      {
        attachments: none,
        category: 'tech',
        content: `${title} content`,
        coverImage: none,
        published: false,
        tags: none,
        title
      },
      user
    )
  },
  createChat = async (ctx: TestContext, user: TestUser, title: string) => {
    await callReducer(ctx, 'create_chat', { isPublic: false, title }, user)
  },
  createMessage = async (ctx: TestContext, user: TestUser, chatId: number, text: string) => {
    await callReducer(
      ctx,
      'create_message',
      {
        chatId,
        parts: [
          {
            file: none,
            image: none,
            name: none,
            text: some(text),
            type: 'text'
          }
        ],
        role: 'user'
      },
      user
    )
  },
  listTable = async (ctx: TestContext, table: string, user?: TestUser) => {
    const rows = await queryTable(ctx, table, user),
      output: Row[] = []
    for (const row of rows) if (row && typeof row === 'object') output.push(row as Row)
    return output
  }

export {
  createBlog,
  createChat,
  createMessage,
  findMine,
  getNumber,
  getString,
  listTable,
  none,
  some,
  toIdentityCell,
  withCtx
}
