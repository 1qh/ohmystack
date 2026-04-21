import { createGuardApi } from '@noboil/shared/guard'
import { err } from './server/helpers'
const guardApi = createGuardApi({
  label: 'module',
  notFoundLabel: 'reducer/table module',
  onError: msg => {
    err('FORBIDDEN', { message: msg })
  },
  suggestWithLabel: false
})
export { guardApi }
