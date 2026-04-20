const config = {
  credentials: {
    minio: { password: 'minioadmin', user: 'sss' },
    postgres: 'postgres'
  },
  module: 'noboil',
  paths: {
    backendConvex: 'backend/convex',
    backendStdb: 'backend/spacetimedb',
    doc: 'doc',
    webCvx: 'web/cvx',
    webStdb: 'web/stdb'
  },
  ports: {
    apps: {
      'cvx-blog': 4100,
      'cvx-chat': 4101,
      'cvx-movie': 4102,
      'cvx-org': 4103,
      'stdb-blog': 4200,
      'stdb-chat': 4201,
      'stdb-movie': 4202,
      'stdb-org': 4203
    },
    convexApi: 4001,
    convexDashboard: 4500,
    convexSite: 4002,
    doc: 4300,
    minio: 4600,
    minioConsole: 4601,
    postgres: 5432,
    stdb: 4000
  }
} as const
type AppId = 'doc' | keyof typeof config.ports.apps
const allAppPorts = (): Record<string, number> => ({ ...config.ports.apps, doc: config.ports.doc })
const appPort = (id: string): number => {
  const ports = allAppPorts()
  const port = ports[id]
  if (!port) throw new Error(`No port configured for app: ${id}. Valid: ${Object.keys(ports).join(', ')}`)
  return port
}
const portVars = (): Record<string, string> => {
  const vars: Record<string, string> = {
    PORT_CONVEX_API: String(config.ports.convexApi),
    PORT_CONVEX_DASHBOARD: String(config.ports.convexDashboard),
    PORT_CONVEX_SITE: String(config.ports.convexSite),
    PORT_DOC: String(config.ports.doc),
    PORT_MINIO: String(config.ports.minio),
    PORT_MINIO_CONSOLE: String(config.ports.minioConsole),
    PORT_POSTGRES: String(config.ports.postgres),
    PORT_STDB: String(config.ports.stdb)
  }
  for (const [k, v] of Object.entries(config.ports.apps)) vars[`PORT_${k.toUpperCase().replaceAll('-', '_')}`] = String(v)
  return vars
}
const urls = () => ({
  convexApi: `http://127.0.0.1:${config.ports.convexApi}`,
  convexDashboard: `http://127.0.0.1:${config.ports.convexDashboard}`,
  convexSite: `http://127.0.0.1:${config.ports.convexSite}`,
  doc: `http://localhost:${config.ports.doc}`,
  minio: `http://127.0.0.1:${config.ports.minio}`,
  minioConsole: `http://127.0.0.1:${config.ports.minioConsole}`,
  siteCvx: `http://localhost:${config.ports.apps['cvx-blog']}`,
  siteStdb: `http://localhost:${config.ports.apps['stdb-blog']}`,
  stdbWs: `ws://localhost:${config.ports.stdb}`
})
export { allAppPorts, type AppId, appPort, config, portVars, urls }
