/* eslint-disable no-console */
interface ChildInfo extends TableInfo {
  foreignKey: string
  parent: string
}
interface TableInfo {
  fields: { name: string; type: string }[]
  name: string
  tableType: string
}
const dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  findBracketEnd = (text: string, startPos: number): number => {
    let depth = 1,
      pos = startPos
    while (pos < text.length && depth > 0) {
      if (text[pos] === '{') depth += 1
      else if (text[pos] === '}') depth -= 1
      pos += 1
    }
    return pos - 1
  },
  isSchemaFile = (content: string, markers: string[]): boolean => {
    for (const marker of markers) if (content.includes(marker)) return true
    return false
  },
  printSummary = (tables: TableInfo[], children: ChildInfo[]) => {
    console.log(bold('\nSchema Summary\n'))
    for (const t of [...tables, ...children]) {
      console.log(`  ${bold(t.name)} ${dim(`[${t.tableType}]`)}`)
      for (const f of t.fields) console.log(`    ${dim('\u2502')} ${f.name}: ${dim(f.type)}`)
      console.log('')
    }
  }
export type { ChildInfo, TableInfo }
export { bold, dim, findBracketEnd, isSchemaFile, printSummary, red }
