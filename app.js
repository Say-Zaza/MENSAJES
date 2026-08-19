// ============================================
// CONFIGURACIÓN FIREBASE
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyALVjHZtbEJGAx2pswt4l4h654ieGJw_tk",
  authDomain: "mensajes-31f68.firebaseapp.com",
  projectId: "mensajes-31f68",
  storageBucket: "mensajes-31f68.firebasestorage.app",
  messagingSenderId: "832362257221",
  appId: "1:832362257221:web:7a0115d52319375c743c2c"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  console.log('Persistencia offline:', err.code);
});

const ROOM_ID = 'general';
const MESSAGES_COLLECTION = `rooms/${ROOM_ID}/messages`;
const USERS_COLLECTION = `rooms/${ROOM_ID}/users`;
const PINNED_DOC = `rooms/${ROOM_ID}`;

// ============================================
// ELEMENTOS DOM
// ============================================
const messagesContainer = document.getElementById('messages-container');
const welcomeMessage = document.getElementById('welcome-message');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const imageBtn = document.getElementById('image-btn');
const imageInput = document.getElementById('image-input');
const userBadge = document.getElementById('user-badge');
const voiceBtn = document.getElementById('voice-btn');
const voiceIndicator = document.getElementById('voice-recording-indicator');
const voiceRecTime = document.getElementById('voice-rec-time');
const pinnedBtn = document.getElementById('pinned-btn');
const pinnedBanner = document.getElementById('pinned-banner');
const pinnedText = document.getElementById('pinned-text');
const pinnedCloseBtn = document.getElementById('pinned-close-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const editModal = document.getElementById('edit-modal');
const editInput = document.getElementById('edit-input');
const editCancelBtn = document.getElementById('edit-cancel-btn');
const editSaveBtn = document.getElementById('edit-save-btn');

let isFirstMessage = true;
let currentUser = null;
let username = null;
let unsubscribe = null;
let pinnedUnsubscribe = null;
let editingMessageId = null;

// ============================================
// HELPERS LOCALSTORAGE
// ============================================
function safeGetLocalStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetLocalStorage(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

// ============================================
// COLA OFFLINE
// ============================================
const OFFLINE_QUEUE_KEY = 'chat_offline_queue';
let isOnline = navigator.onLine;

function getOfflineQueue() {
  try { const d = localStorage.getItem(OFFLINE_QUEUE_KEY); return d ? JSON.parse(d) : []; } catch { return []; }
}
function saveOfflineQueue(queue) {
  try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue)); } catch {}
}
function addToOfflineQueue(data) {
  const q = getOfflineQueue();
  q.push({ ...data, queuedAt: Date.now(), tempId: 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2,9) });
  saveOfflineQueue(q);
  updatePendingIndicator();
}
function updatePendingIndicator() {
  const q = getOfflineQueue();
  const indicator = document.getElementById('pending-indicator');
  if (!indicator) return;
  if (q.length > 0) {
    indicator.textContent = `${q.length} pendiente${q.length > 1 ? 's' : ''}`;
    indicator.classList.remove('hidden');
  } else {
    indicator.classList.add('hidden');
  }
}
async function flushOfflineQueue() {
  if (!isOnline || !currentUser) return;
  const queue = getOfflineQueue();
  if (!queue.length) return;
  const remaining = [];
  for (const item of queue) {
    try { await db.collection(MESSAGES_COLLECTION).add(item); }
    catch { remaining.push(item); }
  }
  saveOfflineQueue(remaining);
  updatePendingIndicator();
}
window.addEventListener('online', () => { isOnline = true; flushOfflineQueue(); });
window.addEventListener('offline', () => { isOnline = false; updatePendingIndicator(); });
updatePendingIndicator();

// ============================================
// ERROR TOAST
// ============================================
function showError(message, isRetryable = false, onRetry = null) {
  const el = document.createElement('div');
  el.className = 'error-toast';
  el.innerHTML = `<span class="error-icon">⚠️</span><span class="error-message">${escapeHtml(message)}</span>${isRetryable && onRetry ? '<button class="error-retry">Reintentar</button>' : ''}`;
  if (onRetry) el.querySelector('.error-retry').addEventListener('click', () => { el.remove(); onRetry(); });
  document.body.appendChild(el);
  if (!isRetryable) setTimeout(() => el.remove(), 5000);
}

// ============================================
// TYPING INDICATOR
// ============================================
const TYPING_COLLECTION = `rooms/${ROOM_ID}/typing`;
let typingUnsubscribe = null;
let typingTimeout = null;

function startTypingListener() {
  if (typingUnsubscribe) typingUnsubscribe();
  typingUnsubscribe = db.collection(TYPING_COLLECTION).onSnapshot((snap) => {
    snap.docChanges().forEach((change) => {
      const d = change.doc.data();
      if (d.uid === currentUser?.uid) return;
      const el = document.getElementById('typing-indicator');
      if (!el) return;
      if ((change.type === 'added' || change.type === 'modified') && d.isTyping) {
        el.innerHTML = `<span>${escapeHtml(d.username)} está escribiendo</span><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>`;
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
        el.innerHTML = '';
      }
    });
  });
}

function setTypingStatus(isTyping) {
  if (!currentUser || !username) return;
  const ref = db.collection(TYPING_COLLECTION).doc(currentUser.uid);
  if (isTyping) {
    ref.set({ uid: currentUser.uid, username, isTyping: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    setTimeout(() => ref.update({ isTyping: false }).catch(()=>{}), 3000);
  } else {
    ref.update({ isTyping: false }).catch(()=>{});
  }
}

function handleTypingInput() {
  if (!currentUser) return;
  setTypingStatus(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => setTypingStatus(false), 800);
}

// ============================================
// USUARIOS FIJOS (PAREJA)
// ============================================
const FIXED_USERS = [
  { key: 'user1', name: 'Tú', color: '#2563eb', avatar: '💙' },
  { key: 'user2', name: 'Mi Amor', color: '#ec4899', avatar: '💗' }
];

function getAssignedUser() {
  return safeGetLocalStorage('assigned_user') || 'user1';
}
function getUserConfig() {
  return FIXED_USERS.find(u => u.key === getAssignedUser()) || FIXED_USERS[0];
}

function initializeUser() {
  const cfg = getUserConfig();
  username = cfg.name;
  safeSetLocalStorage('chat_username', username);
  userBadge.textContent = `${cfg.avatar} ${cfg.name}`;

  // Resaltar el botón activo en ajustes
  document.querySelectorAll('.btn-user-switch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.key === cfg.key);
  });

  messageInput.disabled = false;
  sendBtn.disabled = false;
  messageInput.focus();

  startMessagesListener();
  startTypingListener();
  startPinnedListener();
  if (isOnline) flushOfflineQueue();

  db.collection(USERS_COLLECTION).doc(currentUser.uid).set({
    username, assignedKey: cfg.key, color: cfg.color,
    lastActive: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

function checkUserAccess(user) {
  if (!user) {
    userBadge.textContent = 'Desconectado';
    messageInput.disabled = true;
    sendBtn.disabled = true;
    return;
  }
  currentUser = user;
  initializeUser();
}

// Botón cambiar usuario (header actions eliminado, ahora en ajustes)
document.getElementById('switch-user1-btn').addEventListener('click', () => switchUser('user1'));
document.getElementById('switch-user2-btn').addEventListener('click', () => switchUser('user2'));

function switchUser(key) {
  safeSetLocalStorage('assigned_user', key);
  location.reload();
}

// ============================================
// AJUSTES MODAL
// ============================================
settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
  loadStats();
});
settingsCloseBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.classList.add('hidden'); });

async function loadStats() {
  try {
    const snap = await db.collection(MESSAGES_COLLECTION).get();
    let total = 0, mine = 0, partner = 0, images = 0, audios = 0;
    const myUid = currentUser?.uid;
    snap.forEach(doc => {
      const d = doc.data();
      total++;
      if (d.uid === myUid) mine++; else partner++;
      if (d.imageBase64 || d.imageUrl) images++;
      if (d.audioBase64) audios++;
    });
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-mine').textContent = mine;
    document.getElementById('stat-partner').textContent = partner;
    document.getElementById('stat-images').textContent = images;
    document.getElementById('stat-audios').textContent = audios;
  } catch(e) {
    console.error('Error cargando stats:', e);
  }
}

// ============================================
// MENSAJES FIJADOS / ANUNCIOS
// ============================================
function startPinnedListener() {
  if (pinnedUnsubscribe) pinnedUnsubscribe();
  pinnedUnsubscribe = db.doc(PINNED_DOC).onSnapshot((snap) => {
    if (!snap.exists) return;
    const data = snap.data();
    const pinned = data?.pinnedMessage;
    if (pinned && pinned.texto) {
      pinnedText.textContent = pinned.texto.substring(0, 80) + (pinned.texto.length > 80 ? '...' : '');
      pinnedBanner.classList.remove('hidden');
      pinnedBtn.classList.remove('hidden');
    } else {
      pinnedBanner.classList.add('hidden');
      pinnedBtn.classList.add('hidden');
    }
  }, () => {});
}

pinnedCloseBtn.addEventListener('click', () => pinnedBanner.classList.add('hidden'));
pinnedBtn.addEventListener('click', () => pinnedBanner.classList.toggle('hidden'));

async function pinMessage(msgId, texto) {
  try {
    await db.doc(PINNED_DOC).set({ pinnedMessage: { id: msgId, texto, pinnedBy: username, pinnedAt: firebase.firestore.FieldValue.serverTimestamp() } }, { merge: true });
  } catch(e) { showError('No se pudo fijar el mensaje'); }
}

async function unpinMessage() {
  try {
    await db.doc(PINNED_DOC).set({ pinnedMessage: null }, { merge: true });
  } catch(e) { showError('No se pudo desfijar el mensaje'); }
}

// ============================================
// REPLY STATE
// ============================================
let replyToMessage = null;

const replyPreview = document.createElement('div');
replyPreview.className = 'reply-preview hidden';
replyPreview.innerHTML = `<button class="reply-preview-close" aria-label="Cancelar respuesta">&times;</button><div class="reply-preview-content"></div>`;
const chatInputArea = document.querySelector('.chat-input-area');
chatInputArea.parentNode.insertBefore(replyPreview, chatInputArea);
const replyPreviewContent = replyPreview.querySelector('.reply-preview-content');
replyPreview.querySelector('.reply-preview-close').addEventListener('click', clearReplyPreview);

function setReplyPreview(msg) {
  replyToMessage = { id: msg.id, autor: msg.autor, texto: msg.texto || '', imageSrc: msg.imageBase64 || msg.imageUrl || null };
  let html = `<span class="reply-preview-author">${escapeHtml(msg.autor)}</span>`;
  if (replyToMessage.imageSrc) html += `<span class="reply-preview-text">📷 Imagen</span>`;
  else if (msg.audioBase64) html += `<span class="reply-preview-text">🎙️ Audio</span>`;
  else if (replyToMessage.texto) html += `<span class="reply-preview-text">${escapeHtml(replyToMessage.texto).substring(0,50)}${replyToMessage.texto.length > 50 ? '...' : ''}</span>`;
  replyPreviewContent.innerHTML = html;
  replyPreview.classList.remove('hidden');
  messageInput.focus();
}

function clearReplyPreview() {
  replyToMessage = null;
  replyPreview.classList.add('hidden');
  replyPreviewContent.innerHTML = '';
}

// ============================================
// ESCAPE HTML
// ============================================
function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ============================================
// EDITAR MENSAJE
// ============================================
editCancelBtn.addEventListener('click', () => {
  editModal.classList.add('hidden');
  editingMessageId = null;
});
editModal.addEventListener('click', (e) => { if (e.target === editModal) { editModal.classList.add('hidden'); editingMessageId = null; } });

editSaveBtn.addEventListener('click', async () => {
  const newText = editInput.value.trim();
  if (!newText || !editingMessageId) return;
  try {
    await db.collection(MESSAGES_COLLECTION).doc(editingMessageId).update({
      texto: newText,
      editedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    editModal.classList.add('hidden');
    editingMessageId = null;
  } catch(e) { showError('Error al editar el mensaje'); }
});

function openEditModal(msgId, currentText) {
  editingMessageId = msgId;
  editInput.value = currentText;
  editModal.classList.remove('hidden');
  editInput.focus();
}

async function deleteMessage(msgId) {
  if (!confirm('¿Eliminar este mensaje?')) return;
  try {
    await db.collection(MESSAGES_COLLECTION).doc(msgId).delete();
  } catch(e) { showError('Error al eliminar el mensaje'); }
}

// ============================================
// AUTENTICACIÓN ANÓNIMA
// ============================================
auth.signInAnonymously().catch((err) => {
  console.error('Error auth:', err);
  userBadge.textContent = `Error: ${err.code}`;
});

auth.onAuthStateChanged((user) => {
  checkUserAccess(user);
});

// ============================================
// LISTENER TIEMPO REAL FIRESTORE
// ============================================
function startMessagesListener() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }

  const q = db.collection(MESSAGES_COLLECTION).orderBy('timestamp', 'asc');

  unsubscribe = q.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const msg = { ...change.doc.data(), id: change.doc.id };
        if (isFirstMessage) { if (welcomeMessage) welcomeMessage.remove(); isFirstMessage = false; }
        renderMessage(msg, msg.uid === currentUser?.uid);
      } else if (change.type === 'modified') {
        const msg = { ...change.doc.data(), id: change.doc.id };
        updateRenderedMessage(msg);
      } else if (change.type === 'removed') {
        const wrapper = messagesContainer.querySelector(`[data-message-id="${change.doc.id}"]`);
        if (wrapper) wrapper.remove();
      }
    });
  }, (err) => {
    console.error('Error listener:', err);
  });
}

// ============================================
// ENVIAR MENSAJE
// ============================================
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !currentUser) return;

  messageInput.value = '';
  const currentReply = replyToMessage;
  clearReplyPreview();
  messageInput.focus();

  const data = {
    texto: text,
    autor: username,
    uid: currentUser.uid,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    localTimestamp: Date.now(),
    reactions: {}
  };
  if (currentReply) data.replyTo = { id: currentReply.id, autor: currentReply.autor, texto: currentReply.texto, imageSrc: currentReply.imageSrc };

  try {
    if (isOnline) await db.collection(MESSAGES_COLLECTION).add(data);
    else addToOfflineQueue(data);
  } catch(err) {
    addToOfflineQueue(data);
  }
});

// ============================================
// RENDERIZAR MENSAJE
// ============================================
function formatTime(timestamp) {
  if (!timestamp) return '--:--';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function buildBubbleContent(msg, bubble, isSelf) {
  const { texto, imageBase64, imageUrl, imageBlur, imageWidth, imageHeight, audioBase64, replyTo, reactions, id, editedAt } = msg;
  const imageSrc = imageBase64 || imageUrl;

  // Reply preview
  if (replyTo) {
    const replyEl = document.createElement('div');
    replyEl.className = 'message-reply';
    let html = `<span class="reply-author">${escapeHtml(replyTo.autor)}</span>`;
    if (replyTo.imageSrc) html += `<span class="reply-text">📷 Imagen</span>`;
    else if (replyTo.texto) html += `<span class="reply-text">${escapeHtml(replyTo.texto).substring(0,60)}${replyTo.texto.length > 60 ? '...' : ''}</span>`;
    replyEl.innerHTML = html;
    bubble.appendChild(replyEl);
  }

  // Imagen
  if (imageSrc) {
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'message-image-wrapper';
    if (imageWidth && imageHeight) imgWrapper.style.aspectRatio = `${imageWidth} / ${imageHeight}`;

    if (imageBlur) {
      const bimg = document.createElement('img');
      bimg.src = imageBlur; bimg.alt = ''; bimg.className = 'message-image-blur';
      imgWrapper.appendChild(bimg);
    }
    const img = document.createElement('img');
    img.src = imageSrc; img.alt = 'Imagen'; img.className = 'message-image'; img.loading = 'lazy';
    img.onload = () => img.classList.add('loaded');
    img.addEventListener('click', () => openLightbox(imageSrc));
    imgWrapper.appendChild(img);
    bubble.appendChild(imgWrapper);
    bubble.classList.add('has-image');
  }

  // Audio
  if (audioBase64) {
    const audioWrapper = document.createElement('div');
    audioWrapper.className = 'message-audio';
    const audio = document.createElement('audio');
    audio.src = audioBase64;
    audio.controls = true;
    audio.preload = 'metadata';
    audioWrapper.appendChild(audio);
    bubble.appendChild(audioWrapper);
  }

  // Texto
  if (texto) {
    const textEl = document.createElement('span');
    textEl.className = 'message-text';
    textEl.textContent = texto;
    bubble.appendChild(textEl);
  }

  // Tiempo + editado
  const timeEl = document.createElement('span');
  timeEl.className = 'message-time';
  timeEl.textContent = formatTime(msg.localTimestamp || msg.timestamp);
  if (editedAt) {
    const editedBadge = document.createElement('span');
    editedBadge.className = 'edited-badge';
    editedBadge.textContent = ' editado';
    timeEl.appendChild(editedBadge);
  }
  bubble.appendChild(timeEl);

  // Reacciones existentes
  if (reactions && Object.keys(reactions).length > 0) {
    const rc = document.createElement('div');
    rc.className = 'message-reactions';
    Object.entries(reactions).forEach(([emoji, uids]) => {
      if (!uids?.length) return;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'reaction-bubble';
      if (uids.includes(currentUser?.uid)) btn.classList.add('user-reacted');
      btn.textContent = `${emoji} ${uids.length}`;
      btn.addEventListener('click', (e) => { e.stopPropagation(); toggleReaction(id, emoji); });
      rc.appendChild(btn);
    });
    bubble.appendChild(rc);
  }
}

function renderMessage(msg, isSelf = false) {
  const { id } = msg;

  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${isSelf ? 'self' : 'other'}`;
  wrapper.dataset.messageId = id;

  if (!isSelf) {
    const authorEl = document.createElement('span');
    authorEl.className = 'message-meta-author';
    authorEl.textContent = msg.autor;
    wrapper.appendChild(authorEl);
  }

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  buildBubbleContent(msg, bubble, isSelf);

  // Context menu (click derecho desktop + long press mobile)
  attachMessageActions(wrapper, bubble, msg, isSelf);

  wrapper.appendChild(bubble);
  messagesContainer.appendChild(wrapper);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Real-time reactions listener
  if (id) attachReactionListener(id, wrapper, msg.reactions);
}

function updateRenderedMessage(msg) {
  const wrapper = messagesContainer.querySelector(`[data-message-id="${msg.id}"]`);
  if (!wrapper) return;
  const isSelf = msg.uid === currentUser?.uid;
  const bubble = wrapper.querySelector('.message-bubble');
  if (!bubble) return;
  bubble.innerHTML = '';
  bubble.className = 'message-bubble';
  buildBubbleContent(msg, bubble, isSelf);
  // Re-attach reactions listener
  if (msg.id) attachReactionListener(msg.id, wrapper, msg.reactions);
}

// ============================================
// ACCIONES DE MENSAJES (menú contextual)
// ============================================
function attachMessageActions(wrapper, bubble, msg, isSelf) {
  // Botón reply siempre visible en hover (desktop)
  const replyBtn = document.createElement('button');
  replyBtn.className = 'swipe-reply-btn';
  replyBtn.innerHTML = '↩️';
  replyBtn.setAttribute('aria-label', 'Responder');
  replyBtn.addEventListener('click', (e) => { e.stopPropagation(); setReplyPreview(msg); });
  wrapper.appendChild(replyBtn);

  // Context menu handler
  const showMenu = (e, isTouch = false) => {
    if (!isTouch) e.preventDefault();
    closeAllMenus();

    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    menu.id = 'active-context-menu';

    const items = [
      { label: '↩️ Responder', action: () => setReplyPreview(msg) },
      { label: '😊 Reaccionar', action: () => openReactionPicker(bubble, msg) },
    ];
    if (isSelf && msg.texto && !msg.audioBase64) {
      items.push({ label: '✏️ Editar', action: () => openEditModal(msg.id, msg.texto) });
    }
    if (isSelf) {
      items.push({ label: '🗑️ Eliminar', action: () => deleteMessage(msg.id), danger: true });
    }
    if (isSelf || true) { // cualquiera puede fijar
      items.push({ label: '📌 Fijar mensaje', action: () => pinMessage(msg.id, msg.texto || '[Imagen/Audio]') });
    }

    items.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'context-menu-item' + (item.danger ? ' danger' : '');
      btn.textContent = item.label;
      btn.addEventListener('click', () => { item.action(); menu.remove(); });
      menu.appendChild(btn);
    });

    let x = isTouch ? window.innerWidth / 2 - 80 : e.clientX;
    let y = isTouch ? e.clientY || (wrapper.getBoundingClientRect().bottom) : e.clientY;
    menu.style.left = `${Math.min(x, window.innerWidth - 180)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - items.length * 48 - 20)}px`;
    document.body.appendChild(menu);

    setTimeout(() => {
      document.addEventListener('click', function closeMenu(ev) {
        if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
      });
    }, 0);
  };

  wrapper.addEventListener('contextmenu', (e) => showMenu(e));

  // Long press mobile
  let pressTimer = null;
  bubble.addEventListener('touchstart', (e) => {
    pressTimer = setTimeout(() => {
      const touch = e.changedTouches[0];
      showMenu({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: ()=>{} }, true);
    }, 500);
  }, { passive: true });
  bubble.addEventListener('touchend', () => clearTimeout(pressTimer), { passive: true });
  bubble.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
}

function closeAllMenus() {
  document.getElementById('active-context-menu')?.remove();
}

// ============================================
// EMOJI PICKER
// ============================================
const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','😂','🤣',
  '😊','😇','🙂','🙃','😉','😌','😍','🥰',
  '😘','😗','😙','😚','😋','😛','😝','😜',
  '🤪','🤨','🧐','🤓','😎','🤩','🥳','😏',
  '😒','😞','😔','😟','😕','🙁','☹️','😣',
  '😫','😩','🥺','😢','😭','😤','😠','😡',
  '🤬','🤯','😳','🥵','🥶','😱','😨','😰',
  '😥','😓','🤗','🤔','🤭','🤫','🤥','😶',
  '👍','👎','👌','✌️','🤞','🤟','🤘','🤙',
  '👏','🙌','🤝','🙏','❤️','🧡','💛','💚',
  '💙','💜','🖤','🤍','🤎','💔','💕','💞',
  '💓','💗','💖','💘','💝','🔥','💯','🎉',
  '✨','🎊','🥂','🍾','🎁','🎂','🌹','💐',
  '🌈','⭐','🌟','💫','🌙','☀️','🌊','🦋',
  '🐶','🐱','🐰','🐻','🦊','🐷','🐸','🐧',
  '👻','💩','🤡','👽','🤖','🎃','😺','😹'
];

function initEmojiPicker() {
  EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'emoji-item'; btn.textContent = emoji;
    btn.addEventListener('click', () => {
      messageInput.value += emoji;
      messageInput.focus();
      emojiPicker.classList.add('hidden');
    });
    emojiPicker.appendChild(btn);
  });

  emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); emojiPicker.classList.toggle('hidden'); });
  document.addEventListener('click', (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) emojiPicker.classList.add('hidden');
  });
}
initEmojiPicker();
messageInput.addEventListener('input', handleTypingInput);

// ============================================
// REACCIONES
// ============================================
const REACTION_EMOJIS = ['👍','❤️','😂','😮','😢','😡','🔥','🥰','👏','🎉','💯','🙏'];
const reactionPicker = document.getElementById('reaction-picker');
const reactionPickerContent = reactionPicker?.querySelector('.reaction-picker-content');
let currentMessageForReaction = null;
const reactionUnsubscribes = new Map();

function initReactionPicker() {
  if (!reactionPickerContent) return;
  REACTION_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'reaction-item'; btn.textContent = emoji;
    btn.addEventListener('click', () => {
      if (currentMessageForReaction) toggleReaction(currentMessageForReaction.id, emoji);
      closeReactionPicker();
    });
    reactionPickerContent.appendChild(btn);
  });
  document.addEventListener('click', (e) => {
    if (reactionPicker && !reactionPicker.contains(e.target) && !e.target.closest('.message-bubble')) closeReactionPicker();
  });
}

function openReactionPicker(messageEl, msgData) {
  if (!reactionPicker) return;
  currentMessageForReaction = { id: msgData.id, element: messageEl };
  const rect = messageEl.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - 140;
  let top = rect.top - 70;
  if (left < 8) left = 8;
  if (left + 280 > window.innerWidth) left = window.innerWidth - 288;
  if (top < 8) top = rect.bottom + 8;
  reactionPickerContent.style.left = `${left}px`;
  reactionPickerContent.style.top = `${top}px`;
  reactionPicker.classList.remove('hidden');
}

function closeReactionPicker() {
  reactionPicker?.classList.add('hidden');
  currentMessageForReaction = null;
}

async function toggleReaction(messageId, emoji) {
  if (!currentUser || !messageId) return;
  const msgRef = db.collection(MESSAGES_COLLECTION).doc(messageId);
  try {
    await db.runTransaction(async (t) => {
      const doc = await t.get(msgRef);
      if (!doc.exists) return;
      const reactions = doc.data().reactions || {};
      const uids = reactions[emoji] || [];
      const idx = uids.indexOf(currentUser.uid);
      if (idx >= 0) uids.splice(idx, 1); else uids.push(currentUser.uid);
      if (uids.length === 0) delete reactions[emoji]; else reactions[emoji] = uids;
      t.update(msgRef, { reactions });
    });
  } catch(e) { console.error('Error reaction:', e); }
}

function attachReactionListener(messageId, wrapperEl, initialReactions) {
  if (reactionUnsubscribes.has(messageId)) return;
  const unsub = db.collection(MESSAGES_COLLECTION).doc(messageId).onSnapshot((doc) => {
    if (!doc.exists) return;
    const data = doc.data();
    // Update reactions in bubble
    const bubble = wrapperEl.querySelector('.message-bubble');
    if (!bubble) return;
    let rc = bubble.querySelector('.message-reactions');
    const reactions = data.reactions || {};
    const hasReactions = Object.values(reactions).some(u => u?.length > 0);
    if (!hasReactions) { rc?.remove(); return; }
    if (!rc) { rc = document.createElement('div'); rc.className = 'message-reactions'; bubble.appendChild(rc); }
    rc.innerHTML = '';
    Object.entries(reactions).forEach(([emoji, uids]) => {
      if (!uids?.length) return;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'reaction-bubble';
      if (uids.includes(currentUser?.uid)) btn.classList.add('user-reacted');
      btn.textContent = `${emoji} ${uids.length}`;
      btn.addEventListener('click', (e) => { e.stopPropagation(); toggleReaction(messageId, emoji); });
      rc.appendChild(btn);
    });
  });
  reactionUnsubscribes.set(messageId, unsub);
}
initReactionPicker();

// ============================================
// GRABACIÓN DE AUDIO (VOICE MESSAGES)
// ============================================
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let voiceCancelled = false;
let touchStartX = 0;

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    voiceCancelled = false;
    recordingSeconds = 0;
    
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.addEventListener('dataavailable', (e) => { if (e.data.size > 0) audioChunks.push(e.data); });
    mediaRecorder.addEventListener('stop', async () => {
      stream.getTracks().forEach(t => t.stop());
      if (!voiceCancelled && audioChunks.length > 0) {
        await sendAudioMessage(audioChunks, mimeType);
      }
      audioChunks = [];
    });
    
    mediaRecorder.start(100);
    voiceBtn.classList.add('recording');
    voiceIndicator.classList.remove('hidden');

    recordingTimer = setInterval(() => {
      recordingSeconds++;
      const m = Math.floor(recordingSeconds / 60);
      const s = recordingSeconds % 60;
      voiceRecTime.textContent = `${m}:${String(s).padStart(2,'0')}`;
      if (recordingSeconds >= 120) stopRecording(false); // max 2 min
    }, 1000);
  } catch(e) {
    showError('No se pudo acceder al micrófono. Verifica los permisos.');
    console.error('Mic error:', e);
  }
}

function stopRecording(cancel = false) {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  voiceCancelled = cancel;
  clearInterval(recordingTimer);
  recordingTimer = null;
  recordingSeconds = 0;
  voiceRecTime.textContent = '0:00';
  voiceBtn.classList.remove('recording');
  voiceIndicator.classList.add('hidden');
  mediaRecorder.stop();
}

async function sendAudioMessage(chunks, mimeType) {
  if (!currentUser) return;
  const blob = new Blob(chunks, { type: mimeType });
  
  // Convertir a base64
  const base64 = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  const data = {
    autor: username,
    uid: currentUser.uid,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    localTimestamp: Date.now(),
    audioBase64: base64,
    audioMimeType: mimeType,
    reactions: {},
    texto: ''
  };

  const currentReply = replyToMessage;
  if (currentReply) { data.replyTo = { id: currentReply.id, autor: currentReply.autor, texto: currentReply.texto }; }
  clearReplyPreview();

  try {
    if (isOnline) await db.collection(MESSAGES_COLLECTION).add(data);
    else addToOfflineQueue(data);
  } catch(e) { addToOfflineQueue(data); }
}

// Eventos botón de voz: click para toggle (desktop) / hold para grabar (mobile)
let isHolding = false;

voiceBtn.addEventListener('mousedown', (e) => {
  e.preventDefault();
  isHolding = true;
  touchStartX = e.clientX;
  startRecording();
});

document.addEventListener('mouseup', (e) => {
  if (!isHolding) return;
  isHolding = false;
  const dx = Math.abs(e.clientX - touchStartX);
  stopRecording(dx > 60); // cancelar si arrastró >60px
});

voiceBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isHolding = true;
  touchStartX = e.touches[0].clientX;
  startRecording();
}, { passive: false });

document.addEventListener('touchend', (e) => {
  if (!isHolding) return;
  isHolding = false;
  const endX = e.changedTouches[0]?.clientX || touchStartX;
  const dx = touchStartX - endX;
  stopRecording(dx > 60); // deslizar izquierda para cancelar
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!isHolding) return;
  const curX = e.touches[0].clientX;
  const dx = touchStartX - curX;
  if (dx > 80) {
    voiceIndicator.querySelector('.voice-rec-hint').textContent = '¡Suelta para cancelar!';
    voiceIndicator.querySelector('.voice-rec-hint').style.color = '#ef4444';
  } else {
    voiceIndicator.querySelector('.voice-rec-hint').textContent = 'Suelta para enviar · Desliza para cancelar';
    voiceIndicator.querySelector('.voice-rec-hint').style.color = '';
  }
}, { passive: true });

// ============================================
// IMÁGENES (Base64 + compresión WebP)
// ============================================
imageBtn.addEventListener('click', () => imageInput.click());

async function compressImageToBase64(file, maxWidth = 800, quality = 0.7) {
  const blurPlaceholder = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 20; canvas.height = 20;
        canvas.getContext('2d').drawImage(img, 0, 0, 20, 20);
        resolve(canvas.toDataURL('image/jpeg', 0.1));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        let base64 = canvas.toDataURL('image/webp', quality);
        if (!base64.startsWith('data:image/webp')) base64 = canvas.toDataURL('image/jpeg', quality);
        const sizeKB = Math.round((base64.length * 3) / 4 / 1024);
        resolve({ base64, sizeKB, blurPlaceholder, width, height });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

imageInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !currentUser) return;
  if (!file.type.startsWith('image/')) { alert('Solo se permiten imágenes'); return; }

  sendBtn.disabled = true; imageBtn.disabled = true;
  imageBtn.innerHTML = '<span class="spinner"></span>';

  try {
    const { base64, sizeKB, blurPlaceholder, width, height } = await compressImageToBase64(file);
    if (sizeKB > 950) throw new Error('Imagen demasiado grande');

    const data = {
      texto: messageInput.value.trim() || '',
      autor: username,
      uid: currentUser.uid,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      localTimestamp: Date.now(),
      imageBase64: base64,
      imageBlur: blurPlaceholder,
      imageWidth: width, imageHeight: height,
      imageName: file.name,
      reactions: {}
    };
    const cr = replyToMessage;
    if (cr) { data.replyTo = { id: cr.id, autor: cr.autor, texto: cr.texto, imageSrc: cr.imageSrc }; }
    clearReplyPreview();

    if (isOnline) await db.collection(MESSAGES_COLLECTION).add(data);
    else addToOfflineQueue(data);

    messageInput.value = '';
    imageInput.value = '';
  } catch(err) {
    showError('Error al enviar imagen: ' + err.message);
  } finally {
    sendBtn.disabled = false; imageBtn.disabled = false;
    imageBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
    messageInput.focus();
  }
});

// ============================================
// LIGHTBOX
// ============================================
const lightbox = document.createElement('div');
lightbox.className = 'image-lightbox hidden';
lightbox.innerHTML = `<button class="close-lightbox" aria-label="Cerrar">&times;</button><img src="" alt="Imagen ampliada" />`;
document.body.appendChild(lightbox);
const lightboxImg = lightbox.querySelector('img');
lightbox.querySelector('.close-lightbox').addEventListener('click', () => { lightbox.classList.add('hidden'); lightboxImg.src = ''; });
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) { lightbox.classList.add('hidden'); lightboxImg.src = ''; } });

function openLightbox(url) {
  lightboxImg.src = url;
  lightbox.classList.remove('hidden');
}

// ============================================
// BÚSQUEDA
// ============================================
const searchToggleBtn = document.getElementById('search-toggle-btn');
const searchBar = document.getElementById('search-bar');
const searchInput = document.getElementById('search-input');
const searchCloseBtn = document.getElementById('search-close-btn');

searchToggleBtn?.addEventListener('click', () => {
  searchBar.classList.toggle('hidden');
  if (!searchBar.classList.contains('hidden')) searchInput.focus();
  else { searchInput.value = ''; filterMessages(''); }
});
searchCloseBtn?.addEventListener('click', () => { searchBar.classList.add('hidden'); searchInput.value = ''; filterMessages(''); });
searchInput?.addEventListener('input', (e) => filterMessages(e.target.value.toLowerCase().trim()));

function filterMessages(query) {
  document.querySelectorAll('.message-wrapper').forEach(w => {
    w.style.display = !query || w.textContent.toLowerCase().includes(query) ? '' : 'none';
  });
}

// ============================================
// DRAG & DROP
// ============================================
const chatContainer = document.getElementById('chat-container');
const dragDropOverlay = document.getElementById('drag-drop-overlay');
if (chatContainer && dragDropOverlay) {
  ['dragenter','dragover'].forEach(ev => chatContainer.addEventListener(ev, (e) => { e.preventDefault(); dragDropOverlay.classList.remove('hidden'); }));
  ['dragleave','drop'].forEach(ev => chatContainer.addEventListener(ev, (e) => { e.preventDefault(); dragDropOverlay.classList.add('hidden'); }));
  chatContainer.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) {
      const dt = new DataTransfer(); dt.items.add(file); imageInput.files = dt.files;
      imageInput.dispatchEvent(new Event('change'));
    }
  });
}

// ============================================
// LIMPIEZA
// ============================================
window.addEventListener('beforeunload', () => {
  if (unsubscribe) unsubscribe();
  if (pinnedUnsubscribe) pinnedUnsubscribe();
  if (typingUnsubscribe) typingUnsubscribe();
});
