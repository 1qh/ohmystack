import { file, spawnSync, write } from 'bun'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { argv as nodeArgv } from 'node:process'

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
  replaceImportPrefix = async ({
    fromPrefix,
    srcDir,
    toPrefix
  }: {
    fromPrefix: string
    srcDir: string
    toPrefix: string
  }) => {
    if (fromPrefix === toPrefix) return
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
    rnrTmpDir,
    rootDir
  }: {
    relDir: string
    rnrTmpDir: string
    rootDir: string
  }) => {
    const gitPrefix = `packages/rnr/${relDir}`,
      files = listGitTreeFiles({ prefix: gitPrefix, rootDir }),
      targetDir = join(rnrTmpDir, relDir)

    if (files.length === 0) return
    run({ cmd: ['rm', '-rf', targetDir] })
    const writes: Promise<void>[] = []

    for (const gitPath of files) {
      const relPath = gitPath.startsWith('packages/rnr/') ? gitPath.slice('packages/rnr/'.length) : null
      if (relPath !== null) {
        const result = runCapture({ cmd: ['git', 'show', `HEAD:${gitPath}`], cwd: rootDir })
        if (result.exitCode === 0) {
          const absPath = join(rnrTmpDir, relPath)
          run({ cmd: ['mkdir', '-p', dirname(absPath)] })
          writes.push(write(file(absPath), decode(result.stdout)))
        }
      }
    }

    await Promise.all(writes)
  },
  root = process.cwd(),
  rnrDir = join(root, 'packages/rnr'),
  tmpDir = '/tmp/rnr-sync',
  tmpRnr = join(tmpDir, 'seed'),
  templateRepo = 'https://github.com/founded-labs/react-native-reusables-templates.git',
  syncCheck = ({ rootDir }: { rootDir: string }) => {
    const diff = runCapture({ cmd: ['git', 'diff', '--exit-code', '--', 'packages/rnr'], cwd: rootDir }),
      output = `${decode(diff.stdout)}${decode(diff.stderr)}`
    if (diff.exitCode !== 0) throw new Error(`packages/rnr is out of sync with sync script output:\n${output}`)
  },
  syncUpdate = async () => {
    const [fallbackPackage, fallbackComponents, fallbackTsconfig] = await Promise.all([
        readJson(join(rnrDir, 'package.json')),
        readJson(join(rnrDir, 'components.json')),
        readJson(join(rnrDir, 'tsconfig.json'))
      ]),
      snapshotPackage = readJsonFromGit({ filePath: 'packages/rnr/package.json' }) ?? fallbackPackage,
      snapshotComponents = readJsonFromGit({ filePath: 'packages/rnr/components.json' }) ?? fallbackComponents,
      snapshotTsconfig = readJsonFromGit({ filePath: 'packages/rnr/tsconfig.json' }) ?? fallbackTsconfig

    run({ cmd: ['rm', '-rf', tmpDir] })
    run({ cmd: ['mkdir', '-p', tmpDir] })

    run({ cmd: ['git', 'clone', '--depth', '1', templateRepo, 'templates'], cwd: tmpDir })
    run({ cmd: ['cp', '-R', join(tmpDir, 'templates/minimal-uniwind/.'), tmpRnr] })
    run({ cmd: ['bun', 'i'], cwd: tmpRnr })
    run({
      cmd: [
        'npx',
        '@react-native-reusables/cli@latest',
        'add',
        '--all',
        '--styling-library',
        'uniwind',
        '--yes',
        '--overwrite'
      ],
      cwd: tmpRnr
    })

    const outComponents = join(tmpRnr, 'src/components'),
      outLib = join(tmpRnr, 'src/lib'),
      outStyles = join(tmpRnr, 'src/styles')
    run({ cmd: ['mkdir', '-p', outComponents, outLib, outStyles] })
    run({ cmd: ['sh', '-c', `cp -R ${join(tmpRnr, 'components/ui')}/* ${outComponents}/`] })
    run({ cmd: ['cp', join(tmpRnr, 'lib/utils.ts'), join(outLib, 'utils.ts')] })
    run({ cmd: ['cp', join(tmpRnr, 'lib/theme.ts'), join(outLib, 'theme.ts')] })
    run({ cmd: ['cp', join(tmpRnr, 'global.css'), join(outStyles, 'globals.css')] })

    await replaceImportPrefix({ fromPrefix: '@/lib/utils', srcDir: outComponents, toPrefix: '@a/rnr' })
    await replaceImportPrefix({ fromPrefix: '@/components/ui/', srcDir: outComponents, toPrefix: '@a/rnr/components/' })

    if (snapshotPackage) await writeJson({ filePath: join(tmpRnr, 'package.json'), value: snapshotPackage })
    if (snapshotComponents) await writeJson({ filePath: join(tmpRnr, 'components.json'), value: snapshotComponents })
    if (snapshotTsconfig) await writeJson({ filePath: join(tmpRnr, 'tsconfig.json'), value: snapshotTsconfig })

    await restoreDirFromGitSnapshot({ relDir: 'src/lib', rnrTmpDir: tmpRnr, rootDir: root })

    const finalRnr = join(tmpRnr, 'packages-rnr-output')
    run({ cmd: ['mkdir', '-p', finalRnr] })
    run({ cmd: ['sh', '-c', `cp -R ${outComponents} ${finalRnr}/`] })
    run({ cmd: ['sh', '-c', `cp -R ${outLib} ${finalRnr}/`] })
    run({ cmd: ['sh', '-c', `cp -R ${outStyles} ${finalRnr}/`] })

    run({ cmd: ['rm', '-rf', join(rnrDir, 'src')] })
    run({ cmd: ['mkdir', '-p', join(rnrDir, 'src')] })
    run({ cmd: ['sh', '-c', `cp -R ${finalRnr}/* ${join(rnrDir, 'src')}/`] })

    if (snapshotPackage) await writeJson({ filePath: join(rnrDir, 'package.json'), value: snapshotPackage })
    if (snapshotComponents) await writeJson({ filePath: join(rnrDir, 'components.json'), value: snapshotComponents })
    if (snapshotTsconfig) await writeJson({ filePath: join(rnrDir, 'tsconfig.json'), value: snapshotTsconfig })

    run({ cmd: ['rm', '-rf', tmpDir] })
  },
  main = async () => {
    const args = new Set(nodeArgv.slice(2)),
      checkOnly = args.has('--check'),
      updateOnly = args.has('--update')

    if (checkOnly && updateOnly) throw new Error('Use either --check or --update, not both')
    if (checkOnly) {
      syncCheck({ rootDir: root })
      return
    }
    await syncUpdate()
    if (!updateOnly) syncCheck({ rootDir: root })
  }

await main()
