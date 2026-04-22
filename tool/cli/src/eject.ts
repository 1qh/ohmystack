#!/usr/bin/env bun
/* eslint-disable no-console */
/* eslint-disable complexity */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve as resolvePath } from 'node:path'
import { bold, dim, green, yellow } from './ansi'
import { die } from './cli-utils'
interface EjectContext {
  cwd: string
  db: 'convex' | 'spacetimedb'
  installedPackage: 'noboil'
  rootPackagePath: string
  sharedFiles: string[]
  sharedRoot?: string
  sourceFiles: string[]
  sourcePackageJson: PackageJson
  sourcePackageJsonPath: string
  sourceRoot: string
}
interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  ejected?: boolean
  exports?: Record<string, string>
  name?: string
  peerDependencies?: Record<string, string>
  type?: string
  version?: string
  workspaces?: string[] | { packages?: string[] }
}
interface RewriteResult {
  changed: boolean
  output: string
  replacements: number
}
const HELP = `\n${bold('noboil eject')} — inline noboil library locally\n\n${bold('Usage:')}\n  noboil eject [--dry-run]\n\n${bold('Options:')}\n  --dry-run      ${dim('Show what would change without writing files')}\n  --help, -h     ${dim('Show this help')}\n`
const SHARED_SPECIFIER = 'noboil/shared'
const LOCAL_PACKAGE = '@local/noboil'
const sharedExtensionCandidates = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
const isIgnoredPath = (filePath: string) => {
  const normalized = filePath.replaceAll(String.raw`\\`, '/')
  const segments = normalized.split('/')
  for (const segment of segments) if (segment === 'node_modules' || segment === '.git') return true
  return false
}
const readJson = (filePath: string) => JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
const writeJson = (filePath: string, value: unknown) => writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
const collectFiles = (root: string) => {
  if (!existsSync(root)) return []
  const out: string[] = []
  const entries = readdirSync(root, { recursive: true, withFileTypes: true })
  for (const entry of entries)
    if (entry.isFile()) {
      const fullPath = join(entry.parentPath, entry.name)
      if (!isIgnoredPath(fullPath)) out.push(fullPath)
    }
  return out
}
const collectTsFiles = (root: string) => {
  const allFiles = collectFiles(root)
  const out: string[] = []
  for (const filePath of allFiles) if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) out.push(filePath)
  return out
}
const collectPackageJsonFiles = (root: string) => {
  const allFiles = collectFiles(root)
  const out: string[] = []
  for (const filePath of allFiles)
    if (filePath.endsWith('/package.json') || filePath.endsWith(String.raw`\package.json`)) out.push(filePath)
  const rootPackage = join(root, 'package.json')
  if (existsSync(rootPackage) && !out.includes(rootPackage)) out.push(rootPackage)
  return out
}
const detectInstalledPackage = (rootPackagePath: string) => {
  if (!existsSync(rootPackagePath)) die('No package.json found in current directory.')
  const rootPackageJson = readJson(rootPackagePath) as PackageJson
  const merged: Record<string, string> = {}
  if (rootPackageJson.dependencies)
    for (const [key, value] of Object.entries(rootPackageJson.dependencies)) merged[key] = value
  if (rootPackageJson.devDependencies)
    for (const [key, value] of Object.entries(rootPackageJson.devDependencies)) merged[key] = value
  if (!('noboil' in merged)) die('noboil not found in dependencies. Nothing to eject.')
  const rcPath = join(dirname(rootPackagePath), '.noboilrc.json')
  if (!existsSync(rcPath))
    die(
      'Missing .noboilrc.json — cannot determine db. Re-run `noboil init` or create .noboilrc.json with { "db": "convex" | "spacetimedb" }.'
    )
  const rc = readJson(rcPath) as { db?: string }
  if (rc.db !== 'convex' && rc.db !== 'spacetimedb') die('.noboilrc.json missing valid `db` field.')
  return { db: rc.db as 'convex' | 'spacetimedb', installedPackage: 'noboil' as const }
}
const IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*|import\s+)(?<quote>['"])(?<specifier>[^'"\n]+)\k<quote>/gu
const extractSpecifiers = (content: string) => {
  const out: string[] = []
  let match = IMPORT_PATTERN.exec(content)
  while (match) {
    const specifier = match.groups?.specifier
    if (specifier) out.push(specifier)
    match = IMPORT_PATTERN.exec(content)
  }
  IMPORT_PATTERN.lastIndex = 0
  return out
}
const EXT_PATTERN = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/gu
const normalizeRelPath = (fromFilePath: string, toPathNoExt: string) => {
  const raw = relative(dirname(fromFilePath), toPathNoExt).replaceAll(String.raw`\\`, '/').replaceAll(EXT_PATTERN, '')
  return raw.startsWith('.') ? raw : `./${raw}`
}
const resolveWithExtensions = (pathWithoutExtension: string) => {
  if (existsSync(pathWithoutExtension)) return pathWithoutExtension
  for (const ext of sharedExtensionCandidates) {
    const candidate = `${pathWithoutExtension}${ext}`
    if (existsSync(candidate)) return candidate
  }
  for (const ext of sharedExtensionCandidates) {
    const candidate = join(pathWithoutExtension, `index${ext}`)
    if (existsSync(candidate)) return candidate
  }
}
const LEADING_SLASH = /^\//u
const resolveSharedImportToSourceFile = (sharedRoot: string, specifier: string) => {
  if (!specifier.startsWith(SHARED_SPECIFIER)) return
  const suffix = specifier.slice(SHARED_SPECIFIER.length).replace(LEADING_SLASH, '')
  const noExt = suffix.length > 0 ? join(sharedRoot, suffix) : join(sharedRoot, 'index')
  return resolveWithExtensions(noExt)
}
const collectSharedImportsFromFiles = (filePaths: string[]) => {
  const imports = new Set<string>()
  for (const filePath of filePaths)
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      const content = readFileSync(filePath, 'utf8')
      const specifiers = extractSpecifiers(content)
      for (const specifier of specifiers) if (specifier.startsWith(SHARED_SPECIFIER)) imports.add(specifier)
    }
  return imports
}
const buildSharedDependencySet = (sharedRoot: string, sharedSpecifiers: Set<string>) => {
  const queue: string[] = []
  const visited = new Set<string>()
  for (const specifier of sharedSpecifiers) {
    const resolved = resolveSharedImportToSourceFile(sharedRoot, specifier)
    if (resolved) {
      if (!visited.has(resolved)) {
        visited.add(resolved)
        queue.push(resolved)
      }
    } else die(`Unable to resolve ${specifier} from shared source.`)
  }
  let index = 0
  while (index < queue.length) {
    const filePath = queue[index]
    if (!filePath) break
    const content = readFileSync(filePath, 'utf8')
    const specifiers = extractSpecifiers(content)
    for (const specifier of specifiers)
      if (specifier.startsWith('.')) {
        const base = resolvePath(dirname(filePath), specifier)
        const resolved = resolveWithExtensions(base)
        if (resolved?.startsWith(sharedRoot) && !visited.has(resolved)) {
          visited.add(resolved)
          queue.push(resolved)
        }
      } else if (specifier.startsWith(SHARED_SPECIFIER)) {
        const resolved = resolveSharedImportToSourceFile(sharedRoot, specifier)
        if (resolved && !visited.has(resolved)) {
          visited.add(resolved)
          queue.push(resolved)
        } else if (!resolved) die(`Unable to resolve ${specifier} from shared source.`)
      }
    index += 1
  }
  return queue
}
const rewriteNoboilSpecifiers = (content: string, installedPackage: string): RewriteResult => {
  const pattern = new RegExp(`(['"])${installedPackage.replace('/', String.raw`\/`)}(\\/[^'"\\n]*)?\\1`, 'gu')
  let replacements = 0
  const output = content.replaceAll(pattern, (_m: string, quote: string, suffix?: string) => {
    replacements += 1
    return `${quote}${LOCAL_PACKAGE}${suffix ?? ''}${quote}`
  })
  return { changed: replacements > 0, output, replacements }
}
const SHARED_IMPORT_PATTERN = /(?<q>['"])noboil\/shared(?<sfx>[^'"\n]*)\k<q>/gu
const rewriteSharedSpecifiers = (content: string, filePath: string, ejectedSrcRoot: string): RewriteResult => {
  let replacements = 0
  const output = content.replaceAll(SHARED_IMPORT_PATTERN, (_m: string, quote: string, suffix: string) => {
    replacements += 1
    const cleanSuffix = suffix.replace(LEADING_SLASH, '')
    const targetNoExt =
      cleanSuffix.length > 0 ? join(ejectedSrcRoot, 'shared', cleanSuffix) : join(ejectedSrcRoot, 'shared', 'index')
    const nextSpecifier = normalizeRelPath(filePath, targetNoExt)
    return `${quote}${nextSpecifier}${quote}`
  })
  return { changed: replacements > 0, output, replacements }
}
const ensureWorkspacePackages = (pkg: PackageJson) => {
  let changed = false
  if (!pkg.workspaces) {
    pkg.workspaces = ['lib/*']
    changed = true
  } else if (Array.isArray(pkg.workspaces)) {
    if (!pkg.workspaces.includes('lib/*')) {
      pkg.workspaces.push('lib/*')
      changed = true
    }
  } else {
    const workspacePackages = pkg.workspaces.packages
    if (!workspacePackages) {
      pkg.workspaces.packages = ['lib/*']
      changed = true
    } else if (!workspacePackages.includes('lib/*')) {
      workspacePackages.push('lib/*')
      changed = true
    }
  }
  return changed
}
const replaceDependencyInSection = (section: Record<string, string> | undefined, installedPackage: string) => {
  if (!section) return false
  let changed = false
  if (installedPackage in section) {
    const rebuilt: Record<string, string> = {}
    for (const [key, val] of Object.entries(section)) if (key !== installedPackage) rebuilt[key] = val
    for (const key of Object.keys(section)) Reflect.deleteProperty(section, key)
    for (const [key, val] of Object.entries(rebuilt)) section[key] = val
    changed = true
  }
  if (section[LOCAL_PACKAGE] !== 'workspace:*') {
    section[LOCAL_PACKAGE] = 'workspace:*'
    changed = true
  }
  return changed
}
const prepareContext = (cwd: string): EjectContext => {
  const rootPackagePath = join(cwd, 'package.json')
  const detected = detectInstalledPackage(rootPackagePath)
  const sourceRoot = join(cwd, 'node_modules', 'noboil', 'src', detected.db)
  const sourcePackageJsonPath = join(cwd, 'node_modules', 'noboil', 'package.json')
  if (!(existsSync(sourceRoot) && existsSync(sourcePackageJsonPath))) die('Run `bun install` first.')
  const sourcePackageJson = readJson(sourcePackageJsonPath) as PackageJson
  if (!sourcePackageJson.exports || typeof sourcePackageJson.exports !== 'object')
    die('Unable to read exports map from installed @noboil package.')
  const sourceFiles = collectFiles(sourceRoot)
  const sharedSpecifiers = collectSharedImportsFromFiles(sourceFiles)
  let sharedRoot: string | undefined
  let sharedFiles: string[] = []
  if (sharedSpecifiers.size > 0) {
    const nodeModulesShared = join(cwd, 'node_modules', 'noboil', 'src', 'shared')
    if (existsSync(nodeModulesShared)) sharedRoot = nodeModulesShared
    else die('Shared source missing in node_modules/noboil/src/shared.')
    if (sharedRoot) sharedFiles = buildSharedDependencySet(sharedRoot, sharedSpecifiers)
  }
  return {
    cwd,
    db: detected.db,
    installedPackage: detected.installedPackage,
    rootPackagePath,
    sharedFiles,
    sharedRoot,
    sourceFiles,
    sourcePackageJson,
    sourcePackageJsonPath,
    sourceRoot
  }
}
const copyIntoTarget = ({
  dryRun,
  files,
  fromRoot,
  toRoot
}: {
  dryRun: boolean
  files: string[]
  fromRoot: string
  toRoot: string
}) => {
  let copied = 0
  for (const filePath of files) {
    const rel = relative(fromRoot, filePath)
    const targetPath = join(toRoot, rel)
    copied += 1
    if (!dryRun) {
      mkdirSync(dirname(targetPath), { recursive: true })
      copyFileSync(filePath, targetPath)
    }
  }
  return copied
}
const printSummary = ({
  copiedLibraryFiles,
  copiedSharedFiles,
  dryRun,
  markedEjected,
  packageJsonFilesUpdated,
  rewrittenImportCount,
  rewrittenImportFiles,
  rewrittenSharedCount,
  rewrittenSharedFiles
}: {
  copiedLibraryFiles: number
  copiedSharedFiles: number
  dryRun: boolean
  markedEjected: boolean
  packageJsonFilesUpdated: number
  rewrittenImportCount: number
  rewrittenImportFiles: number
  rewrittenSharedCount: number
  rewrittenSharedFiles: number
}) => {
  console.log(`\n${bold(`noboil eject${dryRun ? ' (dry-run)' : ''}`)}\n`)
  console.log(`  ${green('+')} Library files copied: ${copiedLibraryFiles}`)
  console.log(`  ${green('+')} Shared files copied: ${copiedSharedFiles}`)
  console.log(
    `  ${green('+')} TS/TSX files with @noboil rewrites: ${rewrittenImportFiles} ${dim(`(${rewrittenImportCount} replacements)`)}`
  )
  console.log(
    `  ${green('+')} Ejected files with shared rewrites: ${rewrittenSharedFiles} ${dim(`(${rewrittenSharedCount} replacements)`)}`
  )
  console.log(`  ${green('+')} package.json files updated: ${packageJsonFilesUpdated}`)
  console.log(`  ${green('+')} .noboilrc.json updated: ${markedEjected ? 'yes' : 'no'}`)
  console.log(`\n  ${yellow('!')} Sync and doctor commands will be disabled for ejected projects.`)
  console.log(`  ${dim('Next step:')} Run ${bold('bun install')} to link the local package.\n`)
}
const eject = (args: string[]) => {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    return
  }
  const dryRun = args.includes('--dry-run')
  const cwd = process.cwd()
  const context = prepareContext(cwd)
  const localPackageDir = join(cwd, 'lib', 'noboil')
  const localSourceDir = join(localPackageDir, 'src')
  let copiedSharedFiles = 0
  let rewrittenImportFiles = 0
  let rewrittenImportCount = 0
  let rewrittenSharedFiles = 0
  let rewrittenSharedCount = 0
  let packageJsonFilesUpdated = 0
  let markedEjected = false
  const copiedLibraryFiles = copyIntoTarget({
    dryRun,
    files: context.sourceFiles,
    fromRoot: context.sourceRoot,
    toRoot: localSourceDir
  })
  if (context.sharedRoot && context.sharedFiles.length > 0)
    copiedSharedFiles = copyIntoTarget({
      dryRun,
      files: context.sharedFiles,
      fromRoot: context.sharedRoot,
      toRoot: join(localSourceDir, 'shared')
    })
  const localPackageJson: PackageJson = {
    exports: context.sourcePackageJson.exports,
    name: LOCAL_PACKAGE,
    type: 'module',
    version: '0.0.0'
  }
  if (!dryRun) {
    mkdirSync(localPackageDir, { recursive: true })
    writeJson(join(localPackageDir, 'package.json'), localPackageJson)
  }
  const tsFiles = collectTsFiles(cwd)
  for (const filePath of tsFiles) {
    const content = readFileSync(filePath, 'utf8')
    const rewrites = rewriteNoboilSpecifiers(content, context.installedPackage)
    if (rewrites.changed) {
      rewrittenImportFiles += 1
      rewrittenImportCount += rewrites.replacements
      if (!dryRun) writeFileSync(filePath, rewrites.output)
    }
  }
  const ejectedTsFiles = collectTsFiles(localSourceDir)
  for (const filePath of ejectedTsFiles) {
    const content = readFileSync(filePath, 'utf8')
    const rewrites = rewriteSharedSpecifiers(content, filePath, localSourceDir)
    if (rewrites.changed) {
      rewrittenSharedFiles += 1
      rewrittenSharedCount += rewrites.replacements
      if (!dryRun) writeFileSync(filePath, rewrites.output)
    }
  }
  const packageJsonFiles = collectPackageJsonFiles(cwd)
  for (const filePath of packageJsonFiles) {
    const pkg = readJson(filePath) as PackageJson
    let changed = false
    if (filePath === context.rootPackagePath && ensureWorkspacePackages(pkg)) changed = true
    if (replaceDependencyInSection(pkg.dependencies, context.installedPackage)) changed = true
    if (replaceDependencyInSection(pkg.devDependencies, context.installedPackage)) changed = true
    if (changed) {
      packageJsonFilesUpdated += 1
      if (!dryRun) writeJson(filePath, pkg)
    }
  }
  const noboilRcPath = join(cwd, '.noboilrc.json')
  if (existsSync(noboilRcPath)) {
    const rc = readJson(noboilRcPath) as PackageJson
    if (rc.ejected !== true) {
      markedEjected = true
      if (!dryRun) {
        rc.ejected = true
        writeJson(noboilRcPath, rc)
      }
    }
  }
  printSummary({
    copiedLibraryFiles,
    copiedSharedFiles,
    dryRun,
    markedEjected,
    packageJsonFilesUpdated,
    rewrittenImportCount,
    rewrittenImportFiles,
    rewrittenSharedCount,
    rewrittenSharedFiles
  })
}
export { eject }
