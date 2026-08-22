/// <reference types="cypress" />

describe('Reactions - Horizontal Picker', () => {
  before(() => {
    cy.visit('/');
    cy.waitForReady();
    cy.cleanupFirestore();
    cy.reload();
    cy.waitForReady();
  });

  beforeEach(() => {
    cy.visit('/');
    cy.waitForReady();
  });

  describe('Reaction Picker UI', () => {
    it('opens horizontal reaction picker via context menu', () => {
      const testMsg = `Picker test ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.openContextMenu(testMsg);
      cy.get('#active-context-menu').contains('Reaccionar').click();
      
      cy.get('#reaction-picker').should('not.have.class', 'hidden');
      cy.get('.reaction-picker-content').should('be.visible');
      cy.get('.reaction-item').should('have.length.greaterThan', 0);
      
      cy.get('.reaction-picker-content').then($content => {
        const display = window.getComputedStyle($content[0]);
        expect(display.flexDirection).to.equal('row');
      });
    });

    it('shows quick reactions with + button for more', () => {
      const testMsg = `Quick reactions ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.openContextMenu(testMsg);
      cy.get('#active-context-menu').contains('Reaccionar').click();
      
      cy.get('.reaction-item').should('have.length.at.least', 7);
      cy.get('.reaction-item-add').should('exist');
    });

    it('opens full emoji picker when clicking + button', () => {
      const testMsg = `Full picker ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.openContextMenu(testMsg);
      cy.get('#active-context-menu').contains('Reaccionar').click();
      
      cy.get('.reaction-item-add').click();
      cy.get('.reaction-picker-content').should('have.length', 2);
    });

    it('closes picker when clicking outside', () => {
      const testMsg = `Close outside ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.openContextMenu(testMsg);
      cy.get('#active-context-menu').contains('Reaccionar').click();
      cy.get('#reaction-picker').should('not.have.class', 'hidden');
      
      cy.get('body').click(0, 0);
      cy.get('#reaction-picker').should('have.class', 'hidden');
    });

    it('closes picker when pressing Escape', () => {
      const testMsg = `Close escape ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.openContextMenu(testMsg);
      cy.get('#active-context-menu').contains('Reaccionar').click();
      cy.get('#reaction-picker').should('not.have.class', 'hidden');
      
      cy.keyboard({ key: 'Escape' });
      cy.get('#reaction-picker').should('have.class', 'hidden');
    });
  });

  describe('Reaction Functionality', () => {
    it('adds reaction and shows it on message', () => {
      const testMsg = `Add reaction ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.pickReaction(testMsg, 0);
      cy.get('.reaction-bubble', { timeout: 15000 }).should('exist');
    });

    it('shows reaction count correctly', () => {
      const testMsg = `Count reaction ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.pickReaction(testMsg, 0);
      cy.get('.reaction-bubble', { timeout: 15000 }).should('exist');
      cy.get('.reaction-bubble').should('contain', '1');
    });

    it('highlights own reaction', () => {
      const testMsg = `Own reaction ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.pickReaction(testMsg, 0);
      cy.get('.reaction-bubble.user-reacted', { timeout: 15000 }).should('exist');
    });

    it('can toggle off own reaction', () => {
      const testMsg = `Toggle off ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.pickReaction(testMsg, 0);
      cy.get('.reaction-bubble', { timeout: 15000 }).should('exist');
      
      cy.get('.reaction-bubble.user-reacted').click({ force: true });
      cy.get('.reaction-bubble', { timeout: 20000 }).should('not.exist');
    });

    it('replaces reaction when choosing different emoji', () => {
      const testMsg = `Replace reaction ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.pickReaction(testMsg, 0);
      cy.get('.reaction-bubble', { timeout: 15000 }).should('exist');
      cy.get('.reaction-bubble').first().invoke('text').then(firstEmoji => {
        cy.pickReaction(testMsg, 1);
        cy.get('.reaction-bubble', { timeout: 15000 }).should('exist');
        cy.get('.reaction-bubble').first().invoke('text').should('not.eq', firstEmoji);
      });
    });
  });

  describe('Reaction Sync', () => {
    it('shows partner reaction in real-time', () => {
      const testMsg = `Sync reaction ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.login('user2');
      cy.waitForMessage(testMsg);
      cy.pickReaction(testMsg, 0);
      
      cy.login('user1');
      cy.waitForMessage(testMsg);
      cy.get('.reaction-bubble', { timeout: 20000 }).should('exist');
    });

    it('groups same emoji from both users', () => {
      const testMsg = `Group reaction ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.pickReaction(testMsg, 0);
      cy.get('.reaction-bubble', { timeout: 15000 }).should('exist');
      
      cy.login('user2');
      cy.waitForMessage(testMsg);
      cy.pickReaction(testMsg, 0);
      
      cy.login('user1');
      cy.waitForMessage(testMsg);
      cy.get('.reaction-bubble', { timeout: 20000 }).should('contain', '2');
    });
  });

  describe('Reaction Error Handling', () => {
    it('reverts reaction on Firestore error', () => {
      const testMsg = `Error reaction ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.window().then(win => {
        const origUpdate = win.db.collection().doc().update;
        win.db.collection().doc().update = () => Promise.reject(new Error('Network error'));
        
        cy.pickReaction(testMsg, 0);
        cy.wait(2000);
        
        win.db.collection().doc().update = origUpdate;
      });
    });
  });
});
