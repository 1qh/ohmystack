/** biome-ignore-all lint/style/noProcessEnv: NO_COLOR is a runtime env contract */
/** biome-ignore-all lint/nursery/noUndeclaredEnvVars: NO_COLOR is a well-known ecosystem convention */
const noColor = typeof process !== 'undefined' && (process.env.NO_COLOR === '1' || process.env.NO_COLOR === 'true')
const wrap = (code: string) => (s: string) => (noColor ? s : `[${code}m${s}[0m`)
const bold = wrap('1')
const dim = wrap('2')
const green = wrap('32')
const red = wrap('31')
const yellow = wrap('33')
export { bold, dim, green, red, yellow }
