import { singletonCrud } from '../lazy'
import { singleton } from '../t'

export const { get, upsert } = singletonCrud('blogProfile', singleton.blogProfile)
