import { styleText } from 'node:util'
const bold = (s: string) => styleText('bold', s)
const cyan = (s: string) => styleText('cyan', s)
const dim = (s: string) => styleText('dim', s)
const green = (s: string) => styleText('green', s)
const red = (s: string) => styleText('red', s)
const yellow = (s: string) => styleText('yellow', s)
export { bold, cyan, dim, green, red, yellow }
