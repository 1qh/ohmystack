import { createPlaywrightConfig } from '@a/e2e/playwright-config'
import { appPort } from '@a/config'
export default createPlaywrightConfig({ webServerUrl: `http://localhost:${appPort('cvx-org')}/login` })
