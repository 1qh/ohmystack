/** biome-ignore-all lint/style/noProcessEnv: env detection in config */
import { defineConfig, devices } from '@playwright/test'

interface PlaywrightOptions {
  port: number
  webServerUrl?: string
}

const createPlaywrightConfig = ({ port, webServerUrl }: PlaywrightOptions) => {
  // biome-ignore lint/style/noProcessEnv: CI detection
  const baseURL = `http://localhost:${port}`,
    isCI = Boolean(process.env.CI)

  return defineConfig({
    expect: { timeout: 5000 },
    forbidOnly: isCI,
    fullyParallel: false,
    globalSetup: './e2e/global-setup.ts',
    globalTeardown: './e2e/global-teardown.ts',
    outputDir: './test-results',
    projects: [
      {
        name: 'chromium',
        use: {
          ...devices['Desktop Chrome'],
          screenshot: 'only-on-failure',
          trace: 'retain-on-failure',
          video: 'retain-on-failure'
        }
      }
    ],
    reporter: [['html', { open: 'never' }], ['list']],
    retries: 2,
    testDir: './e2e',
    timeout: 30_000,
    use: { baseURL },
    webServer: {
      command: `dotenv -e ../../.env -- env PLAYWRIGHT=1 CONVEX_TEST_MODE=true next dev --turbo --port ${port}`,
      env: { CONVEX_TEST_MODE: 'true', NEXT_PUBLIC_PLAYWRIGHT: '1', PLAYWRIGHT: '1' },
      reuseExistingServer: !isCI,
      stdout: 'pipe',
      timeout: 120_000,
      url: webServerUrl ?? baseURL
    },
    workers: 1
  })
}

export { createPlaywrightConfig }
