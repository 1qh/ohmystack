import { createPlaywrightConfig } from '@a/e2e/playwright-config'

export default createPlaywrightConfig({ port: 3004, webServerUrl: 'http://localhost:3004/login' })
