/* oxlint-disable eslint-plugin-unicorn(no-process-exit) */
/* eslint-disable no-console */
import { homedir } from 'node:os'
const BASH = `_noboil() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "init doctor sync eject add convex stdb completions --help --version" -- "$cur") )
    return 0
  fi
  case "$prev" in
    init) COMPREPLY=( $(compgen -W "--db= --dir= --skip-install --with-demos --no-demos --help" -- "$cur") ) ;;
    sync) COMPREPLY=( $(compgen -W "--dry-run --force --help" -- "$cur") ) ;;
    doctor) COMPREPLY=( $(compgen -W "--fix --help" -- "$cur") ) ;;
    eject) COMPREPLY=( $(compgen -W "--yes --help" -- "$cur") ) ;;
    completions) COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") ) ;;
  esac
}
complete -F _noboil noboil
`
const ZSH = `#compdef noboil
_noboil() {
  local -a commands
  commands=(
    'init:Create a new noboil project'
    'doctor:Check project health'
    'sync:Pull upstream changes'
    'eject:Detach from upstream'
    'add:Add a table (auto-detect DB)'
    'convex:Convex subcommands'
    'stdb:SpacetimeDB subcommands'
    'completions:Print shell completion script'
    '--help:Show help'
    '--version:Show version'
  )
  if (( CURRENT == 2 )); then
    _describe 'command' commands
  else
    case $words[2] in
      init) _arguments '--db=[Database]:db:(convex spacetimedb)' '--dir=[Directory]' '--skip-install[Skip install]' '--with-demos[Include demos]' '--no-demos[Exclude demos]' ;;
      sync) _arguments '--dry-run[Preview only]' '--force[Overwrite local]' ;;
      doctor) _arguments '--fix[Auto-remediate]' ;;
      eject) _arguments '--yes[Skip confirm]' ;;
      completions) _values 'shell' bash zsh fish ;;
    esac
  fi
}
_noboil "$@"
`
const FISH = `complete -c noboil -f
complete -c noboil -n '__fish_use_subcommand' -a init -d 'Create a new noboil project'
complete -c noboil -n '__fish_use_subcommand' -a doctor -d 'Check project health'
complete -c noboil -n '__fish_use_subcommand' -a sync -d 'Pull upstream changes'
complete -c noboil -n '__fish_use_subcommand' -a eject -d 'Detach from upstream'
complete -c noboil -n '__fish_use_subcommand' -a completions -d 'Print shell completion script'
complete -c noboil -n '__fish_use_subcommand' -l help -d 'Show help'
complete -c noboil -n '__fish_use_subcommand' -l version -d 'Show version'
complete -c noboil -n '__fish_seen_subcommand_from init' -l db -xa 'convex spacetimedb'
complete -c noboil -n '__fish_seen_subcommand_from init' -l dir -d 'Target directory'
complete -c noboil -n '__fish_seen_subcommand_from init' -l skip-install
complete -c noboil -n '__fish_seen_subcommand_from init' -l with-demos
complete -c noboil -n '__fish_seen_subcommand_from init' -l no-demos
complete -c noboil -n '__fish_seen_subcommand_from sync' -l dry-run
complete -c noboil -n '__fish_seen_subcommand_from sync' -l force
complete -c noboil -n '__fish_seen_subcommand_from doctor' -l fix
complete -c noboil -n '__fish_seen_subcommand_from eject' -l yes
complete -c noboil -n '__fish_seen_subcommand_from completions' -xa 'bash zsh fish'
`
const scriptFor = (shell: string): null | string => {
  if (shell === 'bash') return BASH
  if (shell === 'zsh') return ZSH
  if (shell === 'fish') return FISH
  return null
}
const installPath = (shell: string): null | string => {
  const home = homedir()
  if (!home) return null
  if (shell === 'bash') return `${home}/.bashrc`
  if (shell === 'zsh') return `${home}/.zshrc`
  if (shell === 'fish') return `${home}/.config/fish/completions/noboil.fish`
  return null
}
const INSTALL_MARKER = '# noboil completions'
const installCompletion = async (shell: string): Promise<void> => {
  const { file, write } = await import('bun')
  const script = scriptFor(shell)
  const target = installPath(shell)
  if (!(script && target)) {
    console.log('Usage: noboil completions install <bash|zsh|fish>')
    process.exit(1)
  }
  if (shell === 'fish') {
    await write(target, script)
    console.log(`${target} written.`)
    return
  }
  const existing = (await file(target).exists()) ? await file(target).text() : ''
  if (existing.includes(INSTALL_MARKER)) {
    console.log(`${target} already has noboil completions. Skipping.`)
    return
  }
  const block = `\n${INSTALL_MARKER}\n${script}\n`
  await write(target, existing + block)
  console.log(`${target} appended. Restart your shell or source the file.`)
}
const printCompletions = async (arg: string, rest: string[] = []) => {
  if (arg === 'install') {
    const shell = rest[0] ?? ''
    try {
      await installCompletion(shell)
    } catch (error) {
      console.log(`install failed: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
    return
  }
  const script = scriptFor(arg)
  if (script) {
    console.log(script)
    return
  }
  console.log('Usage: noboil completions <bash|zsh|fish>')
  console.log('       noboil completions install <bash|zsh|fish>')
  process.exit(1)
}
export { printCompletions }
