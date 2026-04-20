import { portVars } from '../noboil.config'
import { patchEnv } from './utils'
const emit = () => {
  const entries = Object.entries(portVars()).map(([k, v]) => [k, v] as [string, string])
  patchEnv(entries)
}
if (import.meta.main) emit()
export { emit }
