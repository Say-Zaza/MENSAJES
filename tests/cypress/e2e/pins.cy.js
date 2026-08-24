/// <reference types="cypress" />

describe('Pinned Messages (Fijar)', () => {
function resetPins() {
  return cy.window().then((win) => {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      win.__pinsResetDone = () => { clearTimeout(timeout); resolve(); };
      win.eval(
        "db.doc('rooms/general').set({ pinnedMessages: [] }, { merge: true })" +
        ".then(() => window.__pinsResetDone && window.__pinsResetDone(), () => window.__pinsResetDone && window.__pinsResetDone());"
      );
    });
  });
}

before(() => {
  cy.visit('/');
  cy.waitForReady();
  resetPins();
});

beforeEach(() => {
  cy.visit('/');
  cy.waitForReady('user1');
  resetPins();
  cy.reload();
  cy.waitForReady('user1');
});

  it('pins a message: shows bar with preview and pin icon on bubble', () => {
    const msg = `Pin test ${Date.now()}`;
    cy.sendMessage(msg);
    cy.waitForMessage(msg);

    cy.openContextMenu(msg);
    cy.get('#active-context-menu').contains('Fijar').click();

    cy.get('#pinned-banner', { timeout: 15000 }).should('not.have.class', 'hidden');
    cy.get('#pinned-preview').should('contain', msg);
    cy.contains('.message-wrapper', msg).find('.msg-pin').should('exist');
    cy.get('#pinned-counter').should('have.class', 'hidden'); // solo 1 → sin contador
  });

  it('navigates between multiple pins with counter 2/2', () => {
    const m1 = `Pin A ${Date.now()}`;
    const m2 = `Pin B ${Date.now()}`;
    cy.sendMessage(m1); cy.waitForMessage(m1);
    cy.sendMessage(m2); cy.waitForMessage(m2);

    cy.openContextMenu(m1);
    cy.get('#active-context-menu').contains('Fijar').click();
    cy.get('#pinned-banner', { timeout: 15000 }).should('not.have.class', 'hidden');

    cy.openContextMenu(m2);
    cy.get('#active-context-menu').contains('Fijar').click();

    cy.get('#pinned-counter', { timeout: 15000 }).should('be.visible').and('contain', '/2');
    cy.get('#pinned-preview').should('contain', m1);
    cy.get('#pinned-next-btn').click();
    cy.get('#pinned-counter').should('contain', '2/2');
    cy.get('#pinned-preview').should('contain', m2);
    cy.get('#pinned-prev-btn').click();
    cy.get('#pinned-preview').should('contain', m1);
  });

  it('scrolls to original message and highlights it when tapping the bar', () => {
    const msg = `Pin scroll ${Date.now()}`;
    for (let i = 0; i < 12; i++) {
      cy.sendMessage(`filler ${i} ${Date.now()}`);
    }
    cy.sendMessage(msg);
    cy.waitForMessage(msg);

    cy.openContextMenu(msg);
    cy.get('#active-context-menu').contains('Fijar').click();
    cy.get('#pinned-banner', { timeout: 15000 }).should('not.have.class', 'hidden');

    // Scroll al inicio para que "ir al fijado" tenga efecto visible
    cy.get('#messages-container').scrollTo('top', { duration: 200 });
    cy.get('#pinned-main').click();
    // El highlight se agrega sincrónicamente y dura 2s: verificar sin retry
    cy.contains('.message-wrapper', msg, { timeout: 10000 }).then($w => {
      expect($w).to.have.class('highlight-flash');
    });
    // El scroll suave tarda: verificar llegada al mensaje CON reintento
    cy.contains('.message-wrapper', msg, { timeout: 10000 }).should($w => {
      const rect = $w[0].getBoundingClientRect();
      expect(rect.top).to.be.greaterThan(-80);
      expect(rect.bottom).to.be.lessThan(Cypress.config('viewportHeight') + 80);
    });
  });

  it('unpins from the context menu (Desfijar) and from the bar button', () => {
    const msg = `Pin unpin ${Date.now()}`;
    cy.sendMessage(msg);
    cy.waitForMessage(msg);

    cy.openContextMenu(msg);
    cy.get('#active-context-menu').contains('Fijar').click();
    cy.get('#pinned-banner', { timeout: 15000 }).should('not.have.class', 'hidden');

    // Menú ahora muestra Desfijar
    cy.openContextMenu(msg);
    cy.get('#active-context-menu').contains('Desfijar').click();
    cy.get('#pinned-banner', { timeout: 15000 }).should('have.class', 'hidden');
    cy.contains('.message-wrapper', msg).find('.msg-pin').should('not.exist');

    // Re-fijar y desfijar desde el botón de la barra
    cy.openContextMenu(msg);
    cy.get('#active-context-menu').contains('Fijar').click();
    cy.get('#pinned-banner', { timeout: 15000 }).should('not.have.class', 'hidden');
    cy.get('#pinned-unpin-btn').click();
    cy.get('#pinned-banner', { timeout: 15000 }).should('have.class', 'hidden');
  });

  it('enforces max 3 pins with clear warning', () => {
    const ids = [];
    for (let i = 0; i < 4; i++) {
      const m = `Pin limit ${i} ${Date.now()}`;
      ids.push(m);
      cy.sendMessage(m);
      cy.waitForMessage(m);
    }
    ids.forEach((m) => {
      cy.openContextMenu(m);
      cy.get('#active-context-menu').contains(/^Fijar$/).click();
      cy.wait(800);
    });
    cy.get('.error-toast', { timeout: 15000 }).should('contain', 'desfijá uno');
    cy.window().then((win) => {
      return win.db.doc('rooms/general').get().then((doc) => {
        const pins = doc.data().pinnedMessages || [];
        expect(pins.length).to.equal(3);
      });
    });
  });

  it('persists pins across page reload', () => {
    const msg = `Pin reload ${Date.now()}`;
    cy.sendMessage(msg);
    cy.waitForMessage(msg);

    cy.openContextMenu(msg);
    cy.get('#active-context-menu').contains('Fijar').click();
    cy.get('#pinned-banner', { timeout: 15000 }).should('not.have.class', 'hidden');

    cy.reload();
    cy.waitForReady('user1');
    cy.get('#pinned-banner', { timeout: 20000 }).should('not.have.class', 'hidden');
    cy.get('#pinned-preview').should('contain', msg);
  });

  it('auto-unpins when the pinned message is deleted', () => {
    const msg = `Pin delete ${Date.now()}`;
    cy.sendMessage(msg);
    cy.waitForMessage(msg);

    cy.openContextMenu(msg);
    cy.get('#active-context-menu').contains('Fijar').click();
    cy.get('#pinned-banner', { timeout: 15000 }).should('not.have.class', 'hidden');

    // Eliminar el mensaje directamente en Firestore (simula usuario o purga)
    cy.window().then((win) => {
      return win.db.collection('rooms/general/messages')
        .where('texto', '==', msg)
        .limit(1)
        .get()
        .then((snap) => {
          const docu = snap.docs[0];
          return win.db.collection('rooms/general/messages').doc(docu.id).delete();
        });
    });

    cy.get('#pinned-banner', { timeout: 20000 }).should('have.class', 'hidden');
    cy.window().then((win) => {
      return win.db.doc('rooms/general').get().then((doc) => {
        const pins = doc.data().pinnedMessages || [];
        expect(pins.length).to.equal(0);
      });
    });
  });

  it('syncs in real time: partner pins appear without reload', () => {
    const msg = `Pin sync ${Date.now()}`;
    cy.sendMessage(msg);
    cy.waitForMessage(msg);

    // user2 fija vía Firestore directo (simula otro dispositivo)
    cy.window().then((win) => {
      return win.db.collection('rooms/general/messages')
        .where('texto', '==', msg)
        .limit(1)
        .get()
        .then((snap) => {
          const mid = snap.docs[0].id;
          const pinData = JSON.stringify({
            id: mid,
            texto: msg,
            autor: 'Mi Amor',
            pinnedAt: Date.now(),
            pinnedByUid: 'partner-uid',
            pinnedByName: 'Mi Amor',
            hasImage: false,
            hasAudio: false
          });
          win.eval(`db.doc('rooms/general').set({ pinnedMessages: [${pinData}] }, { merge: true })`);
        });
    });

    // Sin recargar: aparece barra + ícono en burbuja
    cy.get('#pinned-banner', { timeout: 15000 }).should('not.have.class', 'hidden');
    cy.get('#pinned-preview').should('contain', msg);
    cy.contains('.message-wrapper', msg).find('.msg-pin').should('exist');
  });
});
