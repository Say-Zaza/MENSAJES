/// <reference types="cypress" />

describe('Chat App - Critical Flows', () => {
  before(() => {
    cy.visit('/');
    cy.waitForReady();
    // Reset ligero sin reload (los tests usan textos únicos)
    cy.window().then((win) => {
      win.eval(`db.doc('rooms/general').set({ pinnedMessages: [] }, { merge: true })`);
    });
  });

  beforeEach(() => {
    cy.visit('/');
    cy.waitForReady();
  });

  describe('Login & Authentication', () => {
    function expectUser(key) {
      cy.readFile('sync-config.json').then((cfg) => {
        const expected = key === 'user1' ? cfg.user1Email : cfg.user2Email;
        cy.window({ timeout: 20000 }).should((win) => {
          const u = win.auth && win.auth.currentUser;
          expect(u, 'hay sesión').to.not.be.null;
          expect(u.email).to.eq(expected);
        });
      });
      // El badge muestra el nombre de la PAREJA por diseño
      cy.get('#user-badge', { timeout: 20000 }).should('not.contain', 'Conectando');
    }

    it('shows login screen and logs in with clave as "Tú"', () => {
      cy.window().then((win) => win.auth.signOut());
      cy.get('#login-screen', { timeout: 15000 }).should('not.have.class', 'hidden');
      cy.readFile('sync-config.json').then((cfg) => {
        cy.get('#login-password').type(cfg.user1Password);
        cy.get('#login-form').submit();
      });
      cy.get('#user-badge', { timeout: 20000 }).should('not.contain', 'Conectando');
      expectUser('user1');
      cy.get('#login-screen').should('not.be.visible');
    });

    it('logs in as "Mi Amor"', () => {
      cy.login('user2');
      expectUser('user2');
    });

    it('logs in as "Tú"', () => {
      cy.login('user1');
      expectUser('user1');
    });

    it('settings modal opens and closes', () => {
      cy.get('#settings-btn').click();
      cy.get('#settings-modal').should('be.visible');
      cy.get('#theme-select').should('exist');
      cy.get('#settings-close-btn').click();
      cy.get('#settings-modal').should('not.be.visible');
    });
  });

  describe('Messaging', () => {
    it('sends and receives a text message', () => {
      const testMsg = `Cypress test msg ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);
      cy.get('.message-wrapper.self .message-bubble').should('contain', testMsg);
    });

    it('shows timestamp in message meta', () => {
      const testMsg = `Msg timestamp ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);
      cy.get('.message-meta').should('exist');
    });

    it('renders date separator for today', () => {
      const testMsg = `Msg fecha ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);
      cy.get('.date-separator').should('contain', 'Hoy');
    });

    it('sends multiple messages in sequence', () => {
      const msg1 = `Multi msg 1 ${Date.now()}`;
      const msg2 = `Multi msg 2 ${Date.now()}`;
      cy.sendMessage(msg1);
      cy.waitForMessage(msg1);
      cy.sendMessage(msg2);
      cy.waitForMessage(msg2);
      cy.contains('.message-wrapper', msg1).should('exist');
      cy.contains('.message-wrapper', msg2).should('exist');
    });

    it.skip('does not duplicate messages on reload (idempotency) — TODO: investigar duplicación con historial largo', () => {
      const testMsg = `Idempotency ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.reload();
      cy.waitForReady();

      cy.get('#messages-container').children().should('have.length.greaterThan', 0);
      cy.contains('.message-wrapper', testMsg, { timeout: 30000 }).should('exist');
      cy.get('.message-wrapper').filter(':contains("' + testMsg + '")').should('have.length', 1);
    });
  });

  describe('Reply', () => {
    it('shows reply preview when replying to a message', () => {
      const origMsg = `Reply orig ${Date.now()}`;
      cy.sendMessage(origMsg);
      cy.waitForMessage(origMsg);

      cy.openContextMenu(origMsg);
      cy.get('#active-context-menu').contains('Responder').click();
      cy.get('#reply-preview').should('be.visible');
      cy.get('.reply-preview-author').should('exist');
    });

    it('sends a reply and shows it in the message', () => {
      const origMsg = `Reply orig2 ${Date.now()}`;
      const replyMsg = `Reply body ${Date.now()}`;
      cy.sendMessage(origMsg);
      cy.waitForMessage(origMsg);

      cy.openContextMenu(origMsg);
      cy.get('#active-context-menu').contains('Responder').click();
      cy.get('#reply-preview').should('be.visible');
      cy.sendMessage(replyMsg);
      cy.waitForMessage(replyMsg);
      cy.get('.message-reply').should('exist');
    });

    it('can cancel reply preview', () => {
      const origMsg = `Reply cancel ${Date.now()}`;
      cy.sendMessage(origMsg);
      cy.waitForMessage(origMsg);

      cy.openContextMenu(origMsg);
      cy.get('#active-context-menu').contains('Responder').click();
      cy.get('#reply-preview').should('be.visible');
      cy.get('#reply-preview .reply-preview-close').click();
      cy.get('#reply-preview').should('not.be.visible');
    });
  });

  describe('Reactions', () => {
    it('opens reaction picker via context menu', () => {
      const testMsg = `React msg ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.openContextMenu(testMsg);
      cy.get('#active-context-menu').contains('Reaccionar').click();
      cy.get('#reaction-picker').should('not.have.class', 'hidden');
      cy.get('.reaction-item').should('have.length.greaterThan', 0);
    });

    it('adds a reaction to a message', () => {
      const testMsg = `React add ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.pickReaction(testMsg, 0);
      cy.get('.reaction-bubble', { timeout: 15000 }).should('exist');
    });

    it('can toggle off a reaction', () => {
      const testMsg = `React toggle ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.pickReaction(testMsg, 0);
      cy.get('.reaction-bubble', { timeout: 15000 }).should('exist');

      cy.contains('.message-wrapper', testMsg).then($wrapper => {
        cy.wrap($wrapper).find('.reaction-bubble').should('have.length', 1);
        cy.wrap($wrapper).find('.reaction-bubble').last().click({ force: true });
        cy.wrap($wrapper).find('.reaction-bubble', { timeout: 20000 }).should('have.length', 0);
      });
    });
  });

  describe('Image Upload', () => {
    it('uploads an image and displays it', () => {
       cy.get('#image-input-gallery').selectFile('tests/cypress/fixtures/test-image.png', {
        mimeType: 'image/png',
        force: true
      });

      cy.get('.message-image', { timeout: 15000 }).should('exist');
    });

    it('shows blur placeholder before image loads', () => {
       cy.get('#image-input-gallery').selectFile('tests/cypress/fixtures/test-image.png', {
        mimeType: 'image/png',
        force: true
      });

      cy.get('.message-image-blur', { timeout: 15000 }).should('exist');
    });
  });

  describe('Offline Queue', () => {
    it('shows offline banner when network is lost', () => {
      cy.window().then((win) => {
        win.dispatchEvent(new Event('offline'));
      });
      cy.get('#offline-banner').should('be.visible');
    });

    it('queues message when offline and shows pending count', () => {
      cy.window().then((win) => {
        win.dispatchEvent(new Event('offline'));
      });

      const testMsg = `Offline msg ${Date.now()}`;
      cy.sendMessage(testMsg);

      cy.get('#pending-indicator').should('be.visible');
      cy.get('#pending-indicator').should('contain', '1 pendiente');
    });

    it('clears pending indicator after going back online', () => {
      cy.window().then((win) => {
        win.dispatchEvent(new Event('offline'));
      });

      cy.sendMessage(`Offline flush ${Date.now()}`);
      cy.get('#pending-indicator').should('be.visible');

      cy.window().then((win) => {
        win.dispatchEvent(new Event('online'));
      });

      cy.get('#pending-indicator', { timeout: 15000 }).should('have.class', 'hidden');
    });
  });

  describe('Theme & Appearance', () => {
    it('switches to dark theme', () => {
      cy.get('#settings-btn').click();
      cy.get('#settings-modal').should('be.visible');
      cy.get('#theme-select').select('dark');
      cy.get('body').should('have.class', 'dark-mode');
    });

    it('switches to light theme', () => {
      cy.get('#settings-btn').click();
      cy.get('#theme-select').select('dark');
      cy.get('body').should('have.class', 'dark-mode');
      cy.get('#theme-select').select('light');
      cy.get('body').should('not.have.class', 'dark-mode');
    });

    it('persists theme after reload', () => {
      cy.get('#settings-btn').click();
      cy.get('#theme-select').select('dark');
      cy.get('body').should('have.class', 'dark-mode');
      cy.reload();
      cy.waitForReady();
      cy.get('body').should('have.class', 'dark-mode');
    });
  });

  describe('Search', () => {
    it('filters messages by search query', () => {
      const uniqueMsg = `Searchable ${Date.now()}`;
      cy.sendMessage(uniqueMsg);
      cy.waitForMessage(uniqueMsg);

      cy.get('#search-toggle-btn').click();
      cy.get('#search-bar').should('be.visible');
      cy.get('#search-input').type('Searchable');

      cy.contains('.message-wrapper', uniqueMsg).should('exist');
    });

    it('clears search and shows all messages', () => {
      cy.get('#search-toggle-btn').click();
      cy.get('#search-input').type('test query');
      cy.get('#search-bar').should('be.visible');
      cy.get('#search-close-btn').click();
      cy.get('#search-bar').should('not.be.visible');
    });
  });

  describe('Pinned Messages', () => {
    it('pins a message and shows banner', () => {
      const testMsg = `Pinned msg ${Date.now()}`;
      cy.sendMessage(testMsg);
      cy.waitForMessage(testMsg);

      cy.openContextMenu(testMsg);
      cy.get('#active-context-menu').contains(/^Fijar$/).click();
      cy.get('#pinned-banner', { timeout: 15000 }).should('not.have.class', 'hidden');
      cy.get('#pinned-preview').should('contain', testMsg);
    });
  });

  describe('Persistence', () => {
    it('stays logged in after reload (persistence is LOCAL)', () => {
      cy.waitForReady('user1');
      cy.reload();
      cy.waitForReady('user1');
      // login-screen se oculta por style.display, no por clase
      cy.get('#login-screen').should('not.be.visible');
      cy.get('#message-input').should('not.be.disabled');
    });
  });
});