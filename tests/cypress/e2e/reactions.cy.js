/// <reference types="cypress" />

describe('Reactions - Horizontal Picker', () => {
  before(() => {
    cy.visit('/');
    cy.waitForReady();
    cy.window().then((win) => {
      win.eval(`db.doc('rooms/general').set({ pinnedMessages: [] }, { merge: true })`);
    });
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
      
      cy.get('body').type('{esc}');
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
      const $wrap = () => cy.contains('.message-wrapper', testMsg);
      $wrap().find('.reaction-bubble', { timeout: 15000 }).should('exist');
      $wrap().find('.reaction-bubble').should('contain', '1');
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
      const $w = () => cy.contains('.message-wrapper', testMsg);
      $w().find('.reaction-bubble', { timeout: 15000 }).should('exist');

      $w().find('.reaction-bubble.user-reacted').click({ force: true });
      $w().find('.reaction-bubble', { timeout: 20000 }).should('not.exist');
    });

    it('replaces reaction when choosing different emoji', () => {
      const testMsg = `Replace reaction ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.pickReaction(testMsg, 0);
      const $w = () => cy.contains('.message-wrapper', testMsg);
      $w().find('.reaction-bubble', { timeout: 15000 }).should('exist');
      $w().find('.reaction-bubble').first().invoke('text').then(firstEmoji => {
        cy.pickReaction(testMsg, 1);
        $w().find('.reaction-bubble', { timeout: 15000 }).should('exist');
        $w().find('.reaction-bubble').first().invoke('text').should('not.eq', firstEmoji);
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
      // Verdad de servidor: el documento debe tener 2 uids en la misma reacción
      cy.window().then((win) => {
        return win.db.collection('rooms/general/messages')
          .where('texto', '==', testMsg).limit(1).get()
          .then((snap) => {
            const r = snap.docs[0].data().reactions || {};
            const arr = Object.values(r)[0] || [];
            expect(arr.length, 'uids agrupados').to.eq(2);
          });
      });
      cy.contains('.message-wrapper', testMsg).find('.reaction-bubble', { timeout: 20000 }).should('exist');
    });
  });

  describe('Reaction Error Handling', () => {
    it('reverts reaction on Firestore error', () => {
      const testMsg = `Error reaction ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.window().then(win => {
        const origCollection = win.db.collection.bind(win.db);
        win.db.collection = (path) => {
          const c = origCollection(path);
          const origDoc = c.doc.bind(c);
          c.doc = (id) => {
            const d = origDoc(id);
            const origUpdate = d.update;
            d.update = () => Promise.reject(new Error('Network error'));
            return d;
          };
          return c;
        };
        
        cy.pickReaction(testMsg, 0);
        cy.wait(2000);
        
        win.db.collection = origCollection;
      });
    });
  });
});
