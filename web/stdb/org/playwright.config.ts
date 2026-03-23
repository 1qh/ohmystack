import { createPlaywrightConfig } from '@a/e2e/playwright-config'
const config = createPlaywrightConfig({ port: 3004, webServerUrl: 'http://localhost:3004/login' })
config.timeout = 45_000
export default config
