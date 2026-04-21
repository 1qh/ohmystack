import { createGuardApi } from '@noboil/shared/guard'
const guardApi = createGuardApi({
  label: 'api',
  onError: msg => {
    throw new Error(msg)
  }
})
export { guardApi }
