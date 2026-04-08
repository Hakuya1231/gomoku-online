const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
  },
  webServer: {
    command: 'npm start',
    port: 8080,
    reuseExistingServer: false,
    timeout: 10000,
  },
});