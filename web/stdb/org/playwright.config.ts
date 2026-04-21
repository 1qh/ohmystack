import { createPlaywrightConfig } from '@a/e2e/playwright-config'
import { appPort } from '@a/config'
const config = createPlaywrightConfig({ webServerUrl: `http://localhost:${appPort('stdb-org')}/login` })
config.timeout = 45_000
export default config
