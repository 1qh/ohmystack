import { childCrud } from '../lazy'
import { children } from '../t'

const ops = childCrud('message', children.message, { pub: { parentField: 'isPublic' } }),
  pub =
    ops.pub ??
    (() => {
      throw new Error('pub not configured')
    })()

export const { create, list, update } = ops,
  { get: pubGet, list: pubList } = pub
