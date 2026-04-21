import { appPort } from '@a/config'
import { createPlaywrightConfig } from '@a/e2e/playwright-config'
export default createPlaywrightConfig({ webServerUrl: `http://localhost:${appPort('cvx-org')}/login` })
