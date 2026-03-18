import { test as baseTest, expect } from '@a/e2e/base-test'

import OnboardingPage from './pages/onboarding'

interface Fixtures {
  onboardingPage: OnboardingPage
}

const test = baseTest.extend<Fixtures>({
  onboardingPage: async ({ page }, run) => {
    const onboardingPage = new OnboardingPage(page)
    await run(onboardingPage)
  }
})

export { expect, test }
