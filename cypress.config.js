const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',
    viewportWidth: 375,
    viewportHeight: 667,
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 15000,
    numTestsKeptInMemory: 0,
    pageLoadTimeout: 30000,
    fixturesFolder: 'tests/cypress/fixtures',
    specPattern: 'tests/cypress/e2e/**/*.cy.js',
    supportFile: 'tests/cypress/support/e2e.js',
    setupNodeEvents(on, config) {
      return config;
    }
  }
});
