import { createPlaywrightConfig } from '@a/e2e/playwright-config'
const config = createPlaywrightConfig({ port: 4203, webServerUrl: 'http://localhost:4203/login' })
config.timeout = 45_000
export default config
