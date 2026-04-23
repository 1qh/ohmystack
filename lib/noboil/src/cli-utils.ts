/* eslint-disable no-console */
/* oxlint-disable eslint-plugin-unicorn(no-process-exit) */
import { red } from './ansi'
const die = (message: string): never => {
  console.error(`\n${red('Error:')} ${message}\n`)
  process.exit(1)
}
export { die }
