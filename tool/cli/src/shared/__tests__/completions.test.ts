/* eslint-disable no-console */
import { describe, expect, test } from 'bun:test'
import { printCompletions } from '../../completions'
describe('printCompletions', () => {
  test('bash produces bash completion script', async () => {
    const originalLog = console.log
    let captured = ''
    // oxlint-disable-next-line typescript-eslint(no-unused-vars)
    console.log = (msg: string) => {
      captured += `${msg}\n`
    }
    try {
      await printCompletions('bash')
    } finally {
      console.log = originalLog
    }
    expect(captured).toContain('_noboil()')
    expect(captured).toContain('complete -F _noboil noboil')
  })
  test('zsh produces zsh completion script', async () => {
    const originalLog = console.log
    let captured = ''
    console.log = (msg: string) => {
      captured += `${msg}\n`
    }
    try {
      await printCompletions('zsh')
    } finally {
      console.log = originalLog
    }
    expect(captured).toContain('#compdef noboil')
  })
  test('fish produces fish completion script', async () => {
    const originalLog = console.log
    let captured = ''
    console.log = (msg: string) => {
      captured += `${msg}\n`
    }
    try {
      await printCompletions('fish')
    } finally {
      console.log = originalLog
    }
    expect(captured).toContain('complete -c noboil')
  })
})
