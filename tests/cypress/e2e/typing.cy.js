/// <reference types="cypress" />

const FIREBASE_API_KEY = 'AIzaSyALVjHZtbEJGAx2pswt4l4h654ieGJw_tk';
const FIREBASE_PROJECT_ID = 'mensajes-31f68';
const ROOM_ID = 'general';
const TYPING_DOC_PATH = `rooms/${ROOM_ID}/typing`;

describe('Typing Indicator', () => {
  before(() => {
    cy.visit('/');
    cy.waitForReady();
    cy.window().then((win) => {
      win.eval(`db.collection('rooms/general/typing').get().then(s => {
        const b = db.batch();
        s.docs.forEach(d => b.delete(d.ref));
        return b.commit();
      }).catch(() => {})`);
    });
  });

  let partnerToken;
  let partnerUid;

  beforeEach(() => {
    cy.visit('/');
    cy.waitForReady();
    cy.getPartnerToken().then(({ uid, token }) => {
      partnerUid = uid;
      partnerToken = token;
    });
  });

  afterEach(() => {
    if (partnerToken) {
      cy.request({
        method: 'DELETE',
        url: `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${TYPING_DOC_PATH}/${partnerUid}`,
        headers: { Authorization: `Bearer ${partnerToken}` },
        failOnStatusCode: false
      });
    }
  });

it('shows partner typing indicator', () => {
    cy.window().then((win) => {
      return win.db.collection(TYPING_DOC_PATH).doc(partnerUid).set({
        uid: partnerUid,
        username: 'Mi Amor',
        isTyping: true,
        updatedAt: new Date().toISOString()
      });
    });

    cy.get('#typing-indicator').should('not.have.class', 'hidden');
    cy.get('#typing-indicator').should('contain', 'Mi Amor estǭ escribiendo');
  });

    cy.get('#typing-indicator').should('not.have.class', 'hidden');
    cy.get('#typing-indicator').should('contain', 'Mi Amor está escribiendo');
  });

  it('auto-hides partner typing indicator after 4 seconds', () => {
    cy.request({
      method: 'POST',
      url: `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${TYPING_DOC_PATH}?documentId=${partnerUid}`,
      headers: {
        Authorization: `Bearer ${partnerToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        fields: {
          uid: { stringValue: partnerUid },
          username: { stringValue: 'Mi Amor' },
          isTyping: { booleanValue: true },
          updatedAt: { timestampValue: new Date().toISOString() }
        }
      }
    });

    cy.get('#typing-indicator').should('not.have.class', 'hidden');

    cy.get('#typing-indicator', { timeout: 6000 }).should('have.class', 'hidden');
  });

  it('clears typing indicator when partner stops typing', () => {
    cy.request({
      method: 'POST',
      url: `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${TYPING_DOC_PATH}?documentId=${partnerUid}`,
      headers: {
        Authorization: `Bearer ${partnerToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        fields: {
          uid: { stringValue: partnerUid },
          username: { stringValue: 'Mi Amor' },
          isTyping: { booleanValue: true }
        }
      }
    });

    cy.get('#typing-indicator').should('not.have.class', 'hidden');

    cy.request({
      method: 'PATCH',
      url: `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${TYPING_DOC_PATH}/${partnerUid}?updateMask.fieldPaths=isTyping`,
      headers: {
        Authorization: `Bearer ${partnerToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        fields: {
          isTyping: { booleanValue: false }
        }
      },
      failOnStatusCode: false
    });

    cy.get('#typing-indicator', { timeout: 6000 }).should('have.class', 'hidden');
  });
});