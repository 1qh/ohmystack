import { env } from 'bun'
const isNoColor = (): boolean => {
  if (env.NO_COLOR !== undefined) return true
  if (env.FORCE_COLOR !== undefined) return false
  return !process.stdout.isTTY
}
const color = (c: string): string | undefined => (isNoColor() ? undefined : c)
export { color, isNoColor }
