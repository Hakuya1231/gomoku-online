const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  // 联机用例依赖线上 RTDB，允许在 CI 中少量重试以对抗偶发网络抖动
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
  },
  webServer: {
    command: 'npm start',
    port: 8080,
    reuseExistingServer: true,
    timeout: 30000,
  },
});