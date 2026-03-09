import { singletonCrud } from '../lazy'
import { singleton } from '../t'

export const { get, upsert } = singletonCrud('orgProfile', singleton.orgProfile)
