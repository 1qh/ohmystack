import { file, spawnSync, write } from 'bun'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { argv as nodeArgv, env as nodeEnv } from 'node:process'
type JsonRecord = Record<string, unknown>
const lineBreakRegex = /\r?\n/u,
  isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value),
  decode = (value: null | Uint8Array | undefined) => (value ? new TextDecoder().decode(value) : ''),
  readJson = async (filePath: string): Promise<JsonRecord | null> => {
    const handle = file(filePath)
    if (!(await handle.exists())) return null
    const source = await handle.text(),
      value = JSON.parse(source) as unknown
    return isRecord(value) ? value : null
  },
  readJsonFromGit = ({ filePath }: { filePath: string }): JsonRecord | null => {
    const result = spawnSync({
      cmd: ['git', 'show', `HEAD:${filePath}`],
      cwd: process.cwd(),
      stderr: 'pipe',
      stdout: 'pipe'
    })
    if (result.exitCode !== 0) return null
    try {
      const value = JSON.parse(decode(result.stdout)) as unknown
      return isRecord(value) ? value : null
    } catch {
      return null
    }
  },
  run = ({ cmd, cwd, env }: { cmd: string[]; cwd?: string; env?: NodeJS.ProcessEnv }) => {
    const result = spawnSync({
      cmd,
      cwd: cwd ?? process.cwd(),
      env,
      stderr: 'inherit',
      stdout: 'inherit'
    })
    if (result.exitCode !== 0) throw new Error(`Command failed (${result.exitCode}): ${cmd.join(' ')}`)
  },
  runCapture = ({ cmd, cwd, env }: { cmd: string[]; cwd: string; env?: NodeJS.ProcessEnv }) =>
    spawnSync({
      cmd,
      cwd,
      env,
      stderr: 'pipe',
      stdout: 'pipe'
    }),
  writeJson = async ({ filePath, value }: { filePath: string; value: JsonRecord }) => {
    await write(file(filePath), `${JSON.stringify(value, null, 2)}\n`)
  },
  ensureTypographyPluginBeforeImports = async ({ cssPath }: { cssPath: string }) => {
    const source = await file(cssPath).text(),
      lineBreak = source.includes('\r\n') ? '\r\n' : '\n',
      pluginLine = '@plugin "@tailwindcss/typography";',
      shadcnImportLine = '@import "shadcn/tailwind.css";',
      rows = source.split(lineBreakRegex),
      withoutPlugin: string[] = []
    for (const row of rows) {
      const trimmed = row.trim()
      if (trimmed !== pluginLine && trimmed !== shadcnImportLine) withoutPlugin.push(row)
    }
    let importIndex = 0
    for (let i = 0; i < withoutPlugin.length; i += 1)
      if (withoutPlugin[i].trim().startsWith('@import ')) {
        importIndex = i
        break
      }
    withoutPlugin.splice(importIndex, 0, pluginLine)
    let next = withoutPlugin.join(lineBreak)
    if (!next.endsWith(lineBreak)) next = `${next}${lineBreak}`
    if (next !== source) await write(file(cssPath), next)
  },
  mergeWithOrder = ({ base, overlay }: { base: JsonRecord; overlay: JsonRecord }) => {
    const merged: JsonRecord = {}
    for (const key of Object.keys(base)) merged[key] = Object.hasOwn(overlay, key) ? overlay[key] : base[key]
    for (const key of Object.keys(overlay)) if (!Object.hasOwn(merged, key)) merged[key] = overlay[key]
    return merged
  },
  getNestedString = ({ keys, source }: { keys: string[]; source: JsonRecord | null }): null | string => {
    let cur: unknown = source
    for (const key of keys) {
      if (!isRecord(cur)) return null
      cur = cur[key]
    }
    return typeof cur === 'string' ? cur : null
  },
  stripSuffix = ({ suffix, value }: { suffix: string; value: null | string }) => {
    if (value === null) return null
    return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value
  },
  collectSourceFiles = async ({ dirPath }: { dirPath: string }) => {
    const entries = await readdir(dirPath, { withFileTypes: true }),
      files: string[] = [],
      nestedPromises: Promise<string[]>[] = []
    for (const entry of entries) {
      const absPath = join(dirPath, entry.name)
      if (entry.isDirectory()) nestedPromises.push(collectSourceFiles({ dirPath: absPath }))
      if (entry.isFile() && (absPath.endsWith('.ts') || absPath.endsWith('.tsx'))) files.push(absPath)
    }
    const nestedGroups = await Promise.all(nestedPromises)
    for (const group of nestedGroups) for (const nestedPath of group) files.push(nestedPath)
    return files
  },
  pruneGitkeepFiles = async ({ dirPath }: { dirPath: string }) => {
    const entries = await readdir(dirPath, { withFileTypes: true }),
      tasks: Promise<void>[] = []
    for (const entry of entries) {
      const absPath = join(dirPath, entry.name)
      if (entry.isDirectory()) tasks.push(pruneGitkeepFiles({ dirPath: absPath }))
      if (entry.isFile() && entry.name === '.gitkeep') tasks.push(Promise.resolve(run({ cmd: ['rm', '-f', absPath] })))
    }
    await Promise.all(tasks)
  },
  replaceImportPrefix = async ({
    fromPrefix,
    srcDir,
    toPrefix
  }: {
    fromPrefix: null | string
    srcDir: string
    toPrefix: null | string
  }) => {
    if (fromPrefix === null || toPrefix === null || fromPrefix === toPrefix) return
    const files = await collectSourceFiles({ dirPath: srcDir }),
      writes: Promise<void>[] = []
    for (const abs of files)
      writes.push(
        (async () => {
          const source = await file(abs).text(),
            next = source.split(fromPrefix).join(toPrefix)
          if (next !== source) await write(file(abs), next)
        })()
      )
    await Promise.all(writes)
  },
  uniquePaths = ({ values }: { values: string[] }) => {
    const out: string[] = []
    for (const value of values) if (!out.includes(value)) out.push(value)
    return out
  },
  parseTypecheckErrorPaths = ({ output }: { output: string }) => {
    const matches: string[] = [],
      regex = /^(?<path>[^\n()]+)\(\d+,\d+\): error TS\d+:/gmu
    let match = regex.exec(output)
    while (match) {
      const candidate = match.groups?.path?.trim()
      if (candidate) matches.push(candidate)
      match = regex.exec(output)
    }
    return uniquePaths({ values: matches })
  },
  extractComponentImportPaths = ({ source }: { source: string }) => {
    const importRegex = /@a\/ui\/components\/(?<component>[a-z0-9-]+)/gu,
      paths: string[] = []
    let match = importRegex.exec(source)
    while (match) {
      const componentName = match.groups?.component
      if (componentName) paths.push(`src/components/${componentName}.tsx`)
      match = importRegex.exec(source)
    }
    return paths
  },
  collectRelatedPaths = ({ errorPaths, rootDir }: { errorPaths: string[]; rootDir: string }) => {
    const related: string[] = []
    for (const relPath of errorPaths)
      if (relPath.startsWith('src/components/ai-elements/')) {
        const gitPath = `lib/ui/${relPath}`,
          gitFile = runCapture({
            cmd: ['git', 'show', `HEAD:${gitPath}`],
            cwd: rootDir
          })
        if (gitFile.exitCode === 0) {
          const imports = extractComponentImportPaths({ source: decode(gitFile.stdout) })
          for (const importPath of imports) related.push(importPath)
        }
      }
    return uniquePaths({ values: [...errorPaths, ...related] })
  },
  restoreOrDeleteFromGit = async ({
    relPath,
    rootDir,
    uiTmpDir
  }: {
    relPath: string
    rootDir: string
    uiTmpDir: string
  }) => {
    if (relPath.startsWith('..')) return false
    const gitPath = `lib/ui/${relPath}`,
      absolutePath = join(uiTmpDir, relPath),
      gitFile = runCapture({ cmd: ['git', 'show', `HEAD:${gitPath}`], cwd: rootDir })
    if (gitFile.exitCode === 0) {
      run({ cmd: ['mkdir', '-p', dirname(absolutePath)] })
      await write(file(absolutePath), decode(gitFile.stdout))
      return true
    }
    run({ cmd: ['rm', '-f', absolutePath] })
    return true
  },
  listGitTreeFiles = ({ prefix, rootDir }: { prefix: string; rootDir: string }) => {
    const result = runCapture({ cmd: ['git', 'ls-tree', '-r', '--name-only', 'HEAD', prefix], cwd: rootDir })
    if (result.exitCode !== 0) return []
    const lines = decode(result.stdout).split(lineBreakRegex),
      out: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.length > 0) out.push(trimmed)
    }
    return out
  },
  restoreDirFromGitSnapshot = async ({
    relDir,
    rootDir,
    uiTmpDir
  }: {
    relDir: string
    rootDir: string
    uiTmpDir: string
  }) => {
    const gitPrefix = `lib/ui/${relDir}`,
      files = listGitTreeFiles({ prefix: gitPrefix, rootDir }),
      targetDir = join(uiTmpDir, relDir)
    if (files.length === 0) return
    run({ cmd: ['rm', '-rf', targetDir] })
    const writes: Promise<void>[] = []
    for (const gitPath of files) {
      const relPath = gitPath.startsWith('lib/ui/') ? gitPath.slice('lib/ui/'.length) : null
      if (relPath !== null) {
        const result = runCapture({ cmd: ['git', 'show', `HEAD:${gitPath}`], cwd: rootDir })
        if (result.exitCode === 0) {
          const absPath = join(uiTmpDir, relPath)
          run({ cmd: ['mkdir', '-p', dirname(absPath)] })
          writes.push(write(file(absPath), decode(result.stdout)))
        }
      }
    }
    await Promise.all(writes)
  },
  reconcileTypecheckFailures = async ({
    errorPaths,
    rootDir,
    uiTmpDir
  }: {
    errorPaths: string[]
    rootDir: string
    uiTmpDir: string
  }) => {
    const restorePaths = collectRelatedPaths({ errorPaths, rootDir }),
      actions: Promise<boolean>[] = []
    for (const relPath of restorePaths)
      actions.push(
        restoreOrDeleteFromGit({
          relPath,
          rootDir,
          uiTmpDir
        })
      )
    const results = await Promise.all(actions)
    return results.includes(true)
  },
  repairTypecheck = async ({
    attempt,
    rootDir,
    uiTmpDir
  }: {
    attempt: number
    rootDir: string
    uiTmpDir: string
  }): Promise<void> => {
    const typecheck = runCapture({ cmd: ['bun', 'run', 'typecheck'], cwd: uiTmpDir })
    if (typecheck.exitCode === 0) return
    if (attempt >= 3)
      throw new Error(
        `ui sync typecheck failed after ${attempt} attempts:\n${decode(typecheck.stdout)}\n${decode(typecheck.stderr)}`
      )
    const output = `${decode(typecheck.stdout)}\n${decode(typecheck.stderr)}`,
      errorPaths = parseTypecheckErrorPaths({ output }),
      changed = await reconcileTypecheckFailures({
        errorPaths,
        rootDir,
        uiTmpDir
      })
    if (!changed) throw new Error(`ui sync typecheck failed with no recoverable files:\n${output}`)
    await repairTypecheck({ attempt: attempt + 1, rootDir, uiTmpDir })
  },
  root = process.cwd(),
  uiDir = join(root, 'lib/ui'),
  tmpDir = '/tmp/shadcn-sync',
  tmpUi = join(tmpDir, 'a/lib/ui'),
  tmpBin = join(tmpDir, 'bin'),
  withShimPath = ({ env, shimDir }: { env?: NodeJS.ProcessEnv; shimDir: string }) => {
    const base = env ?? nodeEnv,
      currentPath = base.PATH ?? '',
      nextPath = currentPath ? `${shimDir}:${currentPath}` : shimDir
    return { ...base, PATH: nextPath }
  },
  syncCheck = ({ rootDir, uiRoot }: { rootDir: string; uiRoot: string }) => {
    run({ cmd: ['bun', 'run', 'typecheck'], cwd: uiRoot })
    const diff = runCapture({ cmd: ['git', 'diff', '--exit-code', '--', 'lib/ui'], cwd: rootDir }),
      output = `${decode(diff.stdout)}${decode(diff.stderr)}`
    if (diff.exitCode !== 0) throw new Error(`lib/ui is out of sync with sync script output:\n${output}`)
  },
  syncUpdate = async () => {
    const [fallbackComponents, fallbackPackage, fallbackTsconfig, fallbackTsconfigLint] = await Promise.all([
        readJson(join(uiDir, 'components.json')),
        readJson(join(uiDir, 'package.json')),
        readJson(join(uiDir, 'tsconfig.json')),
        readJson(join(uiDir, 'tsconfig.lint.json'))
      ]),
      snapshotComponents = readJsonFromGit({ filePath: 'lib/ui/components.json' }) ?? fallbackComponents,
      snapshotPackage = readJsonFromGit({ filePath: 'lib/ui/package.json' }) ?? fallbackPackage,
      snapshotTsconfig = readJsonFromGit({ filePath: 'lib/ui/tsconfig.json' }) ?? fallbackTsconfig,
      snapshotTsconfigLint = readJsonFromGit({ filePath: 'lib/ui/tsconfig.lint.json' }) ?? fallbackTsconfigLint
    run({ cmd: ['rm', '-rf', tmpDir] })
    run({ cmd: ['mkdir', '-p', tmpDir] })
    run({ cmd: ['mkdir', '-p', tmpBin] })
    await write(file(join(tmpBin, 'pnpm')), '#!/usr/bin/env sh\nexec bun "$@"\n')
    run({ cmd: ['chmod', '+x', join(tmpBin, 'pnpm')] })
    const shimEnv = withShimPath({ shimDir: tmpBin })
    run({
      cmd: ['bunx', '--bun', 'shadcn@latest', 'init', '-t', 'next', '-b', 'base', '--monorepo', '-p', 'vega', '-n', 'a'],
      cwd: tmpDir,
      env: shimEnv
    })
    run({ cmd: ['bunx', '--bun', 'shadcn@latest', 'add', '-ayo'], cwd: tmpUi, env: shimEnv })
    run({ cmd: ['bunx', '--bun', 'shadcn@latest', 'add', '@ai-elements/all', '-ayo'], cwd: tmpUi, env: shimEnv })
    const nextPackage = await readJson(join(tmpUi, 'package.json')),
      nextComponents = await readJson(join(tmpUi, 'components.json')),
      generatedPrefix = stripSuffix({
        suffix: '/components',
        value: getNestedString({ keys: ['aliases', 'components'], source: nextComponents })
      }),
      snapshotPrefix = stripSuffix({
        suffix: '/components',
        value: getNestedString({ keys: ['aliases', 'components'], source: snapshotComponents })
      })
    if (snapshotPackage && nextPackage) {
      const { name } = snapshotPackage,
        { dependencies } = snapshotPackage,
        { devDependencies } = snapshotPackage,
        { exports } = snapshotPackage,
        { scripts } = snapshotPackage,
        { type } = snapshotPackage
      if (typeof name === 'string') nextPackage.name = name
      if (isRecord(dependencies)) nextPackage.dependencies = dependencies
      if (isRecord(devDependencies)) nextPackage.devDependencies = devDependencies
      if (isRecord(exports)) nextPackage.exports = exports
      if (isRecord(scripts)) nextPackage.scripts = scripts
      if (typeof type === 'string') nextPackage.type = type
      const orderedPackage = mergeWithOrder({ base: snapshotPackage, overlay: nextPackage })
      await writeJson({ filePath: join(tmpUi, 'package.json'), value: orderedPackage })
    }
    if (snapshotComponents && nextComponents) {
      const { aliases } = snapshotComponents
      if (isRecord(aliases)) nextComponents.aliases = aliases
      await writeJson({ filePath: join(tmpUi, 'components.json'), value: nextComponents })
    }
    if (snapshotTsconfig) await writeJson({ filePath: join(tmpUi, 'tsconfig.json'), value: snapshotTsconfig })
    if (snapshotTsconfigLint) await writeJson({ filePath: join(tmpUi, 'tsconfig.lint.json'), value: snapshotTsconfigLint })
    await replaceImportPrefix({ fromPrefix: generatedPrefix, srcDir: join(tmpUi, 'src'), toPrefix: snapshotPrefix })
    await restoreDirFromGitSnapshot({ relDir: 'src/components/ai-elements', rootDir: root, uiTmpDir: tmpUi })
    await ensureTypographyPluginBeforeImports({ cssPath: join(tmpUi, 'src/styles/globals.css') })
    run({ cmd: ['rm', '-rf', join(tmpUi, 'node_modules')] })
    run({ cmd: ['rm', '-rf', uiDir] })
    run({ cmd: ['mv', tmpUi, uiDir] })
    await pruneGitkeepFiles({ dirPath: uiDir })
    await repairTypecheck({ attempt: 1, rootDir: root, uiTmpDir: uiDir })
    run({ cmd: ['rm', '-rf', tmpDir] })
  },
  main = async () => {
    const args = new Set(nodeArgv.slice(2)),
      checkOnly = args.has('--check'),
      updateOnly = args.has('--update')
    if (checkOnly && updateOnly) throw new Error('Use either --check or --update, not both')
    if (checkOnly) {
      syncCheck({ rootDir: root, uiRoot: uiDir })
      return
    }
    await syncUpdate()
    if (!updateOnly) syncCheck({ rootDir: root, uiRoot: uiDir })
  }
await main()
