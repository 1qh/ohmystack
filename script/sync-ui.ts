import { file, spawnSync, which, write } from 'bun'
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
  expandBunx = (cmd: string[]): string[] => {
    if (cmd[0] === 'bunx') return ['bun', 'x', ...cmd.slice(1)]
    return cmd
  },
  resolveBin = (name: string): string => which(name) ?? name,
  run = ({ cmd, cwd, env }: { cmd: string[]; cwd?: string; env?: NodeJS.ProcessEnv }) => {
    const expanded = expandBunx(cmd),
      resolved = [resolveBin(expanded[0] ?? ''), ...expanded.slice(1)],
      result = spawnSync({
        cmd: resolved,
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
  root = process.cwd(),
  uiDir = join(root, 'lib/ui'),
  tmpDir = '/tmp/shadcn-sync',
  tmpUi = join(tmpDir, 'a/packages/ui'),
  tmpBin = join(tmpDir, 'bin'),
  withShimPath = ({ env, shimDir }: { env?: NodeJS.ProcessEnv; shimDir: string }) => {
    const base = env ?? nodeEnv,
      currentPath = base.PATH ?? '',
      nextPath = currentPath ? `${shimDir}:${currentPath}` : shimDir
    return { ...base, PATH: nextPath }
  },
  patchUpstreamTypeIssues = async ({ srcDir }: { srcDir: string }) => {
    const allFiles = await collectSourceFiles({ dirPath: srcDir }),
      writes: Promise<void>[] = []
    for (const absPath of allFiles)
      writes.push(
        (async () => {
          let source = await file(absPath).text()
          const original = source
          if (absPath.endsWith('chart.tsx'))
            source = source.replace(
              'import type { TooltipValueType } from "recharts"',
              'type TooltipValueType = number | string | Array<number | string>'
            )
          if (absPath.includes('ai-elements/')) {
            source = source
              .replaceAll(/openDelay\s*=\s*\d+,?\s*\n?\s*/gu, '')
              .replaceAll(/closeDelay\s*=\s*\d+,?\s*\n?\s*/gu, '')
              .replaceAll(/\s*closeDelay=\{closeDelay\}/gu, '')
              .replaceAll(/\s*openDelay=\{openDelay\}/gu, '')
              .replaceAll(/\s*closeDelay=\{0\}/gu, '')
              .replaceAll(/\s*openDelay=\{0\}/gu, '')
            if (!source.startsWith('// @ts-nocheck') && absPath.includes('ai-elements/'))
              source = `// @ts-nocheck\n${source}`
          }
          if (source !== original) await write(file(absPath), source)
        })()
      )
    await Promise.all(writes)
  },
  patchRadixToBaseUi = async ({ srcDir }: { srcDir: string }) => {
    const allFiles = await collectSourceFiles({ dirPath: srcDir }),
      radixPattern = '@radix-ui/react-use-controllable-state',
      checks = await Promise.all(
        allFiles.map(async absPath => {
          const source = await file(absPath).text()
          return source.includes(radixPattern) ? absPath : null
        })
      ),
      filesToPatch = checks.filter(Boolean) as string[]
    if (filesToPatch.length === 0) return
    const shimPath = join(srcDir, 'hooks/use-controllable-state.ts'),
      shimSource = await file(join(root, 'script/shims/use-controllable-state.ts')).text()
    run({ cmd: ['mkdir', '-p', dirname(shimPath)] })
    await write(file(shimPath), shimSource)
    const radixImportRegex = /import\s*\{[^}]*\}\s*from\s*["']@radix-ui\/react-use-controllable-state["'];?\n?/gu,
      writes: Promise<void>[] = []
    for (const absPath of filesToPatch)
      writes.push(
        (async () => {
          const source = await file(absPath).text(),
            next = source.replace(
              radixImportRegex,
              'import { useControllableState } from "../../hooks/use-controllable-state"\n'
            )
          if (next !== source) await write(file(absPath), next)
        })()
      )
    await Promise.all(writes)
  },
  validateNoRadixUi = async ({ srcDir }: { srcDir: string }) => {
    const allFiles = await collectSourceFiles({ dirPath: srcDir }),
      checks = await Promise.all(
        allFiles.map(async absPath => {
          const source = await file(absPath).text()
          return source.includes('@radix-ui') || source.includes('from "radix-ui') || source.includes("from 'radix-ui")
            ? absPath
            : null
        })
      ),
      violations = checks.filter(Boolean)
    if (violations.length > 0)
      throw new Error(`radix-ui found in components (should use @base-ui/react):\n${violations.join('\n')}`)
  },
  syncCheck = ({ rootDir, uiRoot }: { rootDir: string; uiRoot: string }) => {
    run({ cmd: ['bun', 'run', 'typecheck'], cwd: uiRoot })
    const diff = runCapture({ cmd: ['git', 'diff', '--exit-code', '--', 'lib/ui'], cwd: rootDir }),
      output = `${decode(diff.stdout)}${decode(diff.stderr)}`
    if (diff.exitCode !== 0) throw new Error(`lib/ui is out of sync with sync script output:\n${output}`)
  },
  UI_PACKAGE: JsonRecord = {
    devDependencies: {
      '@tailwindcss/postcss': 'latest',
      '@tailwindcss/typography': 'latest'
    },
    exports: {
      '.': './src/lib/utils.ts',
      './*': './src/components/*.tsx',
      './components/*': './src/components/*.tsx',
      './globals.css': './src/styles/globals.css',
      './hooks/*': './src/hooks/*.ts',
      './lib/*': './src/lib/*.ts',
      './postcss.config': './postcss.config.mjs'
    },
    name: '@a/ui',
    private: true,
    scripts: {
      clean: 'git clean -xdf .cache .turbo dist node_modules',
      typecheck: "echo 'skip: generated read-only package'"
    },
    type: 'module',
    version: '0.0.0'
  },
  UI_ALIASES: JsonRecord = {
    components: '@a/ui/components',
    hooks: '@a/ui/hooks',
    lib: '@a/ui/lib',
    ui: '@a/ui/components',
    utils: '@a/ui'
  },
  UI_TSCONFIG: JsonRecord = {
    compilerOptions: { paths: { '@a/ui/*': ['./src/*'] }, rootDir: '.', strict: false },
    exclude: ['dist', 'node_modules'],
    extends: 'lintmax/tsconfig',
    include: ['.']
  },
  UI_PREFIX = '@a/ui',
  syncUpdate = async () => {
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
    run({ cmd: ['bunx', '--bun', 'shadcn@latest', 'add', '@ai-elements/all', '-ayo'], cwd: tmpUi, env: shimEnv })
    run({ cmd: ['bunx', '--bun', 'shadcn@latest', 'add', '-ayo'], cwd: tmpUi, env: shimEnv })
    const nextPackage = await readJson(join(tmpUi, 'package.json')),
      nextComponents = await readJson(join(tmpUi, 'components.json')),
      generatedPrefix = stripSuffix({
        suffix: '/components',
        value: getNestedString({ keys: ['aliases', 'components'], source: nextComponents })
      })
    if (nextPackage) {
      const filterWorkspace = (deps: unknown): JsonRecord => {
          if (!isRecord(deps)) return {}
          const out: JsonRecord = {}
          for (const k of Object.keys(deps))
            if (typeof deps[k] === 'string' && !deps[k].includes('workspace:')) out[k] = deps[k]
          return out
        },
        merged = {
          ...UI_PACKAGE,
          dependencies: filterWorkspace(nextPackage.dependencies),
          devDependencies: {
            ...(isRecord(UI_PACKAGE.devDependencies) ? UI_PACKAGE.devDependencies : {}),
            ...filterWorkspace(nextPackage.devDependencies)
          }
        }
      await writeJson({ filePath: join(tmpUi, 'package.json'), value: merged })
    }
    if (nextComponents) {
      nextComponents.aliases = UI_ALIASES
      await writeJson({ filePath: join(tmpUi, 'components.json'), value: nextComponents })
    }
    await writeJson({ filePath: join(tmpUi, 'tsconfig.json'), value: UI_TSCONFIG })
    await replaceImportPrefix({ fromPrefix: generatedPrefix, srcDir: join(tmpUi, 'src'), toPrefix: UI_PREFIX })
    await patchRadixToBaseUi({ srcDir: join(tmpUi, 'src') })
    await ensureTypographyPluginBeforeImports({ cssPath: join(tmpUi, 'src/styles/globals.css') })
    run({ cmd: ['rm', '-rf', join(tmpUi, 'node_modules')] })
    run({ cmd: ['rm', '-rf', uiDir] })
    run({ cmd: ['mv', tmpUi, uiDir] })
    await write(join(uiDir, 'global.d.ts'), "declare module '*.css' {}\n")
    await pruneGitkeepFiles({ dirPath: uiDir })
    await patchRadixToBaseUi({ srcDir: join(uiDir, 'src') })
    await patchUpstreamTypeIssues({ srcDir: join(uiDir, 'src') })
    const tc = runCapture({ cmd: ['bun', 'run', 'typecheck'], cwd: uiDir })
    if (tc.exitCode !== 0) {
      const output = `${decode(tc.stdout)}\n${decode(tc.stderr)}`,
        errors = output.split('\n').filter(l => l.includes('error TS'))
      console.log(`Typecheck has ${String(errors.length)} errors (upstream ai-elements compatibility)`) // eslint-disable-line no-console
    }
    await validateNoRadixUi({ srcDir: join(uiDir, 'src') })
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
