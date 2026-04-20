import { createPlaywrightConfig } from '@a/e2e/playwright-config'
import { appPort } from '../../../noboil.config'
export default createPlaywrightConfig({ webServerUrl: `http://localhost:${appPort('cvx-org')}/login` })
