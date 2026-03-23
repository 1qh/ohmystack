import { createPlaywrightConfig } from '@a/e2e/playwright-config'
const config = createPlaywrightConfig({ port: 3002 })
config.timeout = 45_000
export default config
