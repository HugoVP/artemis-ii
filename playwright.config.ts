import { defineConfig, devices } from '@playwright/test';

// Acceptance tests run against the static build (`npm run test` builds first).
export default defineConfig({
  testDir: 'tests',
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4321' },
  webServer: {
    command: 'node scripts/serve-dist.ts',
    url: 'http://127.0.0.1:4321/es/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
