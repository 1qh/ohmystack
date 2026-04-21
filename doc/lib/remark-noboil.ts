import type { Root } from 'mdast'
import { config, urls } from '@a/config'
import { visit } from 'unist-util-visit'
const portMap = (): Record<string, number> => ({
  ...config.ports.apps,
  convexApi: config.ports.convexApi,
  convexDashboard: config.ports.convexDashboard,
  convexSite: config.ports.convexSite,
  doc: config.ports.doc,
  minio: config.ports.minio,
  minioConsole: config.ports.minioConsole,
  postgres: config.ports.postgres,
  stdb: config.ports.stdb
})
const resolve = (token: string): string => {
  const [kind, key] = token.split(':')
  if (kind === 'port') {
    const ports = portMap()
    const p = key ? ports[key] : undefined
    if (!p) throw new Error(`Unknown port token: {{port:${key}}}. Valid: ${Object.keys(ports).join(', ')}`)
    return String(p)
  }
  if (kind === 'url') {
    const us = urls() as Record<string, string>
    const u = key ? us[key] : undefined
    if (!u) throw new Error(`Unknown url token: {{url:${key}}}. Valid: ${Object.keys(us).join(', ')}`)
    return u
  }
  if (kind === 'path') {
    const paths = config.paths as Record<string, string>
    const p = key ? paths[key] : undefined
    if (!p) throw new Error(`Unknown path token: {{path:${key}}}. Valid: ${Object.keys(paths).join(', ')}`)
    return p
  }
  if (kind === 'module' && !key) return config.module
  throw new Error(`Unknown token: {{${token}}}`)
}
const TOKEN_RE = /%%(?<t>[a-z]+(?::[a-zA-Z-]+)?)%%/gu
const sub = (s: string): string => s.replaceAll(TOKEN_RE, (_, t: string) => resolve(t))
const remarkNoboil = () => (tree: Root) => {
  visit(tree, node => {
    if ('value' in node && typeof node.value === 'string') node.value = sub(node.value)
  })
}
export default remarkNoboil
