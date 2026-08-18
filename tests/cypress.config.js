import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'https://mensajes-31f68.web.app',
    viewportWidth: 375,
    viewportHeight: 667,
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    specPattern: 'cypress/e2e/**/*.cy.{js,ts}',
    setupNodeEvents(on, config) {
      // implement node event listeners here
    }
  },
  component: {
    devServer: {
      framework: 'create-react-app',
      bundler: 'webpack'
    }
  }
});