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
const PAIRING_COLLECTION = `rooms/${ROOM_ID}/pairing`;
const PAIRING_CODE_KEY = `pairing_code_${ROOM_ID}`;
const PAIRING_CODE_TTL = 10 * 60 * 1000; // 10 min

// ============================================
// ESTADO GLOBAL
// ============================================
let currentUser = null;
let username = null;
let unsubscribe = null;
let pinnedUnsubscribe = null;
let typingUnsubscribe = null;
let typingTimeout = null;
let partnerTypingTimeout = null;
let editingMessageId = null;
let replyToMessage = null;
let isFirstMessage = true;
let isOnline = navigator.onLine;
let isHolding = false;
let touchStartX = 0;
let unreadCount = 0;

let connectionMode = 'firebase'; // 'firebase' o 'socketio'
let allMessages = [];
let visibleCount = 40;
let isScrollLoading = false;
let presenceHeartbeatInterval = null;
let partnerPresenceUnsubscribe = null;
let reactionWrappers = new Map();

// ============================================
// ESTADO DE EMPAREJAMIENTO (solo 2 usuarios)
// ============================================
let pairingState = 'checking'; // 'checking' | 'generate' | 'show_code' | 'enter_code' | 'paired' | 'full'
let pairingCode = null;
let pairingCodeExpires = 0;
let currentUserRole = null; // 'owner' | 'partner' | null

const state = {
  mediaRecorder: null,
  audioChunks: [],
  recordingTimer: null,
  recordingSeconds: 0,
  voiceCancelled: false,
  reactionUnsubscribes: new Map(),
  isTyping: false,
  lastMsgTime: 0,
  socket: null
};

// ============================================
// HELPERS GLOBALES
// ============================================
function generateClientId() {
  return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function safeGetLocalStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetLocalStorage(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function timeAgo(timestamp) {
  if (!timestamp) return '';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff/60)}m`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h`;
  return `${Math.floor(diff/86400)}d`;
}

// ============================================
// FUNCIONES DE EMPAREJAMIENTO (solo 2 usuarios)
// ============================================
function generatePairingCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function savePairingCodeLocal(code) {
  const data = { code, expires: Date.now() + PAIRING_CODE_TTL };
  safeSetLocalStorage(PAIRING_CODE_KEY, JSON.stringify(data));
  pairingCode = code;
  pairingCodeExpires = data.expires;
}

function loadPairingCodeLocal() {
  try {
    const stored = localStorage.getItem(PAIRING_CODE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (data.expires > Date.now()) {
        pairingCode = data.code;
        pairingCodeExpires = data.expires;
        return data.code;
      } else {
        localStorage.removeItem(PAIRING_CODE_KEY);
      }
    }
  } catch {}
  return null;
}

function clearPairingCodeLocal() {
  localStorage.removeItem(PAIRING_CODE_KEY);
  pairingCode = null;
  pairingCodeExpires = 0;
}

async function checkPairingStatus(uid) {
  try {
    const doc = await db.collection(PAIRING_COLLECTION).doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      currentUserRole = data.role || 'owner';
      return true;
    }
    return false;
  } catch (e) {
    console.error('Error checking pairing status:', e);
    return false;
  }
}

async function getPairedUsersCount() {
  try {
    const snap = await db.collection(PAIRING_COLLECTION).get();
    return snap.size;
  } catch (e) {
    console.error('Error getting paired count:', e);
    return 2; // Asumir lleno si hay error
  }
}

async function createPairingAsOwner(uid) {
  const code = generatePairingCode();
  const batch = db.batch();
  
  // Crear documento del owner
  const ownerRef = db.collection(PAIRING_COLLECTION).doc(uid);
  batch.set(ownerRef, {
    role: 'owner',
    code: code,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    pairedAt: null
  });
  
  await batch.commit();
  savePairingCodeLocal(code);
  currentUserRole = 'owner';
  return code;
}

async function joinPairingAsPartner(uid, code) {
  // Verificar que el código existe y pertenece al owner
  const ownerQuery = await db.collection(PAIRING_COLLECTION).where('code', '==', code).where('role', '==', 'owner').limit(1).get();
  
  if (ownerQuery.empty) {
    throw new Error('Código inválido o expirado');
  }
  
  const ownerDoc = ownerQuery.docs[0];
  const ownerUid = ownerDoc.id;
  
  // Verificar que no hay ya un partner
  const partnerQuery = await db.collection(PAIRING_COLLECTION).where('role', '==', 'partner').limit(1).get();
  if (!partnerQuery.empty) {
    throw new Error('Este chat ya tiene pareja emparejada');
  }
  
  const batch = db.batch();
  
  // Crear documento del partner
  const partnerRef = db.collection(PAIRING_COLLECTION).doc(uid);
  batch.set(partnerRef, {
    role: 'partner',
    ownerUid: ownerUid,
    code: code,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    pairedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  
  // Actualizar owner con pairedAt
  batch.update(db.collection(PAIRING_COLLECTION).doc(ownerUid), {
    pairedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  
  await batch.commit();
  currentUserRole = 'partner';
  return true;
}

function showPairingModal(step) {
  const modal = document.getElementById('pairing-modal');
  if (!modal) return;
  
  // Ocultar todos los pasos
  document.querySelectorAll('.pairing-step').forEach(s => s.classList.add('hidden'));
  
  // Mostrar paso solicitado
  const stepEl = document.getElementById(`pairing-step-${step}`);
  if (stepEl) stepEl.classList.remove('hidden');
  
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function hidePairingModal() {
  const modal = document.getElementById('pairing-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

// ============================================
// SISTEMA DE ICONOS
// ============================================
function getIcon(name) {
  const icon = ICONS?.[name];
  if (!icon) {
    console.warn(`Icon "${name}" not found`);
    return '';
  }
  return icon;
}

function renderIcon(container, name) {
  if (!container) return;
  container.innerHTML = getIcon(name);
}

// ============================================
// ELEMENTOS DOM
// ============================================
const elements = {
  messagesContainer: document.getElementById('messages-container'),
  welcomeMessage: document.getElementById('welcome-message'),
  chatForm: document.getElementById('chat-form'),
  messageInput: document.getElementById('message-input'),
  sendBtn: document.getElementById('send-btn'),
  emojiBtn: document.getElementById('emoji-btn'),
  emojiPicker: document.getElementById('emoji-picker'),
imageBtn: document.getElementById('image-btn'),
   imageInput: document.getElementById('image-input'),
  userBadge: document.getElementById('user-badge'),
  voiceBtn: document.getElementById('voice-btn'),
  voiceIndicator: document.getElementById('voice-recording-indicator'),
  voiceRecTime: document.getElementById('voice-rec-time'),
  pinnedBtn: document.getElementById('pinned-btn'),
  pinnedBanner: document.getElementById('pinned-banner'),
  pinnedText: document.getElementById('pinned-text'),
  pinnedCloseBtn: document.getElementById('pinned-close-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  settingsModal: document.getElementById('settings-modal'),
  settingsCloseBtn: document.getElementById('settings-close-btn'),
  editModal: document.getElementById('edit-modal'),
  editInput: document.getElementById('edit-input'),
  editCancelBtn: document.getElementById('edit-cancel-btn'),
  editSaveBtn: document.getElementById('edit-save-btn'),
  searchToggleBtn: document.getElementById('search-toggle-btn'),
  searchBar: document.getElementById('search-bar'),
  searchInput: document.getElementById('search-input'),
  searchCloseBtn: document.getElementById('search-close-btn'),
  replyPreview: document.getElementById('reply-preview'),
  offlineBanner: document.getElementById('offline-banner'),
  scrollToBottomBtn: document.getElementById('scroll-to-bottom-btn'),
  reactionPicker: document.getElementById('reaction-picker'),
  reactionPickerContent: document.getElementById('reaction-picker')?.querySelector('.reaction-picker-content'),
  emojiPickerInner: document.getElementById('emoji-picker'),
  chatInputArea: document.querySelector('.chat-input-area'),
};

// Icon containers
const iconEls = {
  replyPreviewAuthor: null,
  replyPreviewText: null,
  welcomeIcon: document.querySelector('.welcome-icon'),
  uploadIcon: document.querySelector('.drag-drop-icon'),
  syncIcon: document.querySelector('.sync-icon'),
};

// ============================================
// INICIALIZAR ICONOS ESTÁTICOS
// ============================================
function initStaticIcons() {
  renderIcon(iconEls.welcomeIcon, 'messageCircle');
  renderIcon(iconEls.uploadIcon, 'upload');

  // Header buttons
  const pinnedBtnInner = elements.pinnedBtn?.querySelector('.btn-icon-inner');
  const searchBtnInner = elements.searchToggleBtn?.querySelector('.btn-icon-inner');
  const settingsBtnInner = elements.settingsBtn?.querySelector('.btn-icon-inner');
  const settingsCloseInner = elements.settingsCloseBtn?.querySelector('.btn-icon');
  const emojiBtnInner = elements.emojiBtn?.querySelector('.btn-emoji-inner');
  const imageBtnInner = elements.imageBtn?.closest('.btn-media')?.querySelector('.btn-media-inner');
  const voiceBtnInner = elements.voiceBtn?.querySelector('.btn-voice-inner');
  const sendBtnInner = elements.sendBtn?.querySelector('.btn-send-inner');
  const voiceRecDot = elements.voiceIndicator?.querySelector('.voice-rec-dot');
  const pinnedCloseIcon = elements.pinnedCloseBtn?.querySelector('span');
  const searchCloseIcon = elements.searchCloseBtn?.querySelector('span');
  const replyPreviewCloseIcon = elements.replyPreview?.querySelector('.reply-preview-close span');
  const editCancelIcon = null; // will set later

  if (pinnedBtnInner) renderIcon(pinnedBtnInner, 'pin');
  if (searchBtnInner) renderIcon(searchBtnInner, 'search');
  if (settingsBtnInner) renderIcon(settingsBtnInner, 'settings');
  if (settingsCloseInner) renderIcon(settingsCloseInner, 'close');
  if (emojiBtnInner) renderIcon(emojiBtnInner, 'emoji');
  if (imageBtnInner) renderIcon(imageBtnInner, 'image');
  if (voiceBtnInner) renderIcon(voiceBtnInner, 'mic');
  if (sendBtnInner) renderIcon(sendBtnInner, 'send');
  if (voiceRecDot) renderIcon(voiceRecDot, 'micOff');
  if (pinnedCloseIcon) renderIcon(pinnedCloseIcon, 'close');
  if (searchCloseIcon) renderIcon(searchCloseIcon, 'close');
  if (replyPreviewCloseIcon) renderIcon(replyPreviewCloseIcon, 'close');

  // User switch avatars
  const avatar1 = document.querySelector('#switch-user1-btn .usr-avatar');
  const avatar2 = document.querySelector('#switch-user2-btn .usr-avatar');
  if (avatar1) renderIcon(avatar1, 'heartBlue');
  if (avatar2) renderIcon(avatar2, 'heartPink');

  // Sync badge icon
  const syncBadgeIcon = document.querySelector('.sync-icon');
  if (syncBadgeIcon) renderIcon(syncBadgeIcon, 'sync');
}

// ============================================
// COLA OFFLINE
// ============================================
const OFFLINE_QUEUE_KEY = 'chat_offline_queue';

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
  const indicator = elements.pendingIndicator || document.getElementById('pending-indicator');
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
    const msgId = item.id || generateClientId();
    const data = { ...item, id: msgId };
    try {
      if (connectionMode === 'socketio' && state.socket) {
        state.socket.emit('chatMessage', { roomId: ROOM_ID, ...data });
      } else {
        await db.collection(MESSAGES_COLLECTION).doc(msgId).set(data);
      }
    } catch { remaining.push(data); }
  }
  saveOfflineQueue(remaining);
  updatePendingIndicator();
}
window.addEventListener('online', () => { isOnline = true; updateOfflineState(); flushOfflineQueue(); });
window.addEventListener('offline', () => { isOnline = false; updateOfflineState(); });
updatePendingIndicator();

function updateOfflineState() {
  if (!elements.offlineBanner) return;
  if (!isOnline) {
    elements.offlineBanner.classList.remove('hidden');
    elements.offlineBanner.style.display = 'flex';
  } else {
    elements.offlineBanner.classList.add('hidden');
  }
}

// ============================================
// ERROR TOAST
// ============================================
function showError(message, isRetryable = false, onRetry = null) {
  const el = document.createElement('div');
  el.className = 'error-toast';
  el.innerHTML = `<span class="error-icon">${getIcon('alert')}</span><span class="error-message">${escapeHtml(message)}</span>${isRetryable && onRetry ? '<button class="error-retry">Reintentar</button>' : ''}`;
  if (onRetry) el.querySelector('.error-retry').addEventListener('click', () => { el.remove(); onRetry(); });
  document.body.appendChild(el);
  if (!isRetryable) setTimeout(() => el.remove(), 4000);
}

// ============================================
// TYPING INDICATOR
// ============================================
const TYPING_COLLECTION = `rooms/${ROOM_ID}/typing`;

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
        clearTimeout(partnerTypingTimeout);
        partnerTypingTimeout = setTimeout(() => {
          el.classList.add('hidden');
          el.innerHTML = '';
        }, 4000);
      } else {
        el.classList.add('hidden');
        el.innerHTML = '';
        clearTimeout(partnerTypingTimeout);
      }
    });
  });
}

function setTypingStatus(isTyping) {
  if (!currentUser || !username) return;
  const ref = db.collection(TYPING_COLLECTION).doc(currentUser.uid);
  if (isTyping) {
    ref.set({ uid: currentUser.uid, username, isTyping: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    setTimeout(() => ref.update({ isTyping: false }).catch(() => {}), 3000);
  } else {
    ref.update({ isTyping: false }).catch(() => {});
  }
}

function handleTypingInput() {
  if (!currentUser) return;
  if (!state.isTyping) {
    state.isTyping = true;
    setTypingStatus(true);
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => { setTypingStatus(false); state.isTyping = false; }, 800);
}

// ============================================
// TEMAS (CLARO / OSCURO / SISTEMA)
// ============================================
function initTheme() {
  const savedTheme = safeGetLocalStorage('theme') || 'system';
  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    themeSelect.value = savedTheme;
    themeSelect.addEventListener('change', (e) => {
      setTheme(e.target.value);
    });
  }
  setTheme(savedTheme);
}

function setTheme(theme) {
  safeSetLocalStorage('theme', theme);
  const body = document.body;
  if (theme === 'dark') {
    body.classList.add('dark-mode');
  } else if (theme === 'light') {
    body.classList.remove('dark-mode');
  } else {
    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    body.classList.toggle('dark-mode', isSystemDark);
  }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  const currentTheme = safeGetLocalStorage('theme') || 'system';
  if (currentTheme === 'system') {
    document.body.classList.toggle('dark-mode', e.matches);
  }
});

// ============================================
// HISTORIAL LOCAL Y FALLBACK SOCKET.IO
// ============================================
async function loadLocalHistory() {
  try {
    const response = await fetch(`/api/history/${ROOM_ID}`);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const localMsgs = await response.json();
    
    // Unificar mensajes locales
    allMessages = localMsgs || [];
    allMessages.sort((a, b) => (a.localTimestamp || a.timestamp || 0) - (b.localTimestamp || b.timestamp || 0));
    
    renderMessagesList();
    console.log(`📥 [App] Historial local cargado con éxito: ${allMessages.length} mensajes.`);
  } catch (err) {
    console.warn("⚠️ [App] No se pudo cargar el historial local (servidor local apagado):", err.message);
  }
}

let isConnected = false;

function connectRealtime() {
  console.log("🔌 [App] Conectando a tiempo real...");
  
  const firebaseTimeout = setTimeout(() => {
    if (!isConnected) {
      console.warn("⏳ [App] Tiempo de espera de Firebase agotado (4s). Activando fallback de Socket.io...");
      activateSocketIOFallback();
    }
  }, 4000);

  auth.signInAnonymously()
    .then((user) => {
      // Dejar que onAuthStateChanged maneje el acceso y la inicialización
    })
    .catch((err) => {
      console.error("❌ [App] Error en Auth Firebase:", err.message);
      clearTimeout(firebaseTimeout);
      activateSocketIOFallback();
    });
}

function activateSocketIOFallback() {
  if (connectionMode === 'socketio') return;
  
  connectionMode = 'socketio';
  isConnected = true;
  console.warn("⚠️ [App] Modo de conexión cambiado a Socket.io.");
  
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  
  // Si no hay mensajes cargados, cargar historial de respaldo HTTP
  if (allMessages.length === 0) {
    loadLocalHistory();
  }
  
  if (typeof io !== 'undefined') {
    state.socket = io(window.location.origin, {
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    });
    
    state.socket.on('connect', () => {
      console.log("✅ [Socket.io] Conectado al servidor local.");
      updateSyncStatus('online', 'Local Server');
      state.socket.emit('joinRoom', { roomId: ROOM_ID, uid: currentUser.uid });
    });
    
    state.socket.on('error', (err) => {
      console.error("❌ [Socket.io] Error del servidor:", err);
      if (err.code === 'NOT_PAIRED' || err.code === 'NO_UID') {
        showError('Tu sesión ha expirado. Recarga la página.', false, () => location.reload());
      }
    });
    
    state.socket.on('chatHistory', (history) => {
      console.log(`📥 [Socket.io] Historial recibido: ${history.length} mensajes.`);
      mergeIncomingMessages(history);
    });
    
    state.socket.on('newMessage', (msg) => {
      console.log("📥 [Socket.io] Nuevo mensaje recibido por socket:", msg);
      mergeIncomingMessages([{ ...msg, status: 'read' }]);
    });
    
    state.socket.on('disconnect', () => {
      updateSyncStatus('offline', 'Local Server');
    });
    
    state.socket.on('connect_error', (err) => {
      updateSyncStatus('offline', 'Local Server');
    });
  } else {
    showError("No se pudo conectar a Firebase ni al servidor local.");
    updateSyncStatus('offline', 'Desconectado');
  }
}

function updateSyncStatus(status, modeText) {
  const badge = document.querySelector('.sync-badge');
  const dot = document.querySelector('.sync-badge .status-dot');
  const text = document.querySelector('.sync-badge span:last-child');
  
  if (!badge || !dot) return;
  
  if (status === 'online') {
    dot.style.backgroundColor = 'var(--success-color)';
    badge.title = `Conectado a ${modeText}. Sincronización activa.`;
    if (text) text.textContent = modeText;
  } else {
    dot.style.backgroundColor = 'var(--danger-color)';
    badge.title = `Sin conexión.`;
    if (text) text.textContent = 'Sin conexión';
  }
}

// ============================================
// MERGE Y PROCESAMIENTO DE MENSAJES
// ============================================
function mergeIncomingMessages(incomingMsgs) {
  let hasChanges = false;
  
  incomingMsgs.forEach(remoteMsg => {
    const msgId = remoteMsg.id || remoteMsg.tempId;
    if (!msgId) return;
    
    const existingIndex = allMessages.findIndex(m => m.id === msgId || (m.tempId && m.tempId === remoteMsg.tempId));
    
    const formattedMsg = {
      ...remoteMsg,
      id: msgId,
      timestamp: remoteMsg.timestamp ? (remoteMsg.timestamp.toDate ? remoteMsg.timestamp.toDate().getTime() : new Date(remoteMsg.timestamp).getTime()) : Date.now(),
      localTimestamp: remoteMsg.localTimestamp ? parseInt(remoteMsg.localTimestamp, 10) : (remoteMsg.timestamp ? (remoteMsg.timestamp.toDate ? remoteMsg.timestamp.toDate().getTime() : new Date(remoteMsg.timestamp).getTime()) : Date.now())
    };
    
    if (existingIndex >= 0) {
      allMessages[existingIndex] = {
        ...allMessages[existingIndex],
        ...formattedMsg
      };
      hasChanges = true;
    } else {
      allMessages.push(formattedMsg);
      hasChanges = true;
    }
  });
  
  if (hasChanges) {
    allMessages.sort((a, b) => (a.localTimestamp || a.timestamp || 0) - (b.localTimestamp || b.timestamp || 0));
    renderMessagesList();
    handleIncomingMessageStatuses(incomingMsgs);
  }
}

function processFirestoreMessages(snapshot) {
  const incoming = [];
  snapshot.docChanges().forEach((change) => {
    const docData = change.doc.data();
    const isPending = change.doc.metadata.hasPendingWrites;
    
    const msg = {
      ...docData,
      id: change.doc.id,
      status: isPending ? 'sending' : (docData.status || 'sent')
    };
    
    if (change.type === 'added' || change.type === 'modified') {
      incoming.push(msg);
    } else if (change.type === 'removed') {
      const idx = allMessages.findIndex(m => m.id === msg.id);
      if (idx >= 0) {
        allMessages.splice(idx, 1);
        renderMessagesList();
      }
    }
  });
  
  if (incoming.length > 0) {
    mergeIncomingMessages(incoming);
  }
}

// ============================================
// ESTADOS DE MENSAJE (LEÍDOS / ENTREGADOS)
// ============================================
function handleIncomingMessageStatuses(msgs) {
  if (connectionMode !== 'firebase' || !currentUser) return;
  const unread = [];
  const undelivered = [];
  
  msgs.forEach(msg => {
    if (msg.uid !== currentUser.uid) {
      if (msg.status !== 'read') {
        if (document.hasFocus()) {
          unread.push(msg);
        } else if (msg.status !== 'delivered') {
          undelivered.push(msg);
        }
      }
    }
  });
  
  if (unread.length > 0) markMessagesAsRead(unread);
  if (undelivered.length > 0) markMessagesAsDelivered(undelivered);
}

async function markMessagesAsRead(messages) {
  if (connectionMode !== 'firebase') return;
  const batch = db.batch();
  let count = 0;
  messages.forEach(msg => {
    if (msg.id && msg.uid !== currentUser?.uid && msg.status !== 'read') {
      const ref = db.collection(MESSAGES_COLLECTION).doc(msg.id);
      batch.update(ref, { status: 'read' });
      count++;
    }
  });
  if (count > 0) {
    try {
      await batch.commit();
      console.log(`👁️ [App] Marcados ${count} mensajes como leídos.`);
    } catch (err) {
      console.error("Error marcando mensajes como leídos:", err);
    }
  }
}

async function markMessagesAsDelivered(messages) {
  if (connectionMode !== 'firebase') return;
  const batch = db.batch();
  let count = 0;
  messages.forEach(msg => {
    if (msg.id && msg.uid !== currentUser?.uid && msg.status !== 'delivered' && msg.status !== 'read') {
      const ref = db.collection(MESSAGES_COLLECTION).doc(msg.id);
      batch.update(ref, { status: 'delivered' });
      count++;
    }
  });
  if (count > 0) {
    try {
      await batch.commit();
      console.log(`🚚 [App] Marcados ${count} mensajes como entregados.`);
    } catch (err) {
      console.error("Error marcando mensajes como entregados:", err);
    }
  }
}

// Escuchar cambios de foco en la ventana
window.addEventListener('focus', () => {
  if (connectionMode === 'firebase' && currentUser) {
    const unread = allMessages.filter(msg => msg.uid !== currentUser.uid && msg.status !== 'read');
    if (unread.length > 0) markMessagesAsRead(unread);
  }
});

// ============================================
// PRESENCIA (HEARTBEAT Y LECTURA DEL PARTNER)
// ============================================
function startPresenceHeartbeat() {
  if (presenceHeartbeatInterval) clearInterval(presenceHeartbeatInterval);
  
  const updatePresence = () => {
    if (connectionMode !== 'firebase' || !currentUser) return;
    db.collection(USERS_COLLECTION).doc(currentUser.uid).set({
      lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      state: document.hasFocus() ? 'online' : 'away'
    }, { merge: true }).catch(() => {});
  };

  updatePresence();
  presenceHeartbeatInterval = setInterval(updatePresence, 20000);
}

function startPartnerPresenceListener() {
  if (partnerPresenceUnsubscribe) {
    partnerPresenceUnsubscribe();
    partnerPresenceUnsubscribe = null;
  }
  
  if (connectionMode !== 'firebase' || !currentUser) return;
  
  const myCfg = getUserConfig();
  const partnerKey = myCfg.key === 'user1' ? 'user2' : 'user1';
  
  partnerPresenceUnsubscribe = db.collection(USERS_COLLECTION)
    .where('assignedKey', '==', partnerKey)
    .limit(1)
    .onSnapshot(snapshot => {
      if (snapshot.empty) {
        updatePartnerPresenceUI(null);
        return;
      }
      updatePartnerPresenceUI(snapshot.docs[0].data());
    }, err => {
      console.warn("⚠️ [App] Error presencia partner:", err.message);
    });
}

function updatePartnerPresenceUI(partnerData) {
  const subRow = document.querySelector('.header-sub-row');
  let presenceEl = document.getElementById('partner-presence');
  
  if (!presenceEl) {
    presenceEl = document.createElement('span');
    presenceEl.id = 'partner-presence';
    presenceEl.className = 'partner-presence';
    if (subRow) {
      subRow.insertBefore(presenceEl, document.getElementById('typing-indicator'));
    }
  }
  
  if (!partnerData || !partnerData.lastActive) {
    presenceEl.textContent = '';
    return;
  }
  
  const lastActiveDate = partnerData.lastActive.toDate ? partnerData.lastActive.toDate() : new Date(partnerData.lastActive);
  const now = new Date();
  const diffSeconds = Math.floor((now - lastActiveDate) / 1000);
  const isOnlineNow = partnerData.state === 'online' && diffSeconds < 45;
  
  if (isOnlineNow) {
    presenceEl.innerHTML = `<span class="presence-dot online"></span> En línea`;
    presenceEl.className = 'partner-presence online';
  } else {
    presenceEl.innerHTML = `Últ. vez visto ${formatPresenceTime(lastActiveDate)}`;
    presenceEl.className = 'partner-presence offline';
  }
}

function formatPresenceTime(date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const time = `${hours}:${minutes}`;
  
  if (date.toDateString() === now.toDateString()) {
    return `hoy a las ${time}`;
  } else if (date.toDateString() === yesterday.toDateString()) {
    return `ayer a las ${time}`;
  } else {
    return `el ${date.getDate()}/${date.getMonth() + 1} a las ${time}`;
  }
}

// ============================================
// SEPARADORES DE FECHA Y RENDER DE HISTORIAL
// ============================================
function createDateSeparator(date) {
  const el = document.createElement('div');
  el.className = 'date-separator';
  
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  
  let label = '';
  if (date.toDateString() === now.toDateString()) {
    label = 'Hoy';
  } else if (date.toDateString() === yesterday.toDateString()) {
    label = 'Ayer';
  } else {
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    label = date.toLocaleDateString('es-ES', options);
  }
  
  el.innerHTML = `<span>${label}</span>`;
  return el;
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
  elements.userBadge.innerHTML = `${getIcon('heart')} ${escapeHtml(cfg.name)}`;
  elements.userBadge.style.color = cfg.color;

  document.querySelectorAll('.btn-user-switch').forEach(btn => {
    const isActive = btn.dataset.key === cfg.key;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive);
  });

  elements.messageInput.disabled = false;
  elements.sendBtn.disabled = false;
  elements.messageInput.focus();

  startMessagesListener();
  startTypingListener();
  startPinnedListener();
  if (isOnline) flushOfflineQueue();

  db.collection(USERS_COLLECTION).doc(currentUser.uid).set({
    username, assignedKey: cfg.key, color: cfg.color,
    lastActive: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function checkUserAccess(user) {
  if (!user) {
    elements.userBadge.textContent = 'Desconectado';
    elements.messageInput.disabled = true;
    elements.sendBtn.disabled = true;
    return;
  }
  
  currentUser = user;
  
  // Verificar si el usuario ya está emparejado
  const isPaired = await checkPairingStatus(user.uid);
  
  if (isPaired) {
    // Usuario ya emparejado → iniciar chat normal
    hidePairingModal();
    initializeUser();
    return;
  }
  
  // Usuario NO emparejado → verificar cupo
  const pairedCount = await getPairedUsersCount();
  
  if (pairedCount >= 2) {
    // Chat lleno
    pairingState = 'full';
    showPairingModal('full');
    elements.messageInput.disabled = true;
    elements.sendBtn.disabled = true;
    elements.userBadge.textContent = 'Chat completo';
    return;
  }
  
  // Hay cupo → verificar si tiene código guardado localmente
  const savedCode = loadPairingCodeLocal();
  
  if (savedCode) {
    // Tiene código guardado → es el owner, mostrar código
    pairingState = 'show_code';
    showPairingModal('show_code');
    document.getElementById('pairing-code-display').textContent = savedCode;
    elements.messageInput.disabled = true;
    elements.sendBtn.disabled = true;
    elements.userBadge.textContent = 'Esperando a tu pareja...';
    return;
  }
  
  // No tiene código → primer usuario, mostrar botón generar
  pairingState = 'generate';
  showPairingModal('generate');
  elements.messageInput.disabled = true;
  elements.sendBtn.disabled = true;
  elements.userBadge.textContent = 'Configurando...';
}

// User switch buttons
document.getElementById('switch-user1-btn').addEventListener('click', () => switchUser('user1'));
document.getElementById('switch-user2-btn').addEventListener('click', () => switchUser('user2'));

function switchUser(key) {
  safeSetLocalStorage('assigned_user', key);
  location.reload();
}

// ============================================
// EMPAREJAMIENTO MODAL - Event Listeners
// ============================================
document.getElementById('pairing-generate-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('pairing-generate-btn');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Generando...';
  
  try {
    const code = await createPairingAsOwner(currentUser.uid);
    pairingState = 'show_code';
    showPairingModal('show_code');
    document.getElementById('pairing-code-display').textContent = code;
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Generar código';
    elements.userBadge.textContent = 'Esperando a tu pareja...';
  } catch (e) {
    console.error('Error generando código:', e);
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Generar código';
    showError('Error al generar código. Intenta de nuevo.');
  }
});

document.getElementById('pairing-copy-btn')?.addEventListener('click', () => {
  const code = document.getElementById('pairing-code-display').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('pairing-copy-btn');
    const original = btn.querySelector('.btn-text').textContent;
    btn.querySelector('.btn-text').textContent = '¡Copiado!';
    setTimeout(() => btn.querySelector('.btn-text').textContent = original, 2000);
  });
});

document.getElementById('pairing-submit-btn')?.addEventListener('click', async () => {
  const input = document.getElementById('pairing-code-input');
  const code = input.value.trim();
  const errorEl = document.getElementById('pairing-error');
  const btn = document.getElementById('pairing-submit-btn');
  
  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    errorEl.textContent = 'El código debe tener 6 dígitos';
    errorEl.classList.remove('hidden');
    input.focus();
    return;
  }
  
  errorEl.classList.add('hidden');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Uniendo...';
  
  try {
    await joinPairingAsPartner(currentUser.uid, code);
    pairingState = 'paired';
    showPairingModal('success');
    document.getElementById('pairing-success-text').textContent = 'Ya pueden chatear juntos 💕';
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Unirse';
    input.value = '';
  } catch (e) {
    console.error('Error uniendo:', e);
    errorEl.textContent = e.message || 'Código inválido o expirado';
    errorEl.classList.remove('hidden');
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Unirse';
    input.focus();
  }
});

document.getElementById('pairing-continue-btn')?.addEventListener('click', () => {
  hidePairingModal();
  initializeUser();
});

document.getElementById('pairing-code-input')?.addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  document.getElementById('pairing-error')?.classList.add('hidden');
});

// ============================================
// AJUSTES MODAL
// ============================================
elements.settingsBtn.addEventListener('click', () => {
  elements.settingsModal.classList.remove('hidden');
  loadStats();
});
elements.settingsCloseBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
elements.settingsModal.addEventListener('click', (e) => { if (e.target === elements.settingsModal) elements.settingsModal.classList.add('hidden'); });

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
// MENSAJES FIJADOS
// ============================================
function startPinnedListener() {
  if (pinnedUnsubscribe) pinnedUnsubscribe();
  pinnedUnsubscribe = db.doc(PINNED_DOC).onSnapshot((snap) => {
    if (!snap.exists) return;
    const data = snap.data();
    const pinned = data?.pinnedMessage;
    if (pinned && pinned.texto) {
      elements.pinnedText.textContent = pinned.texto.substring(0, 80) + (pinned.texto.length > 80 ? '...' : '');
      elements.pinnedBanner.classList.remove('hidden');
      elements.pinnedBanner.style.display = 'flex';
      elements.pinnedBtn.classList.remove('hidden');
    } else {
      elements.pinnedBanner.classList.add('hidden');
      elements.pinnedBanner.style.display = 'none';
      elements.pinnedBtn.classList.add('hidden');
    }
  }, () => {});
}

elements.pinnedCloseBtn.addEventListener('click', () => { elements.pinnedBanner.classList.add('hidden'); elements.pinnedBanner.style.display = 'none'; });
elements.pinnedBtn.addEventListener('click', () => { elements.pinnedBanner.classList.toggle('hidden'); elements.pinnedBanner.style.display = elements.pinnedBanner.classList.contains('hidden') ? 'none' : 'flex'; });

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
// REPLY PREVIEW
// ============================================
function setReplyPreview(msg) {
  replyToMessage = { id: msg.id, autor: msg.autor, texto: msg.texto || '', imageSrc: msg.imageBase64 || msg.imageUrl || null };
  let html = `<span class="reply-preview-author">${escapeHtml(msg.autor)}</span>`;
  if (replyToMessage.imageSrc) html += `<span class="reply-preview-text">📷 Imagen</span>`;
  else if (msg.audioBase64) html += `<span class="reply-preview-text">🎙️ Audio</span>`;
  else if (replyToMessage.texto) html += `<span class="reply-preview-text">${escapeHtml(replyToMessage.texto).substring(0,50)}${replyToMessage.texto.length > 50 ? '...' : ''}</span>`;
  elements.replyPreview.querySelector('.reply-preview-content').innerHTML = html;
  elements.replyPreview.classList.remove('hidden');
  elements.replyPreview.style.display = 'flex';
  elements.messageInput.focus();
}

function clearReplyPreview() {
  replyToMessage = null;
  elements.replyPreview.classList.add('hidden');
  elements.replyPreview.style.display = 'none';
}

const replyPreviewCloseBtn = document.querySelector('.reply-preview-close');
if (replyPreviewCloseBtn) {
  replyPreviewCloseBtn.addEventListener('click', () => {
    clearReplyPreview();
    elements.messageInput.focus();
  });
}

// ============================================
// EDITAR MENSAJE
// ============================================
elements.editCancelBtn.addEventListener('click', () => {
  elements.editModal.classList.add('hidden');
  editingMessageId = null;
});
elements.editModal.addEventListener('click', (e) => { if (e.target === elements.editModal) { elements.editModal.classList.add('hidden'); editingMessageId = null; } });

elements.editSaveBtn.addEventListener('click', async () => {
  const newText = elements.editInput.value.trim();
  if (!newText || !editingMessageId) return;
  try {
    await db.collection(MESSAGES_COLLECTION).doc(editingMessageId).update({
      texto: newText,
      editedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    elements.editModal.classList.add('hidden');
    editingMessageId = null;
  } catch(e) { showError('Error al editar el mensaje'); }
});

function openEditModal(msgId, currentText) {
  editingMessageId = msgId;
  elements.editInput.value = currentText;
  elements.editModal.classList.remove('hidden');
  elements.editModal.style.display = 'flex';
  elements.editInput.focus();
}

async function deleteMessage(msgId) {
  const confirmed = await showConfirmDialog('¿Eliminar este mensaje?');
  if (!confirmed) return;
  try {
    await db.collection(MESSAGES_COLLECTION).doc(msgId).delete();
  } catch(e) { showError('Error al eliminar el mensaje'); }
}

// Custom confirm dialog
function showConfirmDialog(message) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'custom-confirm';
    modal.innerHTML = `
      <div class="custom-confirm-bg"></div>
      <div class="custom-confirm-content">
        <p class="custom-confirm-text">${escapeHtml(message)}</p>
        <div class="custom-confirm-btns">
          <button type="button" class="custom-confirm-cancel">Cancelar</button>
          <button type="button" class="custom-confirm-ok">Confirmar</button>
        </div>
      </div>
    `;
    modal.querySelector('.custom-confirm-cancel').addEventListener('click', () => { document.body.removeChild(modal); resolve(false); });
    modal.querySelector('.custom-confirm-ok').addEventListener('click', () => { document.body.removeChild(modal); resolve(true); });
    document.body.appendChild(modal);
  });
}

// ============================================
// AUTENTICACIÓN ANÓNIMA
// ============================================
auth.signInAnonymously().catch((err) => {
  console.error('Error auth:', err);
  elements.userBadge.textContent = `Error: ${err.code}`;
});

auth.onAuthStateChanged((user) => {
  checkUserAccess(user);
});

// Iniciar conexión en tiempo real (con fallback a Socket.io a los 4s)
connectRealtime();

// ============================================
// LISTENER TIEMPO REAL FIRESTORE
// ============================================
function startMessagesListener() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }

  const q = db.collection(MESSAGES_COLLECTION).orderBy('timestamp', 'asc');

  unsubscribe = q.onSnapshot((snapshot) => {
    if (!isConnected) {
      isConnected = true;
      connectionMode = 'firebase';
      updateSyncStatus('online', 'Firebase');
      console.log("🔥 [App] Conectado a Firebase Firestore en tiempo real.");
    }
    
    processFirestoreMessages(snapshot);
  }, (err) => {
    console.error('Error en listener de Firestore:', err);
    if (!isConnected || (err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('Quota exceeded')))) {
      activateSocketIOFallback();
    }
  });
}

// ============================================
// SCROLL MANAGEMENT
// ============================================
function isUserAtBottom() {
  if (!elements.messagesContainer) return true;
  const { scrollTop, scrollHeight, clientHeight } = elements.messagesContainer;
  return scrollHeight - scrollTop - clientHeight < 50;
}

function scrollToBottom() {
  if (!elements.messagesContainer) return;
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
  unreadCount = 0;
  updateScrollButton();
}

const scrollBtn = elements.scrollToBottomBtn;
if (scrollBtn) {
  scrollBtn.addEventListener('click', scrollToBottom);
}

let scrollThrottle = null;
if (elements.messagesContainer) {
  elements.messagesContainer.addEventListener('scroll', () => {
    if (scrollThrottle) return;
    scrollThrottle = setTimeout(() => {
      updateScrollVisibility();
      scrollThrottle = null;
    }, 100);
  });
}

function updateScrollButton() {
  if (!scrollBtn) return;
  const isAtBottom = isUserAtBottom();

  if (unreadCount > 0 && !isAtBottom) {
    scrollBtn.classList.remove('hidden');
    scrollBtn.style.display = 'inline-flex';
    const countEl = scrollBtn.querySelector('.scroll-count');
    if (countEl) countEl.textContent = unreadCount > 9 ? '9+' : unreadCount;
  } else {
    scrollBtn.classList.add('hidden');
    scrollBtn.style.display = 'none';
  }
}

function updateScrollVisibility() {
  const isAtBottom = isUserAtBottom();
  if (isAtBottom) {
    unreadCount = 0;
    scrollBtn.classList.add('hidden');
    scrollBtn.style.display = 'none';
  }
}

// ============================================
// ENVIAR MENSAJE
// ============================================
elements.chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = elements.messageInput.value.trim();
  if (!text || !currentUser) return;

  elements.messageInput.value = '';
  const currentReply = replyToMessage;
  clearReplyPreview();
  elements.messageInput.focus();

  const msgId = generateClientId();
  const data = {
    id: msgId,
    texto: text,
    autor: username,
    uid: currentUser.uid,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    localTimestamp: Date.now(),
    reactions: {}
  };
  if (currentReply) data.replyTo = { id: currentReply.id, autor: currentReply.autor, texto: currentReply.texto, imageSrc: currentReply.imageSrc };

  const optimisticMsg = {
    ...data,
    id: msgId,
    status: 'sending',
    uid: currentUser.uid,
    timestamp: Date.now(),
    localTimestamp: data.localTimestamp
  };
  mergeIncomingMessages([optimisticMsg]);

  try {
    if (connectionMode === 'socketio' && state.socket) {
      state.socket.emit('chatMessage', { roomId: ROOM_ID, ...data });
    } else if (isOnline) {
      await db.collection(MESSAGES_COLLECTION).doc(msgId).set(data);
    } else {
      addToOfflineQueue(data);
    }
  } catch(err) {
    const isQuotaExceeded = err.code === 'resource-exhausted' ||
      (err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('Quota exceeded')));
    if (isQuotaExceeded) {
      console.warn('⚠️ [App] Firestore quota exceeded, forcing Socket.io fallback');
      activateSocketIOFallback();
      if (state.socket) {
        state.socket.emit('chatMessage', { roomId: ROOM_ID, ...data });
      }
    } else {
      addToOfflineQueue(data);
    }
  }
});

// ============================================
// RENDERIZAR MENSAJE
// ============================================
function formatTime(timestamp) {
  if (!timestamp) return '--:--';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now - d;
  if (diffMs < 60000) return 'Ahora';
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
      bimg.src = imageBlur; bimg.alt = ''; bimg.className = 'message-image-blur'; bimg.loading = 'lazy';
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

  // Meta (time + edited + status)
  const metaWrapper = document.createElement('span');
  metaWrapper.className = 'message-meta';
  const timeSpan = document.createElement('span');
  timeSpan.textContent = formatTime(msg.localTimestamp || msg.timestamp);
  metaWrapper.appendChild(timeSpan);
  if (editedAt) {
    const editedBadge = document.createElement('span');
    editedBadge.className = 'edited-badge';
    editedBadge.textContent = ' editado';
    metaWrapper.appendChild(editedBadge);
  }
  // Checkmarks de estado (solo para mensajes propios)
  if (isSelf) {
    const statusEl = document.createElement('span');
    statusEl.className = `msg-status-icon ${msg.status || 'sent'}`;
    const msgStatus = msg.status || 'sent';
    if (msgStatus === 'sending') {
      statusEl.innerHTML = `<svg class="status-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    } else if (msgStatus === 'sent') {
      statusEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (msgStatus === 'delivered') {
      statusEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="18 6 9 17 4 12"/><polyline points="23 6 12 17"/></svg>`;
    } else if (msgStatus === 'read') {
      statusEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#53bdeb" stroke-width="2.5" width="14" height="14"><polyline points="18 6 9 17 4 12"/><polyline points="23 6 12 17"/></svg>`;
    }
    metaWrapper.appendChild(statusEl);
  }
  bubble.appendChild(metaWrapper);

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

let lastRenderedMsg = null;

// ============================================
// RENDER LISTA COMPLETA DE MENSAJES (CON PAGINACIÓN Y DATE SEPARATORS)
// ============================================
function renderMessagesList() {
  if (!elements.messagesContainer) return;

  const wasAtBottom = isUserAtBottom();
  const prevScrollHeight = elements.messagesContainer.scrollHeight;

  // Limpiar mensajes renderizados (no DOM estático como el welcome message)
  const existing = elements.messagesContainer.querySelectorAll('.message-wrapper, .date-separator');
  existing.forEach(el => el.remove());

  // Ocultar/mostrar welcome message
  const welcomeEl = document.getElementById('welcome-message');
  if (welcomeEl) {
    if (allMessages.length > 0) {
      welcomeEl.remove();
      isFirstMessage = false;
    }
  }

  const msgsToRender = allMessages.slice(-visibleCount);
  let lastDateStr = null;
  let lastUid = null;
  let lastTs = 0;

  msgsToRender.forEach((msg) => {
    const isSelf = msg.uid === currentUser?.uid;
    const ts = msg.localTimestamp || msg.timestamp || 0;
    const msgDate = new Date(typeof ts === 'number' ? ts : new Date(ts).getTime());
    const dateStr = msgDate.toDateString();

    // Insertar separador de fecha si cambia el día
    if (dateStr !== lastDateStr) {
      elements.messagesContainer.appendChild(createDateSeparator(msgDate));
      lastDateStr = dateStr;
      lastUid = null;
      lastTs = 0;
    }

    const isGrouped = lastUid === msg.uid && ts - lastTs < 120000;
    lastUid = msg.uid;
    lastTs = ts;

    const wrapper = createMessageElement(msg, isSelf, isGrouped);
    elements.messagesContainer.appendChild(wrapper);
    if (msg.id) attachReactionListener(msg.id, wrapper, msg.reactions);
  });

  // Restaurar posición de scroll o hacer scroll al final
  if (wasAtBottom) {
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    unreadCount = 0;
    updateScrollButton();
  } else if (msgsToRender.length < allMessages.length) {
    // Si cargamos mensajes anteriores, mantener la posición relativa
    const newScrollHeight = elements.messagesContainer.scrollHeight;
    elements.messagesContainer.scrollTop += (newScrollHeight - prevScrollHeight);
  } else {
    // Nuevos mensajes llegaron pero usuario está arriba
    const newMsgCount = allMessages.length - msgsToRender.length;
    if (newMsgCount > 0) {
      unreadCount++;
      updateScrollButton();
    }
  }
}

function createMessageElement(msg, isSelf, isGrouped) {
  const { id, uid } = msg;
  const ts = msg.localTimestamp || msg.timestamp || 0;

  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${isSelf ? 'self' : 'other'}${isGrouped ? ' grouped' : ''}`;
  wrapper.dataset.messageId = id;
  wrapper.dataset.messageUid = uid;
  wrapper.dataset.messageTime = String(ts);

  if (!isSelf && !isGrouped) {
    const authorEl = document.createElement('span');
    authorEl.className = 'message-meta-author';
    authorEl.innerHTML = `${getIcon('user')} ${escapeHtml(msg.autor)}`;
    wrapper.appendChild(authorEl);
  }

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  buildBubbleContent(msg, bubble, isSelf);
  attachMessageActions(wrapper, bubble, msg, isSelf);

  wrapper.appendChild(bubble);
  return wrapper;
}

function renderMessage(msg, isSelf = false) {
  // Compatibilidad: delegar a mergeIncomingMessages
  mergeIncomingMessages([msg]);
}

function updateRenderedMessage(msg) {
  const wrapper = elements.messagesContainer.querySelector(`[data-message-id="${msg.id}"]`);
  if (!wrapper) return;
  const isSelf = msg.uid === currentUser?.uid;
  const bubble = wrapper.querySelector('.message-bubble');
  if (!bubble) return;
  bubble.innerHTML = '';
  bubble.className = 'message-bubble';
  buildBubbleContent(msg, bubble, isSelf);
  if (msg.id) {
    if (state.reactionUnsubscribes.has(msg.id)) {
      state.reactionUnsubscribes.get(msg.id)();
      state.reactionUnsubscribes.delete(msg.id);
    }
    attachReactionListener(msg.id, wrapper, msg.reactions);
  }
}

// ============================================
// ACCIONES DE MENSAJES (menú contextual)
// ============================================
function attachMessageActions(wrapper, bubble, msg, isSelf) {
  // Reply button (desktop hover)
  const replyBtn = document.createElement('button');
  replyBtn.className = 'swipe-reply-btn';
  replyBtn.innerHTML = getIcon('reply');
  replyBtn.setAttribute('aria-label', 'Responder');
  replyBtn.addEventListener('click', (e) => { e.stopPropagation(); setReplyPreview(msg); });
  wrapper.appendChild(replyBtn);

  const showMenu = (e, isTouch = false) => {
    if (!isTouch) e.preventDefault();
    closeAllMenus();

    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    menu.id = 'active-context-menu';

    const items = [
      { icon: 'reply', label: 'Responder', action: () => setReplyPreview(msg) },
      { icon: 'react', label: 'Reaccionar', action: () => openReactionPicker(bubble, msg) },
    ];
    if (isSelf && msg.texto && !msg.audioBase64) {
      items.push({ icon: 'edit', label: 'Editar', action: () => openEditModal(msg.id, msg.texto) });
    }
    if (isSelf) {
      items.push({ icon: 'delete', label: 'Eliminar', action: () => deleteMessage(msg.id), danger: true });
    }
    items.push({ icon: 'pin', label: 'Fijar mensaje', action: () => pinMessage(msg.id, msg.texto || '[Imagen/Audio]') });

    items.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'context-menu-item' + (item.danger ? ' danger' : '');
      btn.innerHTML = `<span class="context-menu-icon">${getIcon(item.icon)}</span><span>${item.label}</span>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        item.action();
        menu.remove();
      });
      menu.appendChild(btn);
    });

    let x = isTouch ? window.innerWidth / 2 - 90 : e.clientX;
    let y = isTouch ? (e.clientY || wrapper.getBoundingClientRect().bottom) : e.clientY;
    menu.style.left = `${Math.min(x, window.innerWidth - 190)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - items.length * 52 - 20)}px`;
    document.body.appendChild(menu);

    setTimeout(() => {
      document.addEventListener('click', function closeMenu(ev) {
        if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
      });
    }, 0);
  };

  wrapper.addEventListener('contextmenu', (e) => showMenu(e));

  let pressTimer = null;
  bubble.addEventListener('touchstart', (e) => {
    pressTimer = setTimeout(() => {
      const touch = e.changedTouches[0];
      showMenu({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {} }, true);
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

const EMOJI_CATEGORIES = {
  '😀': '😊',
  '👍': '👍',
  '❤️': '❤️',
  '🎉': '🎉',
  '🔥': '🔥'
};

function initEmojiPicker() {
  // Add category header (recent or just first)
  const categoryLabel = document.createElement('div');
  categoryLabel.className = 'emoji-category-label';
  categoryLabel.textContent = 'Emoji';
  elements.emojiPickerInner.appendChild(categoryLabel);

  EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'emoji-item'; btn.textContent = emoji;
    btn.addEventListener('click', () => {
      elements.messageInput.value += emoji;
      elements.messageInput.focus();
      elements.emojiPicker.classList.add('hidden');
    });
    elements.emojiPickerInner.appendChild(btn);
  });

  elements.emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.emojiPicker.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!elements.emojiPicker.contains(e.target) && e.target !== elements.emojiBtn) {
      elements.emojiPicker.classList.add('hidden');
    }
  });
}

elements.messageInput.addEventListener('input', handleTypingInput);
initEmojiPicker();

// ============================================
// REACCIONES
// ============================================
const REACTION_EMOJIS = [
  { emoji: '👍', icon: 'thumbsUp', label: 'Me gusta' },
  { emoji: '❤️', icon: 'heart', label: 'Amor' },
  { emoji: '😂', icon: 'laugh', label: 'Gracioso' },
  { emoji: '😮', icon: 'wow', label: 'Sorpresa' },
  { emoji: '😢', icon: 'sad', label: 'Triste' },
  { emoji: '🔥', icon: 'fire', label: 'Fuego' },
  { emoji: '👏', icon: 'clap', label: 'Aplausos' },
  { emoji: '🎉', icon: 'party', label: 'Fiesta' },
  { emoji: '💯', icon: 'hundred', label: '100' },
  { emoji: '🙏', icon: 'pray', label: 'Gracias' }
];

let currentMessageForReaction = null;

function initReactionPicker() {
  if (!elements.reactionPickerContent) return;
  REACTION_EMOJIS.forEach(({ emoji, icon, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'reaction-item';
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `<span class="reaction-item-svg">${getIcon(icon)}</span><span class="reaction-item-text">${emoji}</span>`;
    btn.addEventListener('click', () => {
      if (currentMessageForReaction) toggleReaction(currentMessageForReaction.id, emoji);
      closeReactionPicker();
    });
    elements.reactionPickerContent.appendChild(btn);
  });

  document.addEventListener('click', (e) => {
    if (elements.reactionPicker && !elements.reactionPicker.contains(e.target) && !e.target.closest('.message-bubble')) {
      closeReactionPicker();
    }
  });
}

function openReactionPicker(messageEl, msgData) {
  if (!elements.reactionPicker) return;
  currentMessageForReaction = { id: msgData.id, element: messageEl };
  const rect = messageEl.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - 150;
  let top = rect.top - 75;
  if (left < 8) left = 8;
  if (left + 300 > window.innerWidth) left = window.innerWidth - 308;
  if (top < 8) top = rect.bottom + 8;
  elements.reactionPickerContent.style.left = `${left}px`;
  elements.reactionPickerContent.style.top = `${top}px`;
  elements.reactionPicker.classList.remove('hidden');
  elements.reactionPicker.style.display = 'flex';
}

function closeReactionPicker() {
  elements.reactionPicker?.classList.add('hidden');
  elements.reactionPicker.style.display = 'none';
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
    
    const msg = allMessages.find(m => m.id === messageId);
    if (msg) {
      msg.reactions = msg.reactions || {};
      const uids = msg.reactions[emoji] || [];
      const idx = uids.indexOf(currentUser.uid);
      if (idx >= 0) uids.splice(idx, 1); else uids.push(currentUser.uid);
      if (uids.length === 0) delete msg.reactions[emoji];
      else msg.reactions[emoji] = uids;
      const currentWrapper = reactionWrappers.get(messageId);
      updateReactionsOnWrapper(messageId, currentWrapper, msg.reactions);
    }
  } catch(e) {
    console.error('Error reaction:', e);
    if (e.message && (e.message.includes('429') || e.message.includes('RESOURCE_EXHAUSTED') || e.message.includes('Quota exceeded'))) {
      activateSocketIOFallback();
    }
  }
}

function updateReactionsOnWrapper(messageId, wrapperEl, reactions) {
  if (!wrapperEl) return;
  const bubble = wrapperEl.querySelector('.message-bubble');
  if (!bubble) return;
  let rc = bubble.querySelector('.message-reactions');
  const hasReactions = reactions && typeof reactions === 'object' && Object.values(reactions).some(u => u?.length > 0);
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
}

function attachReactionListener(messageId, wrapperEl, initialReactions) {
  reactionWrappers.set(messageId, wrapperEl);
  updateReactionsOnWrapper(messageId, wrapperEl, initialReactions);

  if (!state.reactionUnsubscribes.has(messageId)) {
    const unsub = db.collection(MESSAGES_COLLECTION).doc(messageId).onSnapshot((doc) => {
      if (!doc.exists) return;
      const data = doc.data();
      const currentWrapper = reactionWrappers.get(messageId);
      updateReactionsOnWrapper(messageId, currentWrapper, data.reactions || {});
    });
    state.reactionUnsubscribes.set(messageId, unsub);
  }
}

function renderInitialReactions(wrapperEl, reactions) {
  if (!wrapperEl) return;
  const bubble = wrapperEl.querySelector('.message-bubble');
  if (!bubble) return;
  const rc = bubble.querySelector('.message-reactions');
  if (rc) rc.remove();
  if (!reactions || typeof reactions !== 'object') return;
  const hasReactions = Object.values(reactions).some(u => u?.length > 0);
  if (!hasReactions) return;
  const container = document.createElement('div');
  container.className = 'message-reactions';
  Object.entries(reactions).forEach(([emoji, uids]) => {
    if (!uids?.length) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'reaction-bubble';
    if (uids.includes(currentUser?.uid)) btn.classList.add('user-reacted');
    btn.textContent = `${emoji} ${uids.length}`;
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleReaction(wrapperEl.dataset.messageId, emoji); });
    container.appendChild(btn);
  });
  bubble.appendChild(container);
}
initReactionPicker();

// ============================================
// GRABACIÓN DE AUDIO
// ============================================
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];
    state.voiceCancelled = false;
    state.recordingSeconds = 0;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';

    state.mediaRecorder = new MediaRecorder(stream, { mimeType });
    state.mediaRecorder.addEventListener('dataavailable', (e) => { if (e.data.size > 0) state.audioChunks.push(e.data); });
    state.mediaRecorder.addEventListener('stop', async () => {
      stream.getTracks().forEach(t => t.stop());
      if (!state.voiceCancelled && state.audioChunks.length > 0) {
        await sendAudioMessage(state.audioChunks, mimeType);
      }
      state.audioChunks = [];
    });

    state.mediaRecorder.start(100);
    elements.voiceBtn.classList.add('recording');
    elements.voiceBtn.setAttribute('aria-pressed', 'true');
    elements.voiceIndicator.classList.remove('hidden');
    elements.voiceIndicator.style.display = 'block';

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(10);

    state.recordingTimer = setInterval(() => {
      state.recordingSeconds++;
      const m = Math.floor(state.recordingSeconds / 60);
      const s = state.recordingSeconds % 60;
      elements.voiceRecTime.textContent = `${m}:${String(s).padStart(2,'0')}`;
      if (state.recordingSeconds >= 120) stopRecording(false);
    }, 1000);
  } catch(e) {
    showError('No se pudo acceder al micrófono. Verifica los permisos.');
    console.error('Mic error:', e);
  }
}

function stopRecording(cancel = false) {
  if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') return;
  state.voiceCancelled = cancel;
  clearInterval(state.recordingTimer);
  if (cancel) {
    if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
  } else {
    if (navigator.vibrate) navigator.vibrate(8);
  }
  state.recordingTimer = null;
  state.recordingSeconds = 0;
  elements.voiceRecTime.textContent = '0:00';
  elements.voiceBtn.classList.remove('recording');
  elements.voiceBtn.setAttribute('aria-pressed', 'false');
  elements.voiceIndicator.classList.add('hidden');
  elements.voiceIndicator.style.display = 'none';
  state.mediaRecorder.stop();
}

async function sendAudioMessage(chunks, mimeType) {
  if (!currentUser) return;
  const blob = new Blob(chunks, { type: mimeType });

  const base64 = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  const msgId = generateClientId();
  const data = {
    id: msgId,
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

  const optimisticMsg = {
    ...data,
    id: msgId,
    status: 'sending',
    uid: currentUser.uid,
    timestamp: Date.now(),
    localTimestamp: data.localTimestamp
  };
  mergeIncomingMessages([optimisticMsg]);

  try {
    if (connectionMode === 'socketio' && state.socket) {
      state.socket.emit('chatMessage', { roomId: ROOM_ID, ...data });
    } else if (isOnline) {
      await db.collection(MESSAGES_COLLECTION).doc(msgId).set(data);
    } else {
      addToOfflineQueue(data);
    }
  } catch(e) { addToOfflineQueue(data); }
}

// Eventos botón de voz
elements.voiceBtn.addEventListener('mousedown', (e) => {
  e.preventDefault();
  isHolding = true;
  touchStartX = e.clientX;
  startRecording();
});

document.addEventListener('mouseup', (e) => {
  if (!isHolding) return;
  isHolding = false;
  const dx = Math.abs(e.clientX - touchStartX);
  stopRecording(dx > 60);
});

elements.voiceBtn.addEventListener('touchstart', (e) => {
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
  stopRecording(dx > 60);
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!isHolding) return;
  const curX = e.touches[0].clientX;
  const dx = touchStartX - curX;
  const hint = elements.voiceIndicator.querySelector('.voice-rec-hint');
  if (!hint) return;
  if (dx > 80) {
    hint.textContent = '¡Suelta para cancelar!';
    hint.style.color = '#f87171';
  } else {
    hint.textContent = 'Suelta para enviar · Desliza para cancelar';
    hint.style.color = '';
  }
}, { passive: true });

// ============================================
// IMÁGENES
// ============================================
elements.imageBtn.addEventListener('click', () => elements.imageInput.click());

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

elements.imageInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !currentUser) return;
  if (!file.type.startsWith('image/')) {
    showError('Solo se permiten imágenes');
    return;
  }

  elements.sendBtn.disabled = true;
  const imageBtnEl = elements.imageBtn.closest('.btn-media');
  if (imageBtnEl) {
    imageBtnEl.disabled = true;
    const inner = imageBtnEl.querySelector('.btn-media-inner');
    if (inner) inner.innerHTML = '<span class="spinner"></span>';
  }

  try {
    const { base64, sizeKB, blurPlaceholder, width, height } = await compressImageToBase64(file);
    if (sizeKB > 950) throw new Error('Imagen demasiado grande');

    const msgId = generateClientId();
    const data = {
      id: msgId,
      texto: elements.messageInput.value.trim() || '',
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

    const optimisticMsg = {
      ...data,
      id: msgId,
      status: 'sending',
      uid: currentUser.uid,
      timestamp: Date.now(),
      localTimestamp: data.localTimestamp
    };
    mergeIncomingMessages([optimisticMsg]);

    try {
      if (connectionMode === 'socketio' && state.socket) {
        state.socket.emit('chatMessage', { roomId: ROOM_ID, ...data });
      } else if (isOnline) {
        await db.collection(MESSAGES_COLLECTION).doc(msgId).set(data);
      } else {
        addToOfflineQueue(data);
      }
    } catch(err) {
      addToOfflineQueue(data);
    }

    elements.messageInput.value = '';
    elements.imageInput.value = '';
  } catch(err) {
    showError('Error al enviar imagen: ' + err.message);
  } finally {
    elements.sendBtn.disabled = false;
    if (imageBtnEl) {
      imageBtnEl.disabled = false;
      const inner = imageBtnEl.querySelector('.btn-media-inner');
      if (inner) inner.innerHTML = getIcon('image');
    }
    elements.messageInput.focus();
  }
});

// ============================================
// LIGHTBOX
// ============================================
const lightbox = document.createElement('div');
lightbox.className = 'image-lightbox hidden';
lightbox.innerHTML = `<button class="close-lightbox" aria-label="Cerrar"><span aria-hidden="true"></span></button><img src="" alt="Imagen ampliada" />`;
document.body.appendChild(lightbox);
const lightboxImg = lightbox.querySelector('img');
const lightboxCloseIcon = lightbox.querySelector('.close-lightbox span');
renderIcon(lightboxCloseIcon, 'close');

lightbox.querySelector('.close-lightbox').addEventListener('click', () => { lightbox.classList.add('hidden'); lightboxImg.src = ''; });
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) { lightbox.classList.add('hidden'); lightboxImg.src = ''; } });

// Swipe to close lightbox
let lightboxStartX = 0;
let lightboxStartY = 0;
lightbox.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    lightboxStartX = e.touches[0].clientX;
    lightboxStartY = e.touches[0].clientY;
  }
}, { passive: true });

// ============================================
// BÚSQUEDA
// ============================================
elements.searchToggleBtn?.addEventListener('click', () => {
  elements.searchBar.classList.toggle('hidden');
  if (!elements.searchBar.classList.contains('hidden')) {
    elements.searchBar.style.display = 'flex';
    elements.searchInput.focus();
  } else {
    elements.searchBar.style.display = 'none';
    elements.searchInput.value = '';
    filterMessages('');
  }
});

elements.searchCloseBtn?.addEventListener('click', () => {
  elements.searchBar.classList.add('hidden');
  elements.searchBar.style.display = 'none';
  elements.searchInput.value = '';
  filterMessages('');
});

elements.searchInput?.addEventListener('input', (e) => filterMessages(e.target.value.toLowerCase().trim()));

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
  ['dragenter', 'dragover'].forEach(ev => {
    chatContainer.addEventListener(ev, (e) => {
      e.preventDefault();
      dragDropOverlay.classList.remove('hidden');
      dragDropOverlay.style.display = 'flex';
    });
  });
  ['dragleave', 'drop'].forEach(ev => {
    chatContainer.addEventListener(ev, (e) => {
      e.preventDefault();
      dragDropOverlay.classList.add('hidden');
      dragDropOverlay.style.display = 'none';
    });
  });

  chatContainer.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) {
      const dt = new DataTransfer();
      dt.items.add(file);
      elements.imageInput.files = dt.files;
      elements.imageInput.dispatchEvent(new Event('change'));
    }
  });
}

// ============================================
// UTILIDADES
// ============================================
function openLightbox(url) {
  lightboxImg.src = url;
  lightbox.classList.remove('hidden');
  lightbox.style.display = 'flex';
}

// ============================================
// INICIALIZACIÓN DE ICONOS ESTÁTICOS
// ============================================
initStaticIcons();
initTheme();

// ============================================
// LIMPIEZA
// ============================================
window.addEventListener('beforeunload', () => {
  if (unsubscribe) unsubscribe();
  if (pinnedUnsubscribe) pinnedUnsubscribe();
  if (typingUnsubscribe) typingUnsubscribe();
  state.reactionUnsubscribes.forEach(unsub => unsub());
  state.reactionUnsubscribes.clear();
});