import { file, spawnSync, write } from 'bun'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
    typeof value === 'object' && value !== null && !Array.isArray(value),
  decode = (value: null | Uint8Array | undefined) => (value ? new TextDecoder().decode(value) : ''),
  readJson = async (filePath: string): Promise<JsonRecord | null> => {
    const handle = file(filePath)
    if (!(await handle.exists())) return null
    const value = await handle.json()
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
  run = ({ cmd, cwd }: { cmd: string[]; cwd?: string }) => {
    const result = spawnSync({
      cmd,
      cwd: cwd ?? process.cwd(),
      stderr: 'inherit',
      stdout: 'inherit'
    })
    if (result.exitCode !== 0) throw new Error(`Command failed (${result.exitCode}): ${cmd.join(' ')}`)
  },
  runCapture = ({ cmd, cwd }: { cmd: string[]; cwd: string }) =>
    spawnSync({
      cmd,
      cwd,
      stderr: 'pipe',
      stdout: 'pipe'
    }),
  writeJson = async ({ filePath, value }: { filePath: string; value: JsonRecord }) => {
    await write(file(filePath), `${JSON.stringify(value, null, 2)}\n`)
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
      if (entry.isFile() && entry.name === '.gitkeep') tasks.push((async () => run({ cmd: ['rm', '-f', absPath] }))())
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
        const gitPath = `packages/ui/${relPath}`,
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

    const gitPath = `packages/ui/${relPath}`,
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
  uiDir = join(root, 'packages/ui'),
  tmpDir = '/tmp/shadcn-sync',
  tmpUi = join(tmpDir, 'a/packages/ui'),
  main = async () => {
    const [fallbackComponents, fallbackPackage, fallbackTsconfig, fallbackTsconfigLint] = await Promise.all([
        readJson(join(uiDir, 'components.json')),
        readJson(join(uiDir, 'package.json')),
        readJson(join(uiDir, 'tsconfig.json')),
        readJson(join(uiDir, 'tsconfig.lint.json'))
      ]),
      snapshotComponents = readJsonFromGit({ filePath: 'packages/ui/components.json' }) ?? fallbackComponents,
      snapshotPackage = readJsonFromGit({ filePath: 'packages/ui/package.json' }) ?? fallbackPackage,
      snapshotTsconfig = readJsonFromGit({ filePath: 'packages/ui/tsconfig.json' }) ?? fallbackTsconfig,
      snapshotTsconfigLint = readJsonFromGit({ filePath: 'packages/ui/tsconfig.lint.json' }) ?? fallbackTsconfigLint

    run({ cmd: ['rm', '-rf', tmpDir] })
    run({ cmd: ['mkdir', '-p', tmpDir] })
    run({
      cmd: ['bunx', '--bun', 'shadcn@latest', 'init', '-t', 'next', '-b', 'base', '--monorepo', '-p', 'vega', '-n', 'a'],
      cwd: tmpDir
    })
    run({ cmd: ['bunx', '--bun', 'shadcn@latest', 'add', '-ayo'], cwd: tmpUi })
    run({ cmd: ['bunx', '--bun', 'shadcn@latest', 'add', '@ai-elements/all', '-ayo'], cwd: tmpUi })

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
      await writeJson({ filePath: join(tmpUi, 'package.json'), value: nextPackage })
    }

    if (snapshotComponents && nextComponents) {
      const { aliases } = snapshotComponents
      if (isRecord(aliases)) nextComponents.aliases = aliases
      await writeJson({ filePath: join(tmpUi, 'components.json'), value: nextComponents })
    }

    if (snapshotTsconfig) await writeJson({ filePath: join(tmpUi, 'tsconfig.json'), value: snapshotTsconfig })
    if (snapshotTsconfigLint) await writeJson({ filePath: join(tmpUi, 'tsconfig.lint.json'), value: snapshotTsconfigLint })

    await replaceImportPrefix({ fromPrefix: generatedPrefix, srcDir: join(tmpUi, 'src'), toPrefix: snapshotPrefix })

    run({ cmd: ['rm', '-rf', join(tmpUi, 'node_modules')] })

    run({ cmd: ['rm', '-rf', uiDir] })
    run({ cmd: ['mv', tmpUi, uiDir] })
    await pruneGitkeepFiles({ dirPath: uiDir })
    await repairTypecheck({ attempt: 1, rootDir: root, uiTmpDir: uiDir })
    run({ cmd: ['rm', '-rf', tmpDir] })
  }

await main()
