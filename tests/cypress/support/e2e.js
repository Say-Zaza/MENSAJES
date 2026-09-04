/// <reference types="cypress" />

Cypress.Commands.add('cleanupFirestore', { prevSubject: false }, () => {
  return cy.window().then((win) => {
    // Ejecutar DENTRO del reino de la página: evita wrappers de Cypress en el SDK compat
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, 25000);
      win.__cleanupDone = () => { clearTimeout(timeout); resolve(); };
      win.eval(`(async () => {
        try {
          const roomId = 'general';
          const me = firebase.auth().currentUser;
          const myUid = me ? me.uid : null;

          if (myUid) {
            const snap = await db.collection('rooms/' + roomId + '/messages')
              .where('uid', '==', myUid).get();
            let batch = db.batch();
            let n = 0;
            snap.docs.forEach((d) => { batch.delete(d.ref); n++; });
            if (n > 0) await batch.commit();
          }

          const typingSnap = await db.collection('rooms/' + roomId + '/typing').get();
          if (typingSnap.docs.length > 0) {
            const tb = db.batch();
            typingSnap.docs.forEach((d) => tb.delete(d.ref));
            await tb.commit();
          }

          await db.doc('rooms/' + roomId).set({ pinnedMessages: [] }, { merge: true });
          try { await fetch('/api/cleanup-db'); } catch (e) {}
        } catch (e) {
          console.warn('[cleanupFirestore]', e && e.message);
        }
        if (window.__cleanupDone) window.__cleanupDone();
      })();`);
    });
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

// Cambio de usuario A MITAD de test: espera a que la APP haya sincronizado
// su currentUser interno, no solo Firebase Auth. Sin esto las acciones se
// ejecutan con el usuario anterior (stale) y pisan datos del otro.
Cypress.Commands.add('switchUser', (key = 'user1') => {
  cy.login(key);
  cy.window({ timeout: 20000 }).should((win) => {
    expect(win.currentUser, 'app currentUser').to.not.be.null;
    expect(win.auth.currentUser, 'auth currentUser').to.not.be.null;
    expect(win.currentUser.uid, 'app uid sincronizado').to.eq(win.auth.currentUser.uid);
  });
  cy.get('#message-input', { timeout: 20000 }).should('not.be.disabled');
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
const FIREBASE_PROJECT_ID = 'race-master-3d-ee76f';
const ROOM_ID = 'general';

Cypress.Commands.add('getPartnerToken', () => {
  // UID de la pareja desde users + MI PROPIO token (las rules permiten
  // escribir typing a cualquier cuenta autorizada, sin REST anónimo)
  return cy.window().then((win) => {
    const me = win.auth.currentUser;
    return win.db.collection('rooms/general/users').limit(20).get().then((snap) => {
      let otherId = null;
      snap.docs.forEach((d) => { if (!otherId && d.id !== me.uid) otherId = d.id; });
      return me.getIdToken().then((token) => ({ uid: otherId || 'partner-fallback', token }));
    });
  });
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