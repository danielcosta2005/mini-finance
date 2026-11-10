import { defineConfig, devices } from '@playwright/test';
import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const backendPort = port.parse(process.env.E2E_BACKEND_PORT ?? 3001);
const frontendPort = port.parse(process.env.E2E_FRONTEND_PORT ?? 5174);
const backendUrl = `http://127.0.0.1:${backendPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  'postgresql://test_user:test-only-placeholder@127.0.0.1:55433/minifinance_test';
if (
  !URL.canParse(databaseUrl) ||
  new URL(databaseUrl).pathname !== '/minifinance_test'
) {
  throw new Error('E2E_DATABASE_URL must target minifinance_test');
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: frontendUrl, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../backend',
      url: `${backendUrl}/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(backendPort),
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
      },
      timeout: 60_000,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort}`,
      url: frontendUrl,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: backendUrl },
      timeout: 60_000,
    },
  ],
});
