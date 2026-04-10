import { api } from '../lazy'
const ops = api.message
const pub =
  ops.pub ??
  (() => {
    throw new Error('pub not configured')
  })()
export const { create, list, update } = ops
export const { get: pubGet, list: pubList } = pub
