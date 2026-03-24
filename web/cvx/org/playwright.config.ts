import { createPlaywrightConfig } from '@a/e2e/playwright-config'
export default createPlaywrightConfig({ port: 4103, webServerUrl: 'http://localhost:4103/login' })
