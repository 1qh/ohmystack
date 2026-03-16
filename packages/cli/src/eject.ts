#!/usr/bin/env bun
/* eslint-disable no-console, complexity */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve as resolvePath } from 'node:path'

interface EjectContext {
  cwd: string
  db: 'convex' | 'spacetimedb'
  installedPackage: '@noboil/convex' | '@noboil/spacetimedb'
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

const bold = (s: string) => `\u001B[1m${s}\u001B[0m`,
  dim = (s: string) => `\u001B[2m${s}\u001B[0m`,
  green = (s: string) => `\u001B[32m${s}\u001B[0m`,
  yellow = (s: string) => `\u001B[33m${s}\u001B[0m`,
  red = (s: string) => `\u001B[31m${s}\u001B[0m`,
  HELP = `\n${bold('noboil eject')} — inline noboil library locally\n\n${bold('Usage:')}\n  noboil eject [--dry-run]\n\n${bold('Options:')}\n  --dry-run      ${dim('Show what would change without writing files')}\n  --help, -h     ${dim('Show this help')}\n`,
  SHARED_SPECIFIER = '@a/shared',
  LOCAL_PACKAGE = '@local/noboil',
  sharedExtensionCandidates = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
  isIgnoredPath = (filePath: string) => {
    const normalized = filePath.replaceAll(String.raw`\\`, '/'),
      segments = normalized.split('/')
    for (const segment of segments) if (segment === 'node_modules' || segment === '.git') return true
    return false
  },
  readJson = (filePath: string) => JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>,
  writeJson = (filePath: string, value: unknown) => writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`),
  fail = (message: string): never => {
    console.log(`\n${red('Error:')} ${message}\n`)
    process.exit(1)
  },
  collectFiles = (root: string) => {
    if (!existsSync(root)) return []
    const out: string[] = [],
      entries = readdirSync(root, { recursive: true, withFileTypes: true })
    for (const entry of entries)
      if (entry.isFile()) {
        const fullPath = join(entry.parentPath, entry.name)
        if (!isIgnoredPath(fullPath)) out.push(fullPath)
      }
    return out
  },
  collectTsFiles = (root: string) => {
    const allFiles = collectFiles(root),
      out: string[] = []
    for (const filePath of allFiles) if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) out.push(filePath)
    return out
  },
  collectPackageJsonFiles = (root: string) => {
    const allFiles = collectFiles(root),
      out: string[] = []
    for (const filePath of allFiles)
      if (filePath.endsWith('/package.json') || filePath.endsWith(String.raw`\package.json`)) out.push(filePath)
    const rootPackage = join(root, 'package.json')
    if (existsSync(rootPackage) && !out.includes(rootPackage)) out.push(rootPackage)
    return out
  },
  detectInstalledPackage = (rootPackagePath: string) => {
    if (!existsSync(rootPackagePath)) fail('No package.json found in current directory.')
    const rootPackageJson = readJson(rootPackagePath) as PackageJson,
      merged: Record<string, string> = {}

    if (rootPackageJson.dependencies)
      for (const [key, value] of Object.entries(rootPackageJson.dependencies)) merged[key] = value

    if (rootPackageJson.devDependencies)
      for (const [key, value] of Object.entries(rootPackageJson.devDependencies)) merged[key] = value

    const hasConvex = '@noboil/convex' in merged,
      hasSpacetimedb = '@noboil/spacetimedb' in merged

    if (!(hasConvex || hasSpacetimedb)) fail('No @noboil/* package found. Nothing to eject.')
    if (hasConvex && hasSpacetimedb) fail('Both @noboil/convex and @noboil/spacetimedb are installed. Keep one and retry.')

    if (hasConvex) return { db: 'convex' as const, installedPackage: '@noboil/convex' as const }
    return { db: 'spacetimedb' as const, installedPackage: '@noboil/spacetimedb' as const }
  },
  IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*|import\s+)(?<quote>['"])(?<specifier>[^'"\n]+)\k<quote>/gu,
  extractSpecifiers = (content: string) => {
    const out: string[] = []
    let match = IMPORT_PATTERN.exec(content)
    while (match) {
      const specifier = match.groups?.specifier
      if (specifier) out.push(specifier)
      match = IMPORT_PATTERN.exec(content)
    }
    IMPORT_PATTERN.lastIndex = 0
    return out
  },
  EXT_PATTERN = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/gu,
  normalizeRelPath = (fromFilePath: string, toPathNoExt: string) => {
    const raw = relative(dirname(fromFilePath), toPathNoExt).replaceAll(String.raw`\\`, '/').replaceAll(EXT_PATTERN, '')
    return raw.startsWith('.') ? raw : `./${raw}`
  },
  resolveWithExtensions = (pathWithoutExtension: string) => {
    if (existsSync(pathWithoutExtension)) return pathWithoutExtension
    for (const ext of sharedExtensionCandidates) {
      const candidate = `${pathWithoutExtension}${ext}`
      if (existsSync(candidate)) return candidate
    }
    for (const ext of sharedExtensionCandidates) {
      const candidate = join(pathWithoutExtension, `index${ext}`)
      if (existsSync(candidate)) return candidate
    }
  },
  LEADING_SLASH = /^\//u,
  resolveSharedImportToSourceFile = (sharedRoot: string, specifier: string) => {
    if (!specifier.startsWith(SHARED_SPECIFIER)) return
    const suffix = specifier.slice(SHARED_SPECIFIER.length).replace(LEADING_SLASH, ''),
      noExt = suffix.length > 0 ? join(sharedRoot, suffix) : join(sharedRoot, 'index')
    return resolveWithExtensions(noExt)
  },
  collectSharedImportsFromFiles = (filePaths: string[]) => {
    const imports = new Set<string>()
    for (const filePath of filePaths)
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
        const content = readFileSync(filePath, 'utf8'),
          specifiers = extractSpecifiers(content)
        for (const specifier of specifiers) if (specifier.startsWith(SHARED_SPECIFIER)) imports.add(specifier)
      }
    return imports
  },
  buildSharedDependencySet = (sharedRoot: string, sharedSpecifiers: Set<string>) => {
    const queue: string[] = [],
      visited = new Set<string>()

    for (const specifier of sharedSpecifiers) {
      const resolved = resolveSharedImportToSourceFile(sharedRoot, specifier)
      if (resolved) {
        if (!visited.has(resolved)) {
          visited.add(resolved)
          queue.push(resolved)
        }
      } else fail(`Unable to resolve ${specifier} from shared source.`)
    }

    let index = 0
    while (index < queue.length) {
      const filePath = queue[index]
      if (!filePath) break

      const content = readFileSync(filePath, 'utf8'),
        specifiers = extractSpecifiers(content)

      for (const specifier of specifiers)
        if (specifier.startsWith('.')) {
          const base = resolvePath(dirname(filePath), specifier),
            resolved = resolveWithExtensions(base)
          if (resolved?.startsWith(sharedRoot) && !visited.has(resolved)) {
            visited.add(resolved)
            queue.push(resolved)
          }
        } else if (specifier.startsWith(SHARED_SPECIFIER)) {
          const resolved = resolveSharedImportToSourceFile(sharedRoot, specifier)
          if (resolved && !visited.has(resolved)) {
            visited.add(resolved)
            queue.push(resolved)
          } else if (!resolved) fail(`Unable to resolve ${specifier} from shared source.`)
        }

      index += 1
    }
    return queue
  },
  rewriteNoboilSpecifiers = (content: string, installedPackage: string): RewriteResult => {
    const pattern = new RegExp(`(['"])${installedPackage.replace('/', String.raw`\/`)}(\\/[^'"\\n]*)?\\1`, 'gu')
    let replacements = 0
    const output = content.replaceAll(pattern, (_m: string, quote: string, suffix?: string) => {
      replacements += 1
      return `${quote}${LOCAL_PACKAGE}${suffix ?? ''}${quote}`
    })
    return { changed: replacements > 0, output, replacements }
  },
  SHARED_IMPORT_PATTERN = /(?<q>['"])@a\/shared(?<sfx>[^'"\n]*)\k<q>/gu,
  rewriteSharedSpecifiers = (content: string, filePath: string, ejectedSrcRoot: string): RewriteResult => {
    let replacements = 0
    const output = content.replaceAll(SHARED_IMPORT_PATTERN, (_m: string, quote: string, suffix: string) => {
      replacements += 1
      const cleanSuffix = suffix.replace(LEADING_SLASH, ''),
        targetNoExt =
          cleanSuffix.length > 0 ? join(ejectedSrcRoot, 'shared', cleanSuffix) : join(ejectedSrcRoot, 'shared', 'index'),
        nextSpecifier = normalizeRelPath(filePath, targetNoExt)
      return `${quote}${nextSpecifier}${quote}`
    })
    return { changed: replacements > 0, output, replacements }
  },
  ensureWorkspacePackages = (pkg: PackageJson) => {
    let changed = false
    if (!pkg.workspaces) {
      pkg.workspaces = ['packages/*']
      changed = true
    } else if (Array.isArray(pkg.workspaces)) {
      if (!pkg.workspaces.includes('packages/*')) {
        pkg.workspaces.push('packages/*')
        changed = true
      }
    } else {
      const workspacePackages = pkg.workspaces.packages
      if (!workspacePackages) {
        pkg.workspaces.packages = ['packages/*']
        changed = true
      } else if (!workspacePackages.includes('packages/*')) {
        workspacePackages.push('packages/*')
        changed = true
      }
    }
    return changed
  },
  replaceDependencyInSection = (section: Record<string, string> | undefined, installedPackage: string) => {
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
  },
  prepareContext = (cwd: string): EjectContext => {
    const rootPackagePath = join(cwd, 'package.json'),
      detected = detectInstalledPackage(rootPackagePath),
      sourceRoot = join(cwd, 'node_modules', '@noboil', detected.db, 'src'),
      sourcePackageJsonPath = join(cwd, 'node_modules', '@noboil', detected.db, 'package.json')

    if (!(existsSync(sourceRoot) && existsSync(sourcePackageJsonPath))) fail('Run `bun install` first.')

    const sourcePackageJson = readJson(sourcePackageJsonPath) as PackageJson
    if (!sourcePackageJson.exports || typeof sourcePackageJson.exports !== 'object')
      fail('Unable to read exports map from installed @noboil package.')

    const sourceFiles = collectFiles(sourceRoot),
      sharedSpecifiers = collectSharedImportsFromFiles(sourceFiles)
    let sharedRoot: string | undefined,
      sharedFiles: string[] = []

    if (sharedSpecifiers.size > 0) {
      const nodeModulesShared = join(cwd, 'node_modules', '@a', 'shared', 'src'),
        workspaceShared = join(cwd, 'packages', 'shared', 'src')
      if (existsSync(nodeModulesShared)) sharedRoot = nodeModulesShared
      else if (existsSync(workspaceShared)) sharedRoot = workspaceShared
      else fail('Shared source missing. Install `@a/shared` or include packages/shared.')

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
  },
  copyIntoTarget = ({
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
      const rel = relative(fromRoot, filePath),
        targetPath = join(toRoot, rel)
      copied += 1
      if (!dryRun) {
        mkdirSync(dirname(targetPath), { recursive: true })
        copyFileSync(filePath, targetPath)
      }
    }
    return copied
  },
  printSummary = ({
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
  },
  eject = (args: string[]) => {
    if (args.includes('--help') || args.includes('-h')) {
      console.log(HELP)
      return
    }

    const dryRun = args.includes('--dry-run'),
      cwd = process.cwd(),
      context = prepareContext(cwd),
      localPackageDir = join(cwd, 'packages', 'noboil'),
      localSourceDir = join(localPackageDir, 'src')

    let copiedSharedFiles = 0,
      rewrittenImportFiles = 0,
      rewrittenImportCount = 0,
      rewrittenSharedFiles = 0,
      rewrittenSharedCount = 0,
      packageJsonFilesUpdated = 0,
      markedEjected = false

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
      const content = readFileSync(filePath, 'utf8'),
        rewrites = rewriteNoboilSpecifiers(content, context.installedPackage)
      if (rewrites.changed) {
        rewrittenImportFiles += 1
        rewrittenImportCount += rewrites.replacements
        if (!dryRun) writeFileSync(filePath, rewrites.output)
      }
    }

    const ejectedTsFiles = collectTsFiles(localSourceDir)
    for (const filePath of ejectedTsFiles) {
      const content = readFileSync(filePath, 'utf8'),
        rewrites = rewriteSharedSpecifiers(content, filePath, localSourceDir)
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

      /** biome-ignore lint/nursery/noUnnecessaryConditions: changed is conditionally set above */
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
