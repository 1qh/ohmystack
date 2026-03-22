import { createGuardApi } from '@a/shared/guard'
const guardApi = createGuardApi({
  label: 'api',
  onError: msg => {
    throw new Error(msg)
  }
})
export { guardApi }
