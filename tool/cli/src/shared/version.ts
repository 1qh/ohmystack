import { file } from 'bun'
import { join } from 'node:path'
const readPackageVersion = async (packageJsonPath: string): Promise<string> => {
  const pkg = (await file(packageJsonPath).json()) as { version?: string }
  return pkg.version ?? '0.0.0'
}
const cliPackagePath = () => join(import.meta.dir, '..', '..', 'package.json')
const getCliVersion = async (): Promise<string> => readPackageVersion(cliPackagePath())
export { getCliVersion, readPackageVersion }
