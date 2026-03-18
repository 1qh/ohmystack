import { test as baseTest, expect } from '@a/e2e/base-test'
import { login } from '@a/e2e/helpers'

import OnboardingPage from './pages/onboarding'

interface Fixtures {
  onboardingPage: OnboardingPage
}

const test = baseTest.extend<Fixtures>({
  onboardingPage: async ({ page }, run) => {
    await login(page)
    const onboardingPage = new OnboardingPage(page)
    await run(onboardingPage)
  }
})

export { expect, test }
