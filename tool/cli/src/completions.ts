/* oxlint-disable eslint-plugin-unicorn(no-process-exit) */
/* eslint-disable no-console */
const BASH = `_noboil() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "init doctor sync eject completions --help --version" -- "$cur") )
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
const printCompletions = (shell: string) => {
  if (shell === 'bash') console.log(BASH)
  else if (shell === 'zsh') console.log(ZSH)
  else if (shell === 'fish') console.log(FISH)
  else {
    console.log('Usage: noboil completions <bash|zsh|fish>')
    process.exit(1)
  }
}
export { printCompletions }
