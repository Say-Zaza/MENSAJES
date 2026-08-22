/// <reference types="cypress" />

Cypress.Commands.add('cleanupFirestore', { prevSubject: false }, () => {
  return cy.window().then(async (win) => {
    if (win.db) {
      const roomId = 'general';
      const col = win.db.collection(`rooms/${roomId}/messages`);
      const snap = await col.get();
      const batch = win.db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      if (snap.docs.length > 0) await batch.commit();

      const typingCol = win.db.collection(`rooms/${roomId}/typing`);
      const typingSnap = await typingCol.get();
      const typingBatch = win.db.batch();
      typingSnap.docs.forEach((doc) => typingBatch.delete(doc.ref));
      if (typingSnap.docs.length > 0) await typingBatch.commit();

      const usersCol = win.db.collection(`rooms/${roomId}/users`);
      const usersSnap = await usersCol.get();
      const usersBatch = win.db.batch();
      usersSnap.docs.forEach((doc) => usersBatch.delete(doc.ref));
      if (usersSnap.docs.length > 0) await usersBatch.commit();

      await win.db.doc(`rooms/${roomId}`).set({ pinnedMessage: null }, { merge: true });
    }
    if (win.state && win.state.socket) {
      win.state.socket.emit('cleanupRoom', 'general');
    }
    // Also clean local history via HTTP endpoint
    try {
      await fetch('/api/cleanup-db');
    } catch (e) {
      // Server might not be running, ignore
    }
  });
});

Cypress.Commands.add('login', (key = 'user1') => {
  cy.readFile('sync-config.json').then((cfg) => {
    const email = key === 'user1' ? cfg.user1Email : cfg.user2Email;
    const password = key === 'user1' ? cfg.user1Password : cfg.user2Password;
    cy.window().then((win) => {
      return win.auth.signInWithEmailAndPassword(email, password);
    });
  });
});

Cypress.Commands.add('waitForReady', (key = 'user1') => {
  cy.login(key);
  cy.get('#user-badge', { timeout: 20000 }).should('not.contain', 'Desconectado');
  cy.get('#message-input').should('not.be.disabled');
  cy.get('#send-btn').should('not.be.disabled');
});

beforeEach(() => {
  cy.clearLocalStorage();
  cy.clearCookies();
});

Cypress.on('uncaught:exception', (err, runnable) => {
  if (err.message.includes('userBadge') || err.message.includes('messageInput') || err.message.includes('sendBtn')) {
    return false;
  }
  return true;
});

const FIREBASE_API_KEY = 'AIzaSyALVjHZtbEJGAx2pswt4l4h654ieGJw_tk';
const FIREBASE_PROJECT_ID = 'mensajes-31f68';
const ROOM_ID = 'general';

Cypress.Commands.add('getPartnerToken', () => {
  return cy.request({
    method: 'POST',
    url: `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    body: { returnSecureToken: true }
  }).then(({ body }) => ({ uid: body.localId, token: body.idToken }));
});

Cypress.Commands.add('sendMessage', (text) => {
  cy.get('#message-input').should('not.be.disabled').type(text);
  cy.get('#chat-form').submit();
  cy.get('#message-input').should('have.value', '');
});

Cypress.Commands.add('waitForMessage', (text) => {
  cy.contains('.message-wrapper', text, { timeout: 15000 }).should('exist');
  cy.get('#messages-container').scrollTo('bottom', { duration: 0 });
});

Cypress.Commands.add('openContextMenu', (messageText) => {
  cy.contains('.message-wrapper', messageText).trigger('contextmenu', {
    clientX: 100,
    clientY: 100,
    button: 2
  });
  cy.get('#active-context-menu').should('exist');
});

Cypress.Commands.add('pickReaction', (messageText, emojiIndex = 0) => {
  cy.openContextMenu(messageText);
  cy.get('#active-context-menu').contains('Reaccionar').click();
  cy.get('#reaction-picker').should('not.have.class', 'hidden');
  cy.get('.reaction-item').eq(emojiIndex).click();
  cy.get('#reaction-picker').should('have.class', 'hidden');
});

Cypress.Commands.add('replyToMessage', (messageText, replyText) => {
  cy.openContextMenu(messageText);
  cy.get('#active-context-menu').contains('Responder').click();
  cy.get('#reply-preview').should('not.have.class', 'hidden');
  cy.sendMessage(replyText);
  cy.waitForMessage(replyText);
  cy.get('.message-reply').should('exist');
});