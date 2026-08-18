/// <reference types="cypress" />

describe('Chat App - Critical Flows', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  describe('First Visit - Username Modal', () => {
    it('shows username modal on first visit', () => {
      cy.get('#welcome-modal').should('be.visible');
      cy.get('#username-input').should('be.focused');
    });

    it('validates username input (max 20 chars)', () => {
      cy.get('#username-input').type('a'.repeat(21));
      cy.get('#username-submit').should('be.disabled');
      
      cy.get('#username-input').clear().type('Valid Name');
      cy.get('#username-submit').should('not.be.disabled');
    });

    it('enters chat with valid username', () => {
      cy.setUsername('TestUser');
      cy.get('#user-badge').should('contain', 'Tú: TestUser');
      cy.get('#message-input').should('not.be.disabled');
    });
  });

  describe('Messaging', () => {
    beforeEach(() => {
      cy.setUsername('TestUser');
    });

    it('sends and receives text message', () => {
      cy.sendMessage('Hola mundo');
      cy.waitForMessage('Hola mundo');
      cy.contains('.message-wrapper.self .message-bubble', 'Hola mundo').should('exist');
    });

    it('shows reply preview when replying', () => {
      cy.sendMessage('Mensaje original');
      cy.waitForMessage('Mensaje original');
      
      // Right-click to reply (desktop)
      cy.contains('.message-bubble', 'Mensaje original')
        .rightclick()
        .contains('Responder')
        .click();
      
      cy.get('.reply-preview').should('be.visible');
      cy.get('.reply-preview').should('contain', 'Mensaje original');
    });

    it('sends reply message', () => {
      cy.sendMessage('Mensaje original');
      cy.waitForMessage('Mensaje original');
      
      cy.contains('.message-bubble', 'Mensaje original')
        .rightclick()
        .contains('Responder')
        .click();
      
      cy.sendMessage('Esto es una respuesta');
      cy.waitForMessage('Esto es una respuesta');
      cy.contains('.message-reply', 'Mensaje original').should('exist');
    });
  });

  describe('Reactions', () => {
    beforeEach(() => {
      cy.setUsername('TestUser');
    });

    it('opens reaction picker on right-click', () => {
      cy.sendMessage('Mensaje para reaccionar');
      cy.waitForMessage('Mensaje para reaccionar');
      
      cy.contains('.message-bubble', 'Mensaje para reaccionar')
        .rightclick()
        .contains('Reacciones')
        .click();
      
      cy.get('#reaction-picker').should('be.visible');
      cy.get('.reaction-item').should('have.length.greaterThan', 0);
    });

    it('adds reaction via picker', () => {
      cy.sendMessage('Mensaje para reaccionar');
      cy.waitForMessage('Mensaje para reaccionar');
      
      cy.contains('.message-bubble', 'Mensaje para reaccionar')
        .rightclick()
        .contains('Reacciones')
        .click();
      
      cy.get('.reaction-item').first().click();
      cy.get('#reaction-picker').should('have.class', 'hidden');
      
      // Reaction should appear on message
      cy.contains('.reaction-bubble').should('exist');
    });
  });

  describe('Images', () => {
    beforeEach(() => {
      cy.setUsername('TestUser');
    });

    it('uploads image via file input', () => {
      // Create a small test image
      const testImage = Cypress.Blob.dataURLToBlob('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
      
      cy.get('#image-input').attachFile({
        fileContent: testImage,
        fileName: 'test.png',
        mimeType: 'image/png'
      });
      
      cy.waitForMessage('📷 Imagen');
      cy.get('.message-image').should('exist');
    });
  });

  describe('Offline Queue', () => {
    beforeEach(() => {
      cy.setUsername('TestUser');
    });

    it('shows pending indicator when offline', () => {
      cy.window().then(win => {
        win.dispatchEvent(new Event('offline'));
      });
      
      cy.get('#pending-indicator').should('be.visible');
    });

    it('queues message when offline', () => {
      cy.window().then(win => {
        win.dispatchEvent(new Event('offline'));
      });
      
      cy.sendMessage('Mensaje offline');
      cy.get('#pending-indicator').should('contain', '1 pendiente');
    });
  });

  describe('Typing Indicator', () => {
    beforeEach(() => {
      cy.setUsername('TestUser');
    });

    it('shows typing indicator when user types', () => {
      cy.get('#message-input').type('Escribiendo...');
      cy.get('#typing-indicator').should('be.visible');
      cy.get('#typing-indicator').should('contain', 'TestUser está escribiendo');
    });

    it('hides typing indicator after stopping', () => {
      cy.get('#message-input').type('Escribiendo...');
      cy.get('#typing-indicator').should('be.visible');
      
      cy.wait(1000);
      cy.get('#typing-indicator').should('have.class', 'hidden');
    });
  });

  describe('Change Username', () => {
    beforeEach(() => {
      cy.setUsername('OriginalName');
    });

    it('allows changing username', () => {
      cy.get('#change-name-btn').click();
      cy.get('#welcome-modal').should('be.visible');
      cy.get('#username-input').should('have.value', 'OriginalName');
      
      cy.get('#username-input').clear().type('NewName');
      cy.get('#username-submit').click();
      
      cy.get('#user-badge').should('contain', 'Tú: NewName');
    });
  });

  describe('Persistence', () => {
    it('remembers username after reload', () => {
      cy.setUsername('PersistentUser');
      cy.reload();
      cy.get('#user-badge').should('contain', 'Tú: PersistentUser');
      cy.get('#welcome-modal').should('have.class', 'hidden');
    });
  });
});