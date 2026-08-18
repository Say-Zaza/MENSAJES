// Cypress E2E Support File

// Global beforeEach
beforeEach(() => {
  // Clear localStorage before each test
  cy.clearLocalStorage();
  cy.clearCookies();
});

// Custom commands
Cypress.Commands.add('setUsername', (name) => {
  cy.get('#username-input').type(name);
  cy.get('#username-submit').click();
  cy.get('#welcome-modal').should('have.class', 'hidden');
});

Cypress.Commands.add('sendMessage', (text) => {
  cy.get('#message-input').type(text);
  cy.get('#chat-form').submit();
  cy.get('#message-input').should('have.value', '');
});

Cypress.Commands.add('waitForMessage', (text) => {
  cy.contains('.message-bubble', text, { timeout: 10000 }).should('be.visible');
});

Cypress.Commands.add('swipeReply', (messageText, direction = 'right') => {
  // Mobile swipe simulation
  cy.contains('.message-bubble', messageText).then($el => {
    const rect = $el[0].getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const deltaX = direction === 'right' ? 100 : -100;
    
    cy.wrap($el).trigger('touchstart', { touches: [{ clientX: startX, clientY: startY }] });
    cy.wrap($el).trigger('touchmove', { touches: [{ clientX: startX + deltaX, clientY: startY }] });
    cy.wrap($el).trigger('touchend');
  });
});

Cypress.Commands.add('longPressReaction', (messageText) => {
  cy.contains('.message-bubble', messageText).then($el => {
    const rect = $el[0].getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    cy.wrap($el).trigger('touchstart', { touches: [{ clientX: x, clientY: y }] });
    cy.wait(600);
    cy.wrap($el).trigger('touchend');
  });
});

// Export for TypeScript
export {};