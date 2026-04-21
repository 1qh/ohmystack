import { appPort } from '@a/config'
import { createPlaywrightConfig } from '@a/e2e/playwright-config'
const config = createPlaywrightConfig({ webServerUrl: `http://localhost:${appPort('stdb-org')}/login` })
config.timeout = 45_000
export default config
