// Playwright config — serve public/ e roda o fluxo crítico (A6.6)
module.exports = {
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'node tests/static-server.cjs',
    port: 4173,
    reuseExistingServer: true,
    timeout: 10000,
  },
};
