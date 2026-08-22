/* FIREBASE CONFIG */
var firebaseConfig = {
  apiKey: "AIzaSyALVjHZtbEJGAx2pswt4l4h654ieGJw_tk",
  authDomain: "mensajes-31f68.firebaseapp.com",
  projectId: "mensajes-31f68",
  storageBucket: "mensajes-31f68.firebasestorage.app",
  messagingSenderId: "832362257221",
  appId: "1:832362257221:web:7a0115d52319375c743c2c"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var auth = firebase.auth();
db.enablePersistence({ synchronizeTabs: true }).catch(function(){});

var ROOM_ID = 'general';
var MESSAGES_COLLECTION = 'rooms/' + ROOM_ID + '/messages';
var USERS_COLLECTION = 'rooms/' + ROOM_ID + '/users';
var DESTACADOS_COLLECTION = 'rooms/' + ROOM_ID + '/destacados';
var SETTINGS_COLLECTION = 'rooms/' + ROOM_ID + '/settings';
var TYPING_COLLECTION = 'rooms/' + ROOM_ID + '/typing';

var ACCOUNTS = {
  user1: { key:'user1', email:'hombre@chatpareja.app', name:'Tu', color:'#2563eb' },
  user2: { key:'user2', email:'mujer@chatpareja.app', name:'Mi Amor', color:'#ec4899' }
};

var REACTIONS = ['\uD83D\uDC4D','\u2764\uFE0F','\uD83D\uDE02','\uD83D\uDE2E','\uD83D\uDE22','\uD83D\uDE4F','\uD83D\uDD25'];
var TYPING_TIMEOUT_MS = 3000;
var PRESENCE_HEARTBEAT_MS = 30000;
var ONLINE_THRESHOLD_MS = 60000;

var currentUser = null;
var username = null;
var assignedKey = null;
var unsubscribe = null;
var pinnedUnsubscribe = null;
var typingUnsubscribe = null;
var typingTimeout = null;
var partnerTypingTimeout = null;
var editingMessageId = null;
var replyToMessage = null;
var isFirstMessage = true;
var isOnline = navigator.onLine;
var unreadCount = 0;
var isConnected = false;
var allMessages = [];
var renderedMessageIds = new Set();
var visibleCount = 40;
var myProfile = { username:'', avatarBase64:'', bio:'' };
var partnerProfile = { username:'', avatarBase64:'', bio:'' };
var myDestacados = [];
var myDestacadoIds = new Set();
var partnerDestacados = [];
var partnerDestacadoIds = new Set();
var myShareDestacados = false;
var partnerShares = false;
var currentPinnedId = null;
var presenceHeartbeatInterval = null;
var partnerPresenceUnsubscribe = null;
var pendingImageFiles = [];
var pendingImagePreviews = [];
var state = {
  mediaRecorder: null, audioChunks: [], recordingTimer: null,
  recordingSeconds: 0, voiceCancelled: false, isTyping: false, socket: null
};
var el = {};

/* ============================================
   HELPERS
   ============================================ */
function generateClientId() {
  return 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}
function escapeHtml(text) {
  var d = document.createElement('div');
  d.appendChild(document.createTextNode(text || ''));
  return d.innerHTML;
}
function timeAgo(timestamp) {
  if (!timestamp) return '';
  var ts = timestamp.toMillis ? timestamp.toMillis() : (typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime());
  var diff = Math.max(0, Date.now() - ts);
  var s = Math.floor(diff / 1000);
  if (s < 30) return 'ahora';
  var m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  var h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}
function getIcon(name) {
  return (typeof ICONS !== 'undefined' && ICONS[name]) ? ICONS[name] : '';
}
function renderIcon(container, name) {
  if (container) container.innerHTML = getIcon(name);
}
function showError(msg) {
  var old = document.querySelector('.error-toast');
  if (old) old.remove();
  var t = document.createElement('div');
  t.className = 'error-toast';
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#ef4444;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:10000';
  document.body.appendChild(t);
  setTimeout(function(){ t.remove(); }, 4000);
}
function showSuccess(msg) {
  var old = document.querySelector('.success-toast');
  if (old) old.remove();
  var t = document.createElement('div');
  t.className = 'success-toast';
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:10000';
  document.body.appendChild(t);
  setTimeout(function(){ t.remove(); }, 3000);
}
function showConfirm(message) {
  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'custom-confirm';
    var bg = document.createElement('div');
    bg.className = 'custom-confirm-bg';
    var content = document.createElement('div');
    content.className = 'custom-confirm-content';
    var text = document.createElement('p');
    text.className = 'custom-confirm-text';
    text.textContent = message;
    var btns = document.createElement('div');
    btns.className = 'custom-confirm-btns';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'custom-confirm-cancel';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', function() { overlay.remove(); resolve(false); });
    var okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'custom-confirm-ok';
    okBtn.textContent = 'Confirmar';
    okBtn.addEventListener('click', function() { overlay.remove(); resolve(true); });
    btns.appendChild(cancelBtn);
    btns.appendChild(okBtn);
    content.appendChild(text);
    content.appendChild(btns);
    overlay.appendChild(bg);
    overlay.appendChild(content);
    bg.addEventListener('click', function() { overlay.remove(); resolve(false); });
    document.body.appendChild(overlay);
  });
}

/* ============================================
   E2EE - CIFRADO EXTREMO A EXTREMO
   Formato: enc1:<iv_b64>:<ct_b64>  (AES-GCM 256, PBKDF2-SHA256 150k)
   ============================================ */
var E2EE_PASS_KEY = 'chatpareja_e2ee_pass';
var ENC_PREFIX = 'enc1:';
var e2eeKeyCache = null;
var decryptedMap = {};

function bufToB64(buf) {
  var bytes = new Uint8Array(buf);
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64ToBuf(b64) {
  var bin = atob(b64);
  var arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}
function isEncryptedText(t) {
  return typeof t === 'string' && t.indexOf(ENC_PREFIX) === 0;
}
async function deriveE2eeKey(passphrase) {
  var enc = new TextEncoder();
  var baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('chatpareja-e2ee-v1'), iterations: 150000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
async function encryptText(plain) {
  if (!e2eeKeyCache || !plain) return plain || '';
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, e2eeKeyCache, new TextEncoder().encode(plain));
  return ENC_PREFIX + bufToB64(iv) + ':' + bufToB64(ct);
}
async function decryptText(payload) {
  if (!isEncryptedText(payload)) return payload;
  try {
    var parts = payload.split(':');
    var iv = new Uint8Array(b64ToBuf(parts[1]));
    var ct = b64ToBuf(parts[2]);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, e2eeKeyCache, ct);
    return new TextDecoder().decode(pt);
  } catch (e) {
    return e2eeKeyCache ? '[\uD83D\uDD12 No se pudo descifrar]' : '[\uD83D\uDD12 Sin clave]';
  }
}
function getPlainText(msg) {
  if (!msg) return '';
  var m = decryptedMap[msg.id];
  if (m && typeof m.texto === 'string') return m.texto;
  if (isEncryptedText(msg.texto)) {
    return e2eeKeyCache ? '[\uD83D\uDD12 Descifrando\u2026]' : '[\uD83D\uDD12 Configura tu frase secreta]';
  }
  return msg.texto || '';
}
async function hydrateMessageDecryption(msg) {
  if (!msg || !isEncryptedText(msg.texto)) return;
  var entry = decryptedMap[msg.id] || (decryptedMap[msg.id] = {});
  var changed = false;
  if (!entry.texto) { entry.texto = await decryptText(msg.texto); changed = true; }
  if (msg.replyTo && isEncryptedText(msg.replyTo.texto) && !entry.replyTexto) {
    entry.replyTexto = await decryptText(msg.replyTo.texto); changed = true;
  }
  if (!changed || !e2eeKeyCache) return;
  var idx = allMessages.findIndex(function(m){ return m.id === msg.id; });
  if (idx >= 0 && el.messagesContainer && el.messagesContainer.querySelector('[data-msg-id="' + msg.id + '"]')) {
    updateRenderedMessage(allMessages[idx]);
  }
}
async function e2eeFingerprint(passphrase) {
  var digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('chatpareja-fp:' + passphrase));
  var hex = Array.from(new Uint8Array(digest)).map(function(b){ return b.toString(16).padStart(2, '0'); }).join('');
  return hex.substring(0, 12).toUpperCase().replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3');
}
async function initE2ee() {
  var pass = null;
  try { pass = localStorage.getItem(E2EE_PASS_KEY); } catch (e) {}
  if (!pass) return;
  e2eeKeyCache = await deriveE2eeKey(pass);
  updateE2eeStatusUI();
  allMessages.forEach(function(m){ hydrateMessageDecryption(m); });
}
async function saveE2eePass(newPass) {
  newPass = (newPass || '').trim();
  if (!newPass) { showError('Ingresa una frase secreta'); return; }
  if (newPass.length < 6) { showError('Mínimo 6 caracteres'); return; }
  var hadPrevious = false;
  try { hadPrevious = !!localStorage.getItem(E2EE_PASS_KEY); } catch (e) {}
  if (hadPrevious) {
    var ok = await showConfirm('¿Cambiar la frase secreta? Los mensajes cifrados con la frase anterior ya NO se podrán leer.');
    if (!ok) return;
  }
  try { localStorage.setItem(E2EE_PASS_KEY, newPass); } catch (e) { showError('No se pudo guardar localmente'); return; }
  e2eeKeyCache = await deriveE2eeKey(newPass);
  decryptedMap = {};
  updateE2eeStatusUI();
  renderMessagesList();
  allMessages.forEach(function(m){ hydrateMessageDecryption(m); });
  showSuccess('Cifrado activado');
}
function disableE2eeLocal() {
  try { localStorage.removeItem(E2EE_PASS_KEY); } catch (e) {}
  e2eeKeyCache = null;
  decryptedMap = {};
  updateE2eeStatusUI();
  renderMessagesList();
  allMessages.forEach(function(m){ hydrateMessageDecryption(m); });
}
async function updateE2eeStatusUI() {
  var input = document.getElementById('e2ee-pass-input');
  var status = document.getElementById('e2ee-status');
  var dis = document.getElementById('e2ee-disable-btn');
  var pass = null;
  try { pass = localStorage.getItem(E2EE_PASS_KEY); } catch (e) {}
  if (dis) dis.classList.toggle('hidden', !pass || !e2eeKeyCache);
  if (!status) return;
  if (input) input.value = '';
  if (!pass || !e2eeKeyCache) {
    status.innerHTML = '<span class="e2ee-off">Desactivado — tus mensajes se guardan legibles en el servidor</span>';
    return;
  }
  var fp = await e2eeFingerprint(pass);
  status.innerHTML = '<span class="e2ee-on">Activo \u2705</span> Código de verificación: <strong>' + escapeHtml(fp) + '</strong><br><span class="e2ee-hint">Compárenlo entre ustedes: si es igual, leen lo mismo.</span>';
}
function getAssignedUser() {
  if (!currentUser || !currentUser.email) return null;
  if (currentUser.email === ACCOUNTS.user1.email) return 'user1';
  if (currentUser.email === ACCOUNTS.user2.email) return 'user2';
  return null;
}
function getUserConfig() {
  var k = getAssignedUser();
  return k ? ACCOUNTS[k] : null;
}
function getPartnerConfig() {
  var k = getAssignedUser();
  if (!k) return null;
  return k === 'user1' ? ACCOUNTS.user2 : ACCOUNTS.user1;
}
function tryLoginWithPassword(pw) {
  var emails = [ACCOUNTS.user1.email, ACCOUNTS.user2.email];
  return auth.signInWithEmailAndPassword(emails[0], pw).catch(function() {
    return auth.signInWithEmailAndPassword(emails[1], pw);
  });
}
function showLoginScreen() {
  if (el.loginScreen) { el.loginScreen.style.display = 'flex'; }
  if (el.chatContainer) { el.chatContainer.style.display = 'none'; }
}
function hideLoginScreen() {
  if (el.loginScreen) { el.loginScreen.style.display = 'none'; }
  if (el.chatContainer) { el.chatContainer.style.display = 'flex'; }
}
function softRefresh() {
  startMessagesListener();
  startPinnedListener();
  startTypingListener();
  startWishlistListener();
  if (isOnline && currentUser) flushOfflineQueue();
  loadMyProfile();
  loadPartnerProfile();
  showSuccess('Chat sincronizado');
}
function tryAutoLogin() {
  var pw = null;
  try { pw = sessionStorage.getItem('chatpareja_refresh_pw'); } catch(e){}
  if (!pw) return;
  try { sessionStorage.removeItem('chatpareja_refresh_pw'); } catch(e){}
  if (el.loginPassword) el.loginPassword.value = pw;
  if (el.loginError) el.loginError.style.display = 'none';
  if (el.loginSubmitBtn) { el.loginSubmitBtn.disabled = true; el.loginSubmitBtn.querySelector('.btn-text').textContent = 'Entrando...'; }
  tryLoginWithPassword(pw).catch(function(err) {
    console.error('Auto-login error:', err);
    if (el.loginSubmitBtn) { el.loginSubmitBtn.disabled = false; el.loginSubmitBtn.querySelector('.btn-text').textContent = 'Entrar'; }
  });
}
function initTheme() {
  var saved = 'system';
  try { saved = localStorage.getItem('chatpareja_theme') || 'system'; } catch(e){}
  setTheme(saved);
}
function setTheme(theme) {
  try { localStorage.setItem('chatpareja_theme', theme); } catch(e){}
  if (el.themeSelect) el.themeSelect.value = theme;
  var r = document.documentElement;
  r.removeAttribute('data-theme');
  if (theme === 'system') {
    r.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } else {
    r.setAttribute('data-theme', theme);
  }
}


/* ============================================
   OFFLINE QUEUE
   ============================================ */
var OFFLINE_QUEUE_KEY = 'chatpareja_offline';
function getOfflineQueue() { try { var d = localStorage.getItem(OFFLINE_QUEUE_KEY); return d ? JSON.parse(d) : []; } catch(e){ return []; } }
function saveOfflineQueue(q) { try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)); } catch(e){} }
function addToOfflineQueue(data) {
  var q = getOfflineQueue();
  q.push(data);
  saveOfflineQueue(q);
  updatePendingIndicator();
}
function updatePendingIndicator() {
  var q = getOfflineQueue();
  if (!el.pendingIndicator) return;
  if (q.length > 0) { el.pendingIndicator.textContent = q.length + ' pendiente' + (q.length > 1 ? 's' : ''); el.pendingIndicator.style.display = 'inline'; }
  else { el.pendingIndicator.style.display = 'none'; }
}
function flushOfflineQueue() {
  if (!isOnline || !currentUser) return;
  var q = getOfflineQueue();
  if (!q.length) return;
  var remaining = [];
  q.forEach(function(item) {
    var msgId = item.id || generateClientId();
    item.id = msgId;
    db.collection(MESSAGES_COLLECTION).doc(msgId).set(item).catch(function(){ remaining.push(item); });
  });
  saveOfflineQueue(remaining);
  updatePendingIndicator();
}

/* ============================================
   TYPING
   ============================================ */
function startTypingListener() {
  if (typingUnsubscribe) typingUnsubscribe();
  typingUnsubscribe = db.collection(TYPING_COLLECTION).onSnapshot(function(snap) {
    snap.docChanges().forEach(function(change) {
      var d = change.doc.data();
      if (d.uid === (currentUser && currentUser.uid)) return;
      var ind = document.getElementById('typing-indicator');
      if (!ind) return;
      if ((change.type === 'added' || change.type === 'modified') && d.isTyping) {
        ind.innerHTML = '<span>' + escapeHtml(d.username || '') + ' escribiendo</span><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
        ind.classList.remove('hidden');
        ind.style.display = 'flex';
        clearTimeout(partnerTypingTimeout);
        partnerTypingTimeout = setTimeout(function(){ ind.classList.add('hidden'); ind.style.display = 'none'; }, 4000);
      } else if (change.type === 'removed' || (change.type === 'modified' && !d.isTyping)) {
        ind.classList.add('hidden');
        ind.style.display = 'none';
        clearTimeout(partnerTypingTimeout);
      }
    });
    snap.forEach(function(doc) {
      var d = doc.data();
      if (d.uid === (currentUser && currentUser.uid)) return;
      var ind = document.getElementById('typing-indicator');
      if (!ind) return;
      if (d.isTyping) {
        ind.innerHTML = '<span>' + escapeHtml(d.username || '') + ' escribiendo</span><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
        ind.classList.remove('hidden');
        ind.style.display = 'flex';
        clearTimeout(partnerTypingTimeout);
        partnerTypingTimeout = setTimeout(function(){ ind.classList.add('hidden'); ind.style.display = 'none'; }, 4000);
      }
    });
  }, function(err){ console.error('Typing listener error:', err); });
}
function setTypingStatus(isTyping) {
  if (!currentUser) return;
  var ref = db.collection(TYPING_COLLECTION).doc(currentUser.uid);
  if (isTyping) {
    ref.set({ uid: currentUser.uid, username: username || '', isTyping: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(function(){});
    setTimeout(function(){ ref.update({ isTyping: false }).catch(function(){}); }, TYPING_TIMEOUT_MS);
  } else {
    ref.update({ isTyping: false }).catch(function(){});
  }
}
function handleTypingInput() {
  if (!state.isTyping) { state.isTyping = true; setTypingStatus(true); }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(function(){ state.isTyping = false; setTypingStatus(false); }, 800);
}

/* ============================================
   PRESENCE
   ============================================ */
function startPresenceHeartbeat() {
  if (!currentUser) return;
  var ref = db.collection(USERS_COLLECTION).doc(currentUser.uid);
  ref.set({ online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp(), uid: currentUser.uid, username: username || '' }, { merge: true }).catch(function(){});
  presenceHeartbeatInterval = setInterval(function() {
    ref.update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp(), online: true }).catch(function(){});
  }, PRESENCE_HEARTBEAT_MS);
}
function stopPresenceHeartbeat() {
  if (presenceHeartbeatInterval) { clearInterval(presenceHeartbeatInterval); presenceHeartbeatInterval = null; }
  if (currentUser) {
    db.collection(USERS_COLLECTION).doc(currentUser.uid).update({ online: false }).catch(function(){});
  }
}
function startPartnerPresenceListener() {
  var partner = getPartnerConfig();
  if (!partner) return;
  partnerPresenceUnsubscribe = db.collection(USERS_COLLECTION).where('uid', '!=', currentUser.uid).limit(1).onSnapshot(function(snap) {
    snap.forEach(function(doc) {
      var d = doc.data();
      var online = d.online === true;
      updateHeaderBadge(online);
    });
  }, function(){});
}
function updateHeaderBadge(partnerOnline) {
  var partner = getPartnerConfig();
  if (!partner || !el.userBadge) return;
  var status = partnerOnline === true ? ' - en linea' : partnerOnline === false ? ' - offline' : '';
  var pName = partnerProfile.username || partner.name;
  el.userBadge.textContent = pName + status;
  el.userBadge.style.color = partner.color;
}

/* ============================================
    PINNED MESSAGES (up to 4)
    ============================================ */
var pinnedMessages = [];
var PINNED_DISMISS_KEY = 'chatpareja_pins_dismissed_' + ROOM_ID;
var pinnedDismissedSig = null;
try { pinnedDismissedSig = sessionStorage.getItem(PINNED_DISMISS_KEY); } catch(e){}
function pinnedSignature() { return pinnedMessages.map(function(p){ return p.id; }).join(','); }
function setPinnedBannerVisible(visible) {
  if (!el.pinnedBanner) return;
  el.pinnedBanner.classList.toggle('hidden', !visible);
  el.pinnedBanner.style.display = visible ? 'flex' : 'none';
}
function startPinnedListener() {
  if (pinnedUnsubscribe) pinnedUnsubscribe();
  pinnedUnsubscribe = db.collection('rooms').doc(ROOM_ID).onSnapshot(function(doc) {
    var data = doc.data() || {};
    pinnedMessages = Array.isArray(data.pinnedMessages) ? data.pinnedMessages : [];
    anniversaryDate = typeof data.anniversary === 'string' ? data.anniversary : '';
    renderAnniversaryChip();
    renderPinnedBanner();
  }, function(){});
}
async function renderPinnedBanner() {
  var count = pinnedMessages.length;
  if (el.pinnedCount) el.pinnedCount.textContent = count;
  var sig = pinnedSignature();
  if (count === 0) {
    pinnedDismissedSig = null;
    try { sessionStorage.removeItem(PINNED_DISMISS_KEY); } catch(e){}
    setPinnedBannerVisible(false);
    if (el.pinnedPreview) el.pinnedPreview.textContent = '';
    return;
  }
  if (sig === pinnedDismissedSig) { setPinnedBannerVisible(false); return; }
  setPinnedBannerVisible(true);
  var resolved = await Promise.all(pinnedMessages.map(async function(p) {
    return { p: p, texto: isEncryptedText(p.texto) ? await decryptText(p.texto) : (p.texto || '[Mensaje]') };
  }));
  if (el.pinnedPreview) el.pinnedPreview.textContent = resolved[0] ? (' ' + resolved[0].texto).substring(0, 90) : '';
  if (!el.pinnedList) return;
  el.pinnedList.innerHTML = '';
  resolved.forEach(function(it) {
    var item = document.createElement('div');
    item.className = 'pinned-item';
    var textSpan = document.createElement('span');
    textSpan.className = 'pinned-item-text';
    textSpan.textContent = (it.p.autor ? it.p.autor + ': ' : '') + it.texto;
    textSpan.addEventListener('click', function() { scrollToMessage(it.p.id); });
    var unpinBtn = document.createElement('button');
    unpinBtn.className = 'pinned-unpin-btn';
    unpinBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    unpinBtn.setAttribute('aria-label', 'Dejar de fijar');
    unpinBtn.addEventListener('click', function(e) { e.stopPropagation(); unpinMessage(it.p.id); });
    item.appendChild(textSpan);
    item.appendChild(unpinBtn);
    el.pinnedList.appendChild(item);
  });
}
async function pinMessage(msgId, text, autor) {
  if (pinnedMessages.length >= 4) { showError('Maximo 4 mensajes fijados'); return; }
  if (pinnedMessages.find(function(p){ return p.id === msgId; })) { showError('Ya esta fijado'); return; }
  var cipher = await encryptText((text || '').substring(0, 200));
  var newPin = { id: msgId, texto: cipher, autor: autor || '', pinnedAt: Date.now() };
  var updated = pinnedMessages.concat([newPin]);
  db.collection('rooms').doc(ROOM_ID).set({
    pinnedMessages: updated, pinnedBy: currentUser.uid,
    pinnedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).catch(function(){ showError('Error al fijar'); });
}
function unpinMessage(msgId) {
  var updated = pinnedMessages.filter(function(p){ return p.id !== msgId; });
  db.collection('rooms').doc(ROOM_ID).set({
    pinnedMessages: updated
  }, { merge: true }).catch(function(){});
}


/* ============================================
   AUTH + LOGIN + INIT
   ============================================ */
function checkUserAccess(user) {
  if (!user) { showLoginScreen(); return; }
  currentUser = user;
  hideLoginScreen();
  initializeUser();
}
function initializeUser() {
  var cfg = getUserConfig();
  if (!cfg) return;
  username = cfg.name;
  assignedKey = cfg.key;
  updateHeaderBadge(null);
  if (el.messageInput) el.messageInput.disabled = false;
  if (el.sendBtn) el.sendBtn.disabled = false;
  startMessagesListener();
  startTypingListener();
  startPinnedListener();
  startPresenceHeartbeat();
  startPartnerPresenceListener();
  loadMyProfile();
  loadPartnerProfile();
  updateHeaderPartnerAvatar();
  startDestacadosListeners();
  startPartnerShareSettingListener();
  startWishlistListener();
  initE2ee();
  if (isOnline) flushOfflineQueue();
}
function cleanupListeners() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (typingUnsubscribe) { typingUnsubscribe(); typingUnsubscribe = null; }
  if (pinnedUnsubscribe) { pinnedUnsubscribe(); pinnedUnsubscribe = null; }
  if (partnerPresenceUnsubscribe) { partnerPresenceUnsubscribe(); partnerPresenceUnsubscribe = null; }
  stopPresenceHeartbeat();
}

/* ============================================
   IMAGE COMPRESSION
   ============================================ */
function compressImageToBase64(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var MAX = 800, w = img.width, h = img.height;
        if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h * MAX / w); w = MAX; } else { w = Math.round(w * MAX / h); h = MAX; } }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        var base64 = c.toDataURL('image/jpeg', 0.7);
        var blur = document.createElement('canvas');
        blur.width = 40; blur.height = Math.round(40 * h / w);
        blur.getContext('2d').drawImage(img, 0, 0, blur.width, blur.height);
        resolve({ base64: base64, blurPlaceholder: blur.toDataURL('image/jpeg', 0.3), width: w, height: h, name: file.name });
      };
      img.onerror = function(){ reject(new Error('Error loading image')); };
      img.src = e.target.result;
    };
    reader.onerror = function(){ reject(new Error('Error reading file')); };
    reader.readAsDataURL(file);
  });
}


/* ============================================
   MESSAGES LISTENER
   ============================================ */
var firstSnapshotReceived = false;
function showSkeletons() {
  if (!el.messagesContainer) return;
  if (el.messagesContainer.querySelector('.skeleton-msg')) return;
  for (var i = 0; i < 4; i++) {
    var sk = document.createElement('div');
    sk.className = 'skeleton-msg' + (i % 2 === 1 ? ' self' : '');
    var bar = document.createElement('div');
    bar.className = 'skeleton-loader';
    bar.style.width = (50 + ((i * 17) % 35)) + '%';
    bar.style.height = '100%';
    sk.appendChild(bar);
    el.messagesContainer.appendChild(sk);
  }
}
function hideSkeletons() {
  document.querySelectorAll('.skeleton-msg').forEach(function(s){ s.remove(); });
}
function startMessagesListener() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  firstSnapshotReceived = false;
  showSkeletons();
  unsubscribe = db.collection(MESSAGES_COLLECTION).orderBy('timestamp', 'asc').limit(500).onSnapshot(function(snapshot) {
    if (!isConnected) isConnected = true;
    processFirestoreMessages(snapshot);
  }, function(err) {
    console.error('Messages error:', err);
    isConnected = false;
    hideSkeletons();
  });
}
function processFirestoreMessages(snapshot) {
  if (!firstSnapshotReceived) { firstSnapshotReceived = true; hideSkeletons(); }
  var incoming = [];
  var hasRemovals = false;
  snapshot.docChanges().forEach(function(change) {
    var docData = change.doc.data();
    var isPending = change.doc.metadata.hasPendingWrites;
    var msg = Object.assign({}, docData, { id: change.doc.id, status: isPending ? 'sending' : (docData.status || 'sent') });
    if (change.type === 'added' || change.type === 'modified') { incoming.push(msg); }
    else if (change.type === 'removed') {
      var idx = allMessages.findIndex(function(m){ return m.id === msg.id; });
      if (idx >= 0) { allMessages.splice(idx, 1); hasRemovals = true; }
    }
  });
  if (hasRemovals) renderMessagesList();
  if (incoming.length > 0) mergeIncomingMessages(incoming);
}
function mergeIncomingMessages(incomingMsgs) {
  var hasChanges = false;
  incomingMsgs.forEach(function(remoteMsg) {
    var msgId = remoteMsg.id;
    if (!msgId) return;
    var ts = remoteMsg.timestamp;
    var numTs = ts ? (ts.toMillis ? ts.toMillis() : new Date(ts).getTime()) : Date.now();
    var formatted = Object.assign({}, remoteMsg, { id: msgId, timestamp: numTs });
    var existing = allMessages.findIndex(function(m){ return m.id === msgId; });
    if (existing >= 0) { allMessages[existing] = Object.assign({}, allMessages[existing], formatted); }
    else { allMessages.push(formatted); }
    hydrateMessageDecryption(formatted);
    hasChanges = true;
  });
  if (hasChanges) {
    allMessages.sort(function(a, b){ return (a.timestamp || 0) - (b.timestamp || 0); });
    applyIncrementalUpdates(incomingMsgs);
    handleIncomingMessageStatuses(incomingMsgs);
  }
}
function applyIncrementalUpdates(incomingMsgs) {
  if (!el.messagesContainer) return;
  var wasAtBottom = isUserAtBottom();
  incomingMsgs.forEach(function(incomingMsg) {
    var msg = allMessages.find(function(m){ return m.id === incomingMsg.id; }) || incomingMsg;
    var existingEl = el.messagesContainer.querySelector('[data-msg-id="' + msg.id + '"]');
    if (existingEl) { updateRenderedMessage(msg); }
    else {
      var isSelf = msg.uid === (currentUser && currentUser.uid);
      if (!isSelf && !wasAtBottom) unreadCount++;
      var ts = msg.timestamp || 0;
      var lastId = Array.from(renderedMessageIds).pop();
      var lastMsg = allMessages.find(function(m){ return m.id === lastId; });
      var lastTs = lastMsg ? (lastMsg.timestamp || 0) : 0;
      var lastUid = lastMsg ? lastMsg.uid : null;
      var isGrouped = lastUid === msg.uid && ts - lastTs < 120000;
      var wrapper = createMessageElement(msg, isSelf, isGrouped);
      el.messagesContainer.appendChild(wrapper);
      renderedMessageIds.add(msg.id);
    }
  });
  refreshDateSeparators();
  if (wasAtBottom) { el.messagesContainer.scrollTop = el.messagesContainer.scrollHeight; unreadCount = 0; updateScrollButton(); }
  else { updateScrollButton(); }
}
function handleIncomingMessageStatuses(msgs) {
  if (!currentUser) return;
  msgs.forEach(function(msg) {
    if (msg.uid !== currentUser.uid && msg.status !== 'read') {
      db.collection(MESSAGES_COLLECTION).doc(msg.id).update({ status: 'read' }).catch(function(){});
    }
  });
}
function renderMessagesList() {
  if (!el.messagesContainer) return;
  var wasAtBottom = isUserAtBottom();
  el.messagesContainer.querySelectorAll('.message-wrapper, .date-separator, .skeleton-msg').forEach(function(e){ e.remove(); });
  renderedMessageIds = new Set();
  if (el.welcomeMessage && allMessages.length > 0) el.welcomeMessage.remove();
  var msgs = allMessages.slice(-visibleCount);
  var lastDateStr = null, lastUid = null, lastTs = 0;
  msgs.forEach(function(msg) {
    var isSelf = msg.uid === (currentUser && currentUser.uid);
    var ts = msg.timestamp || 0;
    var d = new Date(ts);
    var ds = d.toDateString();
    if (ds !== lastDateStr) {
      el.messagesContainer.appendChild(createDateSeparator(d));
      lastDateStr = ds; lastUid = null; lastTs = 0;
    }
    var isGrouped = lastUid === msg.uid && ts - lastTs < 120000;
    lastUid = msg.uid; lastTs = ts;
    var wrapper = createMessageElement(msg, isSelf, isGrouped);
    el.messagesContainer.appendChild(wrapper);
    renderedMessageIds.add(msg.id);
  });
  if (wasAtBottom) el.messagesContainer.scrollTop = el.messagesContainer.scrollHeight;
  updateScrollButton();
}


/* MESSAGE RENDERING */
function formatTime(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function createDateSeparator(date) {
  var sep = document.createElement('div');
  sep.className = 'date-separator';
  var today = new Date();
  var text = '';
  if (date.toDateString() === today.toDateString()) text = 'Hoy';
  else { var y = new Date(today); y.setDate(y.getDate()-1); text = date.toDateString() === y.toDateString() ? 'Ayer' : date.toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'}); }
  sep.innerHTML = '<span>' + text + '</span>';
  return sep;
}
function createMessageElement(msg, isSelf, isGrouped) {
  var id = msg.id, ts = msg.timestamp || 0;
  var wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper ' + (isSelf ? 'self' : 'other') + (isGrouped ? ' grouped' : '');
  wrapper.dataset.msgId = id;
  wrapper.dataset.messageTime = String(ts);
  if (!isSelf && !isGrouped) {
    var ae = document.createElement('span');
    ae.className = 'message-meta-author';
    ae.textContent = msg.autor || '';
    wrapper.appendChild(ae);
  }
  var msgDiv = document.createElement('div');
  msgDiv.className = 'message ' + (isSelf ? 'owner-mine' : 'owner-partner');
  msgDiv.dataset.id = id;
  var bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  buildBubbleContent(msg, bubble, isSelf);
  var replyBtn = document.createElement('button');
  replyBtn.className = 'swipe-reply-btn';
  replyBtn.innerHTML = getIcon('reply');
  replyBtn.addEventListener('click', function(e) { e.stopPropagation(); setReplyPreview(msg); });
  wrapper.appendChild(replyBtn);
  var tSx = 0, tSy = 0, tDx = 0, tActive = false, tAxis = null;
  wrapper.addEventListener('touchstart', function(e) {
    var t = e.touches[0];
    tSx = t.clientX; tSy = t.clientY; tDx = 0; tActive = true; tAxis = null;
  }, { passive: true });
  wrapper.addEventListener('touchmove', function(e) {
    if (!tActive) return;
    var t = e.touches[0];
    var mx = t.clientX - tSx, my = t.clientY - tSy;
    if (tAxis === null) {
      if (Math.abs(mx) < 12 && Math.abs(my) < 12) return;
      tAxis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
    }
    if (tAxis !== 'x') { tActive = false; return; }
    e.preventDefault();
    tDx = Math.max(-96, Math.min(96, mx));
    bubble.style.transform = 'translateX(' + tDx + 'px)';
    if (replyBtn) {
      replyBtn.style.opacity = String(Math.min(1, Math.abs(tDx) / 60));
      replyBtn.style.transform = 'translateY(-50%) scale(1)';
    }
  }, { passive: false });
  function endTouchSwipe() {
    if (!tActive && tDx === 0) return;
    tActive = false;
    bubble.style.transform = '';
    if (replyBtn) { replyBtn.style.opacity = ''; replyBtn.style.transform = ''; }
    if (Math.abs(tDx) > 64) setReplyPreview(msg);
    tDx = 0;
  }
  wrapper.addEventListener('touchend', endTouchSwipe);
  wrapper.addEventListener('touchcancel', endTouchSwipe);
  wrapper.addEventListener('contextmenu', function(e) { e.preventDefault(); showContextMenu(e, msg, isSelf); });
  msgDiv.appendChild(bubble);
  wrapper.appendChild(msgDiv);
  return wrapper;
}


function buildBubbleContent(msg, bubble, isSelf) {
  if (msg.replyTo) {
    var re = document.createElement('div');
    re.className = 'message-reply';
    var rawRt = msg.replyTo.texto || '';
    var entry0 = decryptedMap[msg.id];
    var rt;
    if (isEncryptedText(rawRt)) {
      rt = (entry0 && typeof entry0.replyTexto === 'string') ? entry0.replyTexto.substring(0, 60) : '[\uD83D\uDD12]';
    } else {
      rt = rawRt ? rawRt.substring(0, 60) : (msg.replyTo.imageSrc ? 'Imagen' : '');
    }
    re.innerHTML = '<span class="reply-author">' + escapeHtml(msg.replyTo.autor || '') + '</span><span class="reply-text">' + escapeHtml(rt) + '</span>';
    bubble.appendChild(re);
  }
  if (msg.imageBase64) {
    var iw = document.createElement('div');
    iw.className = 'message-image-wrapper';
    if (msg.imageWidth && msg.imageHeight) iw.style.aspectRatio = msg.imageWidth + ' / ' + msg.imageHeight;
    if (msg.imageBlur) { var bi = document.createElement('img'); bi.src = msg.imageBlur; bi.className = 'message-image-blur'; bi.loading = 'lazy'; iw.appendChild(bi); }
    var im = document.createElement('img');
    im.src = msg.imageBase64; im.alt = 'Imagen'; im.className = 'message-image'; im.loading = 'lazy';
    im.onload = function() { this.classList.add('loaded'); };
    im.addEventListener('click', function() { openLightbox(msg.imageBase64); });
    iw.appendChild(im);
    if (msg.texto) { var c = document.createElement('span'); c.className = 'msg-caption'; c.textContent = getPlainText(msg); iw.appendChild(c); }
    bubble.appendChild(iw);
    bubble.classList.add('has-image');
  } else if (msg.imageGifUrl) {
    var gw = document.createElement('div');
    gw.className = 'message-image-wrapper gif-wrapper';
    if (msg.imageWidth && msg.imageHeight) gw.style.aspectRatio = msg.imageWidth + ' / ' + msg.imageHeight;
    else gw.style.minHeight = '160px';
    var gi = document.createElement('img');
    gi.src = msg.imageGifUrl; gi.alt = 'GIF'; gi.className = 'message-image loaded';
    gi.loading = 'lazy';
    gi.addEventListener('click', function() { openLightbox(msg.imageGifUrl); });
    gw.appendChild(gi);
    if (msg.texto) { var gc = document.createElement('span'); gc.className = 'msg-caption'; gc.textContent = getPlainText(msg); gw.appendChild(gc); }
    bubble.appendChild(gw);
    bubble.classList.add('has-image');
  } else if (msg.audioBase64) {
    var aw = document.createElement('div');
    aw.className = 'msg-audio';
    var au = document.createElement('audio');
    au.src = msg.audioBase64; au.controls = true; au.preload = 'metadata';
    aw.appendChild(au);
    var wf = document.createElement('div');
    wf.className = 'audio-waveform';
    var barCount = 30;
    var seed = 0;
    for (var si = 0; si < (msg.id || '').length; si++) { seed = ((seed << 5) - seed + (msg.id || '').charCodeAt(si)) | 0; }
    for (var i = 0; i < barCount; i++) {
      var b = document.createElement('span');
      b.className = 'waveform-bar';
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      b.style.height = (8 + (seed % 25)) + 'px';
      wf.appendChild(b);
    }
    aw.appendChild(wf);
    var dur = document.createElement('span');
    dur.className = 'audio-duration';
    dur.textContent = '--:--';
    au.addEventListener('loadedmetadata', function() {
      if (!isFinite(au.duration)) return;
      var t = Math.round(au.duration);
      dur.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    });
    aw.appendChild(dur);
    if (msg.audioBase64.indexOf('data:audio') === 0) {
      try {
        var raw = msg.audioBase64.split(',')[1];
        var bytes = atob(raw);
        var arr = new Uint8Array(bytes.length);
        for (var ai = 0; ai < bytes.length; ai++) arr[ai] = bytes.charCodeAt(ai);
        var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtx.decodeAudioData(arr.buffer).then(function(buffer) {
          var raw_data = buffer.getChannelData(0);
          var step = Math.floor(raw_data.length / barCount);
          var bars = wf.querySelectorAll('.waveform-bar');
          for (var wi = 0; wi < bars.length; wi++) {
            var start = wi * step;
            var sum = 0;
            for (var j = 0; j < step && start + j < raw_data.length; j++) { sum += Math.abs(raw_data[start + j]); }
            var avg = sum / step;
            var h = Math.max(4, Math.min(32, Math.round(avg * 60)));
            bars[wi].style.height = h + 'px';
          }
          audioCtx.close();
        }).catch(function(){});
      } catch(e){}
    }
    bubble.appendChild(aw);
  }
  if (msg.texto && !msg.imageBase64) {
    var te = document.createElement('span');
    te.className = 'msg-text'; te.textContent = getPlainText(msg);
    bubble.appendChild(te);
  }
  var meta = document.createElement('span');
  meta.className = 'message-meta';
  var ts = document.createElement('span');
  ts.className = 'msg-time'; ts.textContent = formatTime(msg.timestamp);
  meta.appendChild(ts);
  if (msg.editedAt) { var eb = document.createElement('span'); eb.className = 'edited-badge'; eb.textContent = ' editado'; meta.appendChild(eb); }
  if (isSelf) {
    var se = document.createElement('span');
    var s = msg.status || 'sent';
    se.className = 'msg-status-icon ' + s;
    if (s === 'sending') se.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    else if (s === 'sent') se.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>';
    else if (s === 'delivered') se.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="18 6 9 17 4 12"/><polyline points="23 6 12 17"/></svg>';
    else if (s === 'read') se.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#53bdeb" stroke-width="2.5" width="14" height="14"><polyline points="18 6 9 17 4 12"/><polyline points="23 6 12 17"/></svg>';
    meta.appendChild(se);
  }
  bubble.appendChild(meta);
  if (msg.reactions && Object.keys(msg.reactions).length > 0) {
    var rc = document.createElement('div'); rc.className = 'message-reactions';
    Object.keys(msg.reactions).forEach(function(emoji) {
      var uids = msg.reactions[emoji]; if (!uids || !uids.length) return;
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'reaction-bubble';
      if (currentUser && uids.indexOf(currentUser.uid) >= 0) btn.classList.add('user-reacted');
      btn.textContent = emoji + ' ' + uids.length;
      btn.addEventListener('click', function(e) { e.stopPropagation(); toggleReaction(msg.id, emoji); });
      rc.appendChild(btn);
    });
    bubble.appendChild(rc);
  }
}
function updateRenderedMessage(msg) {
  var wrapper = el.messagesContainer ? el.messagesContainer.querySelector('[data-msg-id="' + msg.id + '"]') : null;
  if (!wrapper) return;
  var bubble = wrapper.querySelector('.message-bubble');
  if (!bubble) return;
  bubble.innerHTML = '';
  buildBubbleContent(msg, bubble, msg.uid === (currentUser && currentUser.uid));
}


/* SENDING + SCROLL */
function sendMessage(text, imageData, audioData) {
  if (!currentUser || !username) return;
  var currentReply = replyToMessage;
  clearReplyPreview();
  var msgId = generateClientId();
  var plainText = text && text.trim() ? text.trim() : '';
  buildAndSend(msgId, plainText, currentReply, imageData, audioData);
}
async function buildAndSend(msgId, plainText, currentReply, imageData, audioData) {
  var cipherText = await encryptText(plainText);
  var replyPlain = currentReply ? getPlainText(currentReply) : '';
  var replyCipher = currentReply ? await encryptText(replyPlain) : '';
  var data = { id: msgId, autor: username, uid: currentUser.uid, timestamp: firebase.firestore.FieldValue.serverTimestamp(), localTimestamp: Date.now(), reactions: {}, texto: cipherText };
  if (imageData) {
    if (imageData.gifUrl) { data.imageGifUrl = imageData.url; data.imageWidth = imageData.w || 0; data.imageHeight = imageData.h || 0; }
    else { data.imageBase64 = imageData.base64; data.imageBlur = imageData.blurPlaceholder; data.imageWidth = imageData.width; data.imageHeight = imageData.height; }
  }
  if (audioData) { data.audioBase64 = audioData.base64; data.audioMimeType = audioData.mimeType || 'audio/webm'; }
  decryptedMap[msgId] = { texto: plainText };
  if (currentReply) {
    decryptedMap[msgId].replyTexto = replyPlain;
    data.replyTo = { id: currentReply.id, autor: currentReply.autor, texto: replyCipher, imageSrc: currentReply.imageBase64 || null };
  }
  mergeIncomingMessages([Object.assign({}, data, { status: 'sending', timestamp: Date.now() })]);
  sendToFirestoreOrQueue(data, msgId);
}
function sendToFirestoreOrQueue(data, msgId) {
  if (isOnline) {
    db.collection(MESSAGES_COLLECTION).doc(msgId).set(data).catch(function(e) { console.error('Send error:', e); addToOfflineQueue(data); });
  } else { addToOfflineQueue(data); }
}
function sendImageMessage(base64, blur, w, h, caption) {
  sendMessage(caption || '', { base64: base64, blurPlaceholder: blur, width: w, height: h }, null);
}
function sendAudioMessage(chunks, mimeType) {
  if (!currentUser) return;
  var blob = new Blob(chunks, { type: mimeType });
  var reader = new FileReader();
  reader.onload = function() { sendMessage('', null, { base64: reader.result, mimeType: mimeType }); };
  reader.readAsDataURL(blob);
}
function isUserAtBottom() {
  if (!el.messagesContainer) return true;
  var c = el.messagesContainer;
  return c.scrollHeight - c.scrollTop - c.clientHeight < 100;
}
function scrollToBottom() { if (el.messagesContainer) el.messagesContainer.scrollTop = el.messagesContainer.scrollHeight; }
function updateScrollButton() {
  if (!el.scrollToBottomBtn) return;
  if (unreadCount > 0 && !isUserAtBottom()) {
    el.scrollToBottomBtn.classList.remove('hidden');
    el.scrollToBottomBtn.style.display = 'flex';
    var cnt = el.scrollToBottomBtn.querySelector('.scroll-count');
    if (cnt) cnt.textContent = unreadCount === 1 ? '1 mensaje nuevo' : unreadCount + ' mensajes nuevos';
  } else {
    el.scrollToBottomBtn.classList.add('hidden');
    el.scrollToBottomBtn.style.display = 'none';
    unreadCount = 0;
  }
}
function refreshDateSeparators() {
  if (!el.messagesContainer) return;
  el.messagesContainer.querySelectorAll('.date-separator').forEach(function(e){ e.remove(); });
  var wrappers = el.messagesContainer.querySelectorAll('.message-wrapper');
  var lastDateStr = null;
  wrappers.forEach(function(w) {
    var ts = parseInt(w.dataset.messageTime, 10);
    var d = new Date(ts); var ds = d.toDateString();
    if (ds !== lastDateStr) { w.parentNode.insertBefore(createDateSeparator(d), w); lastDateStr = ds; }
  });
}


/* REACTIONS */
function toggleReaction(msgId, emoji) {
  if (!currentUser || !msgId) return;
  var msg = allMessages.find(function(m){ return m.id === msgId; });
  if (!msg) return;
  
  var reactions = JSON.parse(JSON.stringify(msg.reactions || {}));
  var uids = reactions[emoji] ? reactions[emoji].slice() : [];
  var idx = uids.indexOf(currentUser.uid);
  
  if (idx >= 0) {
    uids.splice(idx, 1);
    if (uids.length === 0) { delete reactions[emoji]; }
    else { reactions[emoji] = uids; }
  } else {
    Object.keys(reactions).forEach(function(e) {
      var arr = reactions[e] ? reactions[e].slice() : [];
      var i = arr.indexOf(currentUser.uid);
      if (i >= 0) { arr.splice(i, 1); }
      if (arr.length === 0) { delete reactions[e]; }
      else { reactions[e] = arr; }
    });
    uids = [currentUser.uid];
    reactions[emoji] = uids;
  }
  
  var msgIndex = allMessages.findIndex(function(m){ return m.id === msgId; });
  if (msgIndex >= 0) { allMessages[msgIndex].reactions = reactions; }
  
  var wrapper = el.messagesContainer ? el.messagesContainer.querySelector('[data-msg-id="' + msgId + '"]') : null;
  if (wrapper) { updateRenderedMessage(allMessages[msgIndex] || msg); }
  
  db.collection(MESSAGES_COLLECTION).doc(msgId).update({ reactions: reactions }).then(function() {
  }).catch(function(err) {
    console.error('Reaction error:', err);
    if (msgIndex >= 0) { allMessages[msgIndex].reactions = msg.reactions || {}; }
    if (wrapper) { updateRenderedMessage(allMessages[msgIndex] || msg); }
  });
}
function setReplyPreview(msg) {
  replyToMessage = msg;
  if (!el.replyPreview) return;
  var content = el.replyPreview.querySelector('.reply-preview-content');
  if (content) {
    var txt = msg.texto ? getPlainText(msg).substring(0, 60) : (msg.imageBase64 ? 'Imagen' : msg.audioBase64 ? 'Audio' : '');
    content.innerHTML = '<strong>' + escapeHtml(msg.autor || '') + '</strong>: ' + escapeHtml(txt);
  }
  el.replyPreview.style.display = 'flex';
}
function openReactionPicker(msg) {
  if (!el.reactionPicker || !el.reactionPickerContent) return;
  el.reactionPickerContent.innerHTML = '';
  
  var quickReactions = ['👍','❤️','😂','😮','😢','🙏','🔥'];
  quickReactions.forEach(function(emoji) {
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'reaction-item';
    btn.textContent = emoji;
    btn.setAttribute('aria-label', 'Reaccionar con ' + emoji);
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleReaction(msg.id, emoji);
      closeReactionPicker();
    });
    el.reactionPickerContent.appendChild(btn);
  });
  
  var moreBtn = document.createElement('button');
  moreBtn.type = 'button'; moreBtn.className = 'reaction-item reaction-item-add';
  moreBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  moreBtn.setAttribute('aria-label', 'Más reacciones');
  moreBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    showFullEmojiPicker(msg.id);
  });
  el.reactionPickerContent.appendChild(moreBtn);
  
  var wrapper = el.messagesContainer ? el.messagesContainer.querySelector('[data-msg-id="' + msg.id + '"]') : null;
  if (wrapper) {
    var rect = wrapper.getBoundingClientRect();
    var pickerWidth = Math.min(360, window.innerWidth - 32);
    var top, left;
    
    if (rect.top > 70) {
      top = rect.top - 56;
    } else {
      top = rect.bottom + 8;
    }
    top = Math.max(8, Math.min(top, window.innerHeight - 60));
    
    if (rect.left + rect.width / 2 > window.innerWidth / 2) {
      left = Math.max(8, rect.right - pickerWidth);
    } else {
      left = Math.max(8, Math.min(rect.left, window.innerWidth - pickerWidth - 8));
    }
    
    el.reactionPickerContent.style.top = top + 'px';
    el.reactionPickerContent.style.left = left + 'px';
    el.reactionPickerContent.style.maxWidth = pickerWidth + 'px';
  }
  
  el.reactionPicker.classList.remove('hidden');
  
  requestAnimationFrame(function() {
    document.addEventListener('click', closeReactionPicker, { once: true });
    document.addEventListener('contextmenu', closeReactionPicker, { once: true });
  });
}

function showFullEmojiPicker(msgId) {
  var overlay = document.createElement('div');
  overlay.className = 'reaction-picker';
  overlay.style.background = 'rgba(0,0,0,0.3)';
  
  var container = document.createElement('div');
  container.className = 'reaction-picker-content';
  container.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;top:auto;max-width:none;width:auto;max-height:50vh;overflow-y:auto;display:grid;grid-template-columns:repeat(8,1fr);gap:4px;padding:12px;border-radius:16px;animation:reactionPopIn 0.2s ease;';
  
  var allEmojis = ['😀','😂','😍','🥰','😘','❤️','🔥','👍','👏','🎉','💕','😭','🥺','🤔','💪','✨','🙌','😢','😡','🥳','😎','🤗','🤫','😱','💋','😇','🤩','💀','🙏','✨','🤯','😴','🤮','🤡','👻','💀','👽','🤖','💩','😸','🐶','🐱','🦄','🌺','🌸','🍕','🍔','🎸','⚽','🎯','🏆','💎','🌈','☀️','🌙','⭐'];
  
  allEmojis.forEach(function(emoji) {
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'reaction-item';
    btn.textContent = emoji;
    btn.style.cssText = 'font-size:1.5rem;min-height:44px;min-width:44px;';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleReaction(msgId, emoji);
      overlay.remove();
    });
    container.appendChild(btn);
  });
  
  overlay.appendChild(container);
  document.body.appendChild(overlay);
  
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });
  
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', handler);
    }
  });
}
function closeReactionPicker() {
  if (el.reactionPicker) el.reactionPicker.classList.add('hidden');
  if (el.reactionPickerContent) el.reactionPickerContent.innerHTML = '';
}
function clearReplyPreview() {
  replyToMessage = null;
  if (el.replyPreview) el.replyPreview.style.display = 'none';
}
function openEditModal(msgId, text) {
  editingMessageId = msgId;
  if (el.editModal) el.editModal.style.display = 'flex';
  if (el.editInput) { el.editInput.value = text; el.editInput.focus(); }
}
function closeEditModal() {
  editingMessageId = null;
  if (el.editModal) el.editModal.style.display = 'none';
}
function saveEdit() {
  if (!editingMessageId || !el.editInput) return;
  var text = el.editInput.value.trim();
  if (!text) return;
  var btn = el.editSaveBtn;
  if (btn) btn.disabled = true;
  encryptText(text).then(function(cipher) {
    return db.collection(MESSAGES_COLLECTION).doc(editingMessageId).update({ texto: cipher, editedAt: firebase.firestore.FieldValue.serverTimestamp() }).then(function() {
      var idx = allMessages.findIndex(function(m){ return m.id === editingMessageId; });
      if (idx >= 0) allMessages[idx].texto = cipher;
      if (!decryptedMap[editingMessageId]) decryptedMap[editingMessageId] = {};
      decryptedMap[editingMessageId].texto = text;
    });
  }).catch(function(){ showError('Error al editar'); }).then(function(){ if (btn) btn.disabled = false; closeEditModal(); });
}
function deleteMessage(msgId) {
  showConfirm('Eliminar este mensaje?').then(function(ok) {
    if (!ok) return;
    db.collection(MESSAGES_COLLECTION).doc(msgId).delete().catch(function(){ showError('Error al eliminar'); });
  });
}
function showContextMenu(e, msg, isSelf) {
  closeAllMenus();
  var menu = document.createElement('div');
  menu.className = 'custom-context-menu';
  menu.id = 'active-context-menu';
  var items = [
    { label: 'Responder', action: function(){ setReplyPreview(msg); } },
    { label: 'Reaccionar', action: function(){ openReactionPicker(msg); } }
  ];
  if (isSelf && msg.texto && !msg.audioBase64) items.push({ label: 'Editar', action: function(){ openEditModal(msg.id, getPlainText(msg)); } });
  if (isSelf) items.push({ label: 'Eliminar', action: function(){ deleteMessage(msg.id); }, danger: true });
    items.push({ label: 'Fijar', action: function(){ pinMessage(msg.id, getPlainText(msg) || '[Mensaje]', msg.autor || ''); } });
  if (!isSelf) items.push({ label: 'Destacar', action: function(){ toggleDestacado(msg.id); } });
  items.forEach(function(item) {
    var btn = document.createElement('button');
    btn.className = 'context-menu-item' + (item.danger ? ' danger' : '');
    btn.textContent = item.label;
    btn.addEventListener('click', function(e){ e.stopPropagation(); closeAllMenus(); item.action(); });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  var rect = (e.target.closest('.message-wrapper') || e.target).getBoundingClientRect();
  menu.style.top = Math.min(rect.top, window.innerHeight - 200) + 'px';
  menu.style.left = Math.min(e.clientX || rect.left, window.innerWidth - 180) + 'px';
}
function closeAllMenus() {
  document.querySelectorAll('.custom-context-menu').forEach(function(m){ m.remove(); });
}


/* SEARCH + LIGHTBOX + VOICE */
function toggleSearch() {
  if (!el.searchBar) return;
  var vis = el.searchBar.style.display === 'flex';
  el.searchBar.style.display = vis ? 'none' : 'flex';
  if (!vis && el.searchInput) el.searchInput.focus();
  if (vis && el.searchInput) { el.searchInput.value = ''; filterMessages(''); }
}
function filterMessages(q) {
  if (!el.messagesContainer) return;
  var allWrappers = el.messagesContainer.querySelectorAll('.message-wrapper');
  allWrappers.forEach(function(w) { w.style.display = ''; w.classList.remove('search-highlight'); });
  allWrappers.forEach(function(w) {
    w.querySelectorAll('.search-match').forEach(function(m) {
      m.outerHTML = m.textContent;
    });
  });
  if (!q) { updateSearchCount(0, 0); return; }
  var matches = [];
  allWrappers.forEach(function(w) {
    var text = (w.textContent || '').toLowerCase();
    var query = q.toLowerCase();
    if (text.indexOf(query) >= 0) { matches.push(w); }
    else { w.style.display = 'none'; }
  });
  matches.forEach(function(w) {
    highlightTextInElement(w, q);
    w.classList.add('search-highlight');
  });
  updateSearchCount(matches.length > 0 ? 1 : 0, matches.length);
  if (matches.length > 0) {
    matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  el._searchMatches = matches;
  el._searchIndex = 0;
}
function highlightTextInElement(el, query) {
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
  var nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(function(node) {
    var text = node.textContent;
    var lower = text.toLowerCase();
    var idx = lower.indexOf(query.toLowerCase());
    if (idx < 0) return;
    var before = text.substring(0, idx);
    var match = text.substring(idx, idx + query.length);
    var after = text.substring(idx + query.length);
    var span = document.createElement('span');
    span.className = 'search-match';
    span.style.cssText = 'background:#fbbf24;color:#000;padding:0 1px;border-radius:2px;';
    span.textContent = match;
    var parent = node.parentNode;
    if (before) parent.insertBefore(document.createTextNode(before), node);
    parent.insertBefore(span, node);
    if (after) parent.insertBefore(document.createTextNode(after), node);
    parent.removeChild(node);
  });
}
function updateSearchCount(current, total) {
  var existing = el.searchBar ? el.searchBar.querySelector('.search-count') : null;
  if (total === 0) { if (existing) existing.remove(); return; }
  if (!existing) {
    existing = document.createElement('span');
    existing.className = 'search-count';
    if (el.searchBar) el.searchBar.appendChild(existing);
  }
  existing.textContent = current + '/' + total;
}
function searchNext() {
  if (!el._searchMatches || el._searchMatches.length === 0) return;
  el._searchIndex = (el._searchIndex + 1) % el._searchMatches.length;
  el._searchMatches[el._searchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
  updateSearchCount(el._searchIndex + 1, el._searchMatches.length);
}
function searchPrev() {
  if (!el._searchMatches || el._searchMatches.length === 0) return;
  el._searchIndex = (el._searchIndex - 1 + el._searchMatches.length) % el._searchMatches.length;
  el._searchMatches[el._searchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
  updateSearchCount(el._searchIndex + 1, el._searchMatches.length);
}
function openLightbox(src) {
  var ov = document.createElement('div');
  ov.className = 'lightbox-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:9999;display:flex;align-items:center;justify-content:center';
  var img = document.createElement('img');
  img.src = src; img.style.cssText = 'max-width:95%;max-height:95%;object-fit:contain;border-radius:4px';
  ov.appendChild(img);
  var cb = document.createElement('button');
  cb.textContent = 'X'; cb.style.cssText = 'position:absolute;top:16px;right:16px;background:none;color:#fff;font-size:24px;border:none;cursor:pointer';
  cb.addEventListener('click', function(e) { e.stopPropagation(); ov.remove(); });
  ov.appendChild(cb);
  ov.addEventListener('click', function() { ov.remove(); });
  document.body.appendChild(ov);
}
var mediaStream = null;
function startVoiceRecording() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    mediaStream = stream;
    var mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    state.mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
    state.audioChunks = [];
    state.recordingSeconds = 0;
    state.voiceCancelled = false;
    state.mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) state.audioChunks.push(e.data); };
    state.mediaRecorder.onstop = function() {
      if (!state.voiceCancelled && state.audioChunks.length > 0) sendAudioMessage(state.audioChunks, mime);
      cleanupVoiceRecording();
    };
    state.mediaRecorder.start();
    if (el.voiceIndicator) el.voiceIndicator.style.display = 'flex';
    if (el.voiceBtn) el.voiceBtn.setAttribute('aria-pressed', 'true');
    state.recordingTimer = setInterval(function() {
      state.recordingSeconds++;
      if (el.voiceRecTime) el.voiceRecTime.textContent = Math.floor(state.recordingSeconds / 60) + ':' + String(state.recordingSeconds % 60).padStart(2, '0');
      var pct = Math.min(100, (state.recordingSeconds / 60) * 100);
      var fill = document.getElementById('voice-rec-progress-fill');
      if (fill) fill.style.width = pct + '%';
      if (state.recordingSeconds >= 60) stopVoiceRecording();
    }, 1000);
  }).catch(function(err) { console.error('Mic error:', err); showError('No se pudo acceder al microfono'); });
}
function stopVoiceRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') state.mediaRecorder.stop();
}
function cancelVoiceRecording() { state.voiceCancelled = true; stopVoiceRecording(); }
function cleanupVoiceRecording() {
  if (state.recordingTimer) { clearInterval(state.recordingTimer); state.recordingTimer = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(function(t){ t.stop(); }); mediaStream = null; }
  state.mediaRecorder = null; state.audioChunks = []; state.recordingSeconds = 0;
  if (el.voiceIndicator) el.voiceIndicator.style.display = 'none';
  if (el.voiceBtn) el.voiceBtn.setAttribute('aria-pressed', 'false');
}


/* IMAGE HANDLING */
function showImageOptionsModal() { if (el.imageOptionsModal) el.imageOptionsModal.style.display = 'flex'; }
function hideImageOptionsModal() { if (el.imageOptionsModal) el.imageOptionsModal.style.display = 'none'; }
function showImagePreviewModal(files) {
  pendingImageFiles = Array.from(files);
  pendingImagePreviews = [];
  if (!el.imagePreviewContainer || !el.imagePreviewModal) return;
  el.imagePreviewContainer.innerHTML = '';
  pendingImageFiles.forEach(function(file, i) {
    var reader = new FileReader();
    reader.onload = function(e) {
      pendingImagePreviews.push(e.target.result);
      var thumb = document.createElement('div');
      thumb.className = 'preview-thumb';
      thumb.style.cssText = 'position:relative;display:inline-block;margin:4px';
      var img = document.createElement('img');
      img.src = e.target.result; img.style.cssText = 'max-width:150px;max-height:150px;border-radius:8px';
      thumb.appendChild(img);
      var rb = document.createElement('button');
      rb.textContent = 'X'; rb.style.cssText = 'position:absolute;top:2px;right:2px;background:red;color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:12px';
      rb.addEventListener('click', function() { pendingImageFiles.splice(i, 1); thumb.remove(); });
      thumb.appendChild(rb);
      el.imagePreviewContainer.appendChild(thumb);
    };
    reader.readAsDataURL(file);
  });
  el.imagePreviewModal.style.display = 'flex';
}
function hideImagePreviewModal() {
  pendingImageFiles = []; pendingImagePreviews = [];
  if (el.imagePreviewModal) el.imagePreviewModal.style.display = 'none';
  if (el.imagePreviewContainer) el.imagePreviewContainer.innerHTML = '';
  if (el.imageCaptionInput) el.imageCaptionInput.value = '';
}
function sendPendingImages() {
  if (pendingImageFiles.length === 0) return;
  var caption = el.imageCaptionInput ? el.imageCaptionInput.value.trim() : '';
  pendingImageFiles.forEach(function(file, i) {
    compressImageToBase64(file).then(function(r) {
      sendImageMessage(r.base64, r.blurPlaceholder, r.width, r.height, i === 0 ? caption : '');
    }).catch(function() { showError('Error al enviar imagen'); });
  });
  hideImagePreviewModal();
}

/* EMOJI PICKER */
function toggleEmojiPicker() {
  if (!el.emojiPicker) return;
  var vis = !el.emojiPicker.classList.contains('hidden');
  if (vis) {
    el.emojiPicker.classList.add('hidden');
  } else {
    el.emojiPicker.innerHTML = '';
    ['😀','😂','😍','🥰','😘','❤️','🔥','👍','👏','🎉','💕','😭','🥺','🤔','💪','✨','🙌','😢','😡','🥳','😎','🤗','🤫','😱','💋','😇','🤩','💀','🙏','✨'].forEach(function(e) {
      var btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = e; btn.className = 'emoji-item';
      btn.addEventListener('click', function() {
        if (el.messageInput) { el.messageInput.value += e; el.messageInput.focus(); }
        el.emojiPicker.classList.add('hidden');
      });
      el.emojiPicker.appendChild(btn);
    });
    el.emojiPicker.classList.remove('hidden');
  }
}

/* PROFILES */
function loadMyProfile() {
  if (!currentUser) return;
  db.collection(USERS_COLLECTION).doc(currentUser.uid).get().then(function(doc) {
    if (doc.exists) { var d = doc.data(); myProfile = { username: d.username || '', avatarBase64: d.avatarBase64 || '', bio: d.bio || '' }; }
  }).catch(function(){});
}
function loadPartnerProfile() {
  var partner = getPartnerConfig();
  if (!partner) return;
  db.collection(USERS_COLLECTION).where('uid', '!=', currentUser.uid).limit(1).get().then(function(snap) {
    if (!snap.empty) { var d = snap.docs[0].data(); partnerProfile = { username: d.username || partner.name, avatarBase64: d.avatarBase64 || '', bio: d.bio || '' }; }
    else { partnerProfile = { username: partner.name, avatarBase64: '', bio: '' }; }
    updateMyProfileUI(); updatePartnerProfileUI(); updateHeaderBadge(null);
  }).catch(function(){ partnerProfile = { username: partner.name, avatarBase64: '', bio: '' }; updateMyProfileUI(); updatePartnerProfileUI(); });
}
function updateMyProfileUI() {
  if (el.profileNameInput) el.profileNameInput.value = myProfile.username || '';
  if (el.profileBioInput) el.profileBioInput.value = myProfile.bio || '';
  if (el.profileAvatar) {
    if (myProfile.avatarBase64) { el.profileAvatar.style.backgroundImage = 'url(' + myProfile.avatarBase64 + ')'; el.profileAvatar.classList.remove('placeholder'); }
    else { el.profileAvatar.style.backgroundImage = ''; el.profileAvatar.classList.add('placeholder'); }
  }
}
function updatePartnerProfileUI() {
  if (el.partnerProfileName) el.partnerProfileName.textContent = partnerProfile.username || 'Mi Amor';
  if (el.partnerProfileBio) el.partnerProfileBio.textContent = partnerProfile.bio || '';
  if (el.partnerProfileAvatar && partnerProfile.avatarBase64) el.partnerProfileAvatar.style.backgroundImage = 'url(' + partnerProfile.avatarBase64 + ')';
  updateHeaderPartnerAvatar();
}
function updateHeaderPartnerAvatar() {
  var name = partnerProfile.username || getPartnerConfig().name || 'Mi Amor';
  var avatar = partnerProfile.avatarBase64 || '';
  var img = document.getElementById('header-partner-img');
  var initial = document.getElementById('header-partner-initial');
  var headerName = document.getElementById('header-partner-name');
  if (headerName) headerName.textContent = name;
  if (avatar && img) {
    img.src = avatar;
    img.style.display = 'block';
    if (initial) initial.style.display = 'none';
  } else if (initial) {
    initial.textContent = name.charAt(0).toUpperCase();
    initial.style.display = 'flex';
    if (img) img.style.display = 'none';
  }
}
function saveProfile() {
  if (!currentUser) return;
  var name = el.profileNameInput ? el.profileNameInput.value.trim() : '';
  var bio = el.profileBioInput ? el.profileBioInput.value.trim() : '';
  myProfile.username = name; myProfile.bio = bio;
  db.collection(USERS_COLLECTION).doc(currentUser.uid).set({
    username: name, bio: bio, avatarBase64: myProfile.avatarBase64,
    uid: currentUser.uid, email: currentUser.email,
    lastActive: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).then(function() {
    if (name) username = name;
    showSuccess('Perfil guardado');
  }).catch(function(){ showError('Error al guardar perfil'); });
}


/* SETTINGS + DESTACADOS */
function openSettingsModal() {
  if (el.settingsModal) el.settingsModal.style.display = 'flex';
  updateMyProfileUI(); updatePartnerProfileUI(); loadStats();
  if (el.anniversaryInput) el.anniversaryInput.value = anniversaryDate || '';
  if (el.giphyKeyInput) el.giphyKeyInput.value = '';
  updateE2eeStatusUI();
}
function closeSettingsModal() { if (el.settingsModal) el.settingsModal.style.display = 'none'; }
function loadStats() {
  if (!el.statTotal) return;
  el.statTotal.textContent = allMessages.length;
  var mine = allMessages.filter(function(m){ return m.uid === (currentUser && currentUser.uid); }).length;
  if (el.statMine) el.statMine.textContent = mine;
  if (el.statPartner) el.statPartner.textContent = allMessages.length - mine;
  if (el.statImages) el.statImages.textContent = allMessages.filter(function(m){ return m.imageBase64; }).length;
  if (el.statAudios) el.statAudios.textContent = allMessages.filter(function(m){ return m.audioBase64; }).length;
}
function startDestacadosListeners() {
  if (!currentUser) return;
  var mySlot = getAssignedUser();
  if (!mySlot) return;
  db.collection(DESTACADOS_COLLECTION).doc(mySlot).collection('items').onSnapshot(function(snap) {
    myDestacados = []; myDestacadoIds = new Set();
    snap.forEach(function(doc) { var d = Object.assign({}, doc.data(), { id: doc.id }); myDestacados.push(d); myDestacadoIds.add(doc.id); });
    if (el.destacadosCount) el.destacadosCount.textContent = myDestacados.length > 0 ? myDestacados.length : '';
  }, function(){});
  var partnerSlot = mySlot === 'user1' ? 'user2' : 'user1';
  db.collection(DESTACADOS_COLLECTION).doc(partnerSlot).collection('items').onSnapshot(function(snap) {
    partnerDestacados = []; partnerDestacadoIds = new Set();
    snap.forEach(function(doc) { var d = Object.assign({}, doc.data(), { id: doc.id }); partnerDestacados.push(d); partnerDestacadoIds.add(doc.id); });
  }, function(){});
}
function startPartnerShareSettingListener() {
  var partner = getPartnerConfig();
  if (!partner) return;
  db.collection(SETTINGS_COLLECTION).doc(partner.key).onSnapshot(function(doc) {
    if (doc.exists) {
      partnerShares = doc.data().shareDestacados === true;
      if (el.partnerDestacadosStatus) el.partnerDestacadosStatus.textContent = partnerShares ? 'Disponible' : 'No compartido';
    }
  }, function(){});
}
async function toggleDestacado(msgId) {
  if (!currentUser || !msgId) return;
  var mySlot = getAssignedUser();
  if (!mySlot) return;
  var ref = db.collection(DESTACADOS_COLLECTION).doc(mySlot).collection('items').doc(msgId);
  if (myDestacadoIds.has(msgId)) { ref.delete().catch(function(){}); }
  else {
    var msg = allMessages.find(function(m){ return m.id === msgId; });
    if (msg) {
      var cipher = await encryptText(getPlainText(msg));
      ref.set({ texto: cipher, imageBase64: msg.imageBase64 || null, autor: msg.autor || '', timestamp: msg.timestamp || Date.now(), createdAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(function(){});
    }
  }
}
function toggleShareDestacados() {
  var mySlot = getAssignedUser();
  if (!mySlot || !el.shareDestacadosToggle) return;
  myShareDestacados = el.shareDestacadosToggle.checked;
  db.collection(SETTINGS_COLLECTION).doc(mySlot).set({ shareDestacados: myShareDestacados }, { merge: true }).catch(function(){});
}
async function showDestacadosModal(type) {
  if (!el.destacadosModal || !el.destacadosList) return;
  el.destacadosList.innerHTML = '';
  var title = el.destacadosModal.querySelector('.destacados-title');
  var items = type === 'my' ? myDestacados : partnerDestacados;
  if (title) title.textContent = type === 'my' ? 'Mis destacados' : 'Destacados de mi pareja';
  if (items.length === 0) { el.destacadosList.innerHTML = '<p style="text-align:center;padding:20px;color:#999">No hay destacados</p>'; }
  else {
    var resolved = await Promise.all(items.map(async function(d) {
      return { d: d, texto: isEncryptedText(d.texto) ? await decryptText(d.texto) : (d.texto || '') };
    }));
    resolved.forEach(function(it) {
      var card = document.createElement('div'); card.className = 'destacado-card';
      card.innerHTML = '<div class="destacado-card-text">' + escapeHtml(it.texto) + '</div><span class="destacado-card-time">' + timeAgo(it.d.timestamp) + '</span>';
      card.addEventListener('click', function() { scrollToMessage(it.d.id); hideDestacadosModal(); });
      el.destacadosList.appendChild(card);
    });
  }
  el.destacadosModal.style.display = 'flex';
}
function hideDestacadosModal() { if (el.destacadosModal) el.destacadosModal.style.display = 'none'; }
function scrollToMessage(msgId) {
  var w = el.messagesContainer ? el.messagesContainer.querySelector('[data-msg-id="' + msgId + '"]') : null;
  if (w) { w.scrollIntoView({ behavior: 'smooth', block: 'center' }); w.classList.add('highlight-flash'); setTimeout(function(){ w.classList.remove('highlight-flash'); }, 2000); }
}

/* DRAG & DROP */
function handleDragOver(e) { e.preventDefault(); var o = document.getElementById('drag-drop-overlay'); if (o) o.style.display = 'flex'; }
function handleDragLeave() { var o = document.getElementById('drag-drop-overlay'); if (o) o.style.display = 'none'; }
function handleDrop(e) {
  e.preventDefault(); var o = document.getElementById('drag-drop-overlay'); if (o) o.style.display = 'none';
  var files = e.dataTransfer.files;
  if (files.length > 0) { var imgs = Array.from(files).filter(function(f){ return f.type.startsWith('image/'); }); if (imgs.length > 0) showImagePreviewModal(imgs); }
}


/* ============================================
   DOMContentLoaded - ALL EVENT LISTENERS
   ============================================ */
document.addEventListener('DOMContentLoaded', function() {
  el = {
    messagesContainer: document.getElementById('messages-container'),
    welcomeMessage: document.getElementById('welcome-message'),
    chatForm: document.getElementById('chat-form'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    emojiBtn: document.getElementById('emoji-btn'),
    emojiPicker: document.getElementById('emoji-picker'),
    imageBtn: document.getElementById('image-btn'),
    imageInputCamera: document.getElementById('image-input-camera'),
    imageInputGallery: document.getElementById('image-input-gallery'),
    imageOptionsModal: document.getElementById('image-options-modal'),
    imagePreviewModal: document.getElementById('image-preview-modal'),
    imagePreviewContainer: document.getElementById('image-preview-container'),
    imageCaptionInput: document.getElementById('image-caption-input'),
    userBadge: document.getElementById('user-badge'),
    pendingIndicator: document.getElementById('pending-indicator'),
    voiceBtn: document.getElementById('voice-btn'),
    voiceIndicator: document.getElementById('voice-recording-indicator'),
    voiceRecTime: document.getElementById('voice-rec-time'),
    pinnedBtn: document.getElementById('pinned-btn'),
    pinnedBanner: document.getElementById('pinned-banner'),
    pinnedContent: document.getElementById('pinned-content'),
    pinnedPreview: document.getElementById('pinned-preview'),
    pinnedCount: document.getElementById('pinned-count'),
    pinnedList: document.getElementById('pinned-list'),
    pinnedCloseBtn: document.getElementById('pinned-close-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    settingsCloseBtn: document.getElementById('settings-close-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
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
    reactionPickerContent: document.querySelector('#reaction-picker .reaction-picker-content'),
    chatInputArea: document.querySelector('.chat-input-area'),
    loginScreen: document.getElementById('login-screen'),
    loginForm: document.getElementById('login-form'),
    loginPassword: document.getElementById('login-password'),
    loginError: document.getElementById('login-error'),
    loginSubmitBtn: document.getElementById('login-submit-btn'),
    chatContainer: document.getElementById('chat-container'),
    logoutBtn: document.getElementById('logout-btn'),
    profileAvatar: document.getElementById('profile-avatar'),
    profileAvatarInput: document.getElementById('profile-avatar-input'),
    profileNameInput: document.getElementById('profile-name-input'),
    profileBioInput: document.getElementById('profile-bio-input'),
    profileSaveBtn: document.getElementById('profile-save-btn'),
    profileCancelBtn: document.getElementById('profile-cancel-btn'),
    partnerProfileAvatar: document.getElementById('partner-profile-avatar'),
    partnerProfileName: document.getElementById('partner-profile-name'),
    partnerProfileBio: document.getElementById('partner-profile-bio'),
    headerPartnerImg: document.getElementById('header-partner-img'),
    headerPartnerInitial: document.getElementById('header-partner-initial'),
    themeSelect: document.getElementById('theme-select'),
    myDestacadosBtn: document.getElementById('my-destacados-btn'),
    partnerDestacadosBtn: document.getElementById('partner-destacados-btn'),
    destacadosModal: document.getElementById('destacados-modal'),
    destacadosCloseBtn: document.getElementById('destacados-close-btn'),
    destacadosList: document.getElementById('destacados-list'),
    destacadosCount: document.getElementById('destacados-count'),
    partnerDestacadosStatus: document.getElementById('partner-destacados-status'),
    shareDestacadosToggle: document.getElementById('share-destacados-toggle'),
    statTotal: document.getElementById('stat-total'),
    statMine: document.getElementById('stat-mine'),
    statPartner: document.getElementById('stat-partner'),
    statImages: document.getElementById('stat-images'),
    statAudios: document.getElementById('stat-audios'),
    optionCamera: document.getElementById('option-camera'),
    optionGallery: document.getElementById('option-gallery'),
    imageOptionsCancel: document.getElementById('image-options-cancel'),
    previewCloseBtn: document.getElementById('preview-close-btn'),
    previewCancelBtn: document.getElementById('preview-cancel-btn'),
    previewSendBtn: document.getElementById('preview-send-btn'),
    gifBtn: document.getElementById('gif-btn'),
    anniversaryChip: document.getElementById('anniversary-chip'),
    anniversaryInput: document.getElementById('anniversary-input'),
    anniversarySaveBtn: document.getElementById('anniversary-save-btn'),
    wishlistBtn: document.getElementById('wishlist-btn'),
    wishlistModal: document.getElementById('wishlist-modal'),
    wishlistCloseBtn: document.getElementById('wishlist-close-btn'),
    wishlistInput: document.getElementById('wishlist-input'),
    wishlistAddBtn: document.getElementById('wishlist-add-btn'),
    wishlistList: document.getElementById('wishlist-list'),
    wishlistCount: document.getElementById('wishlist-count'),
    e2eeSaveBtn: document.getElementById('e2ee-save-btn'),
    e2eeDisableBtn: document.getElementById('e2ee-disable-btn'),
    exportTxtBtn: document.getElementById('export-txt-btn'),
    exportPdfBtn: document.getElementById('export-pdf-btn'),
    giphyKeyInput: document.getElementById('giphy-key-input'),
    giphySaveBtn: document.getElementById('giphy-save-btn')
  };

  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  initTheme();

  /* STATIC ICONS */
  renderIcon(document.querySelector('.welcome-icon'), 'messageCircle');
  renderIcon(document.querySelector('.drag-drop-icon'), 'upload');
  renderIcon(document.querySelector('.scroll-icon'), 'arrowDown');
  renderIcon(el.imageBtn && el.imageBtn.querySelector('.btn-media-inner'), 'image');
  renderIcon(el.pinnedBtn && el.pinnedBtn.querySelector('.btn-icon-inner'), 'pin');
  renderIcon(el.searchToggleBtn && el.searchToggleBtn.querySelector('.btn-icon-inner'), 'search');
  renderIcon(el.settingsBtn && el.settingsBtn.querySelector('.btn-icon-inner'), 'settings');
  renderIcon(el.refreshBtn && el.refreshBtn.querySelector('.btn-icon-inner'), 'sync');
  renderIcon(el.settingsCloseBtn && el.settingsCloseBtn.querySelector('.btn-icon'), 'close');
  renderIcon(el.emojiBtn && el.emojiBtn.querySelector('.btn-emoji-inner'), 'emoji');
  renderIcon(el.voiceBtn && el.voiceBtn.querySelector('.btn-voice-inner'), 'mic');
  renderIcon(el.sendBtn && el.sendBtn.querySelector('.btn-send-inner'), 'send');
  renderIcon(el.pinnedCloseBtn && el.pinnedCloseBtn.querySelector('span'), 'close');
  renderIcon(el.searchCloseBtn && el.searchCloseBtn.querySelector('span'), 'close');
  var rpi = el.replyPreview && el.replyPreview.querySelector('.reply-preview-close span');
  if (rpi) renderIcon(rpi, 'close');

  /* LOGIN */
  if (el.loginForm) el.loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var pw = el.loginPassword ? el.loginPassword.value.trim() : '';
    if (!pw) { if (el.loginError) { el.loginError.textContent = 'Ingresa la clave'; el.loginError.style.display = 'block'; } return; }
    if (el.loginError) el.loginError.style.display = 'none';
    if (el.loginSubmitBtn) { el.loginSubmitBtn.disabled = true; el.loginSubmitBtn.querySelector('.btn-text').textContent = 'Entrando...'; }
    tryLoginWithPassword(pw).catch(function(err) {
      console.error('Login error:', err);
      if (el.loginError) { el.loginError.textContent = 'Clave incorrecta'; el.loginError.style.display = 'block'; }
      if (el.loginSubmitBtn) { el.loginSubmitBtn.disabled = false; el.loginSubmitBtn.querySelector('.btn-text').textContent = 'Entrar'; }
      if (el.loginPassword) el.loginPassword.value = '';
    });
  });

  auth.onAuthStateChanged(function(user) { checkUserAccess(user); });
  tryAutoLogin();

  /* CHAT FORM */
  if (el.chatForm) el.chatForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var text = el.messageInput ? el.messageInput.value.trim() : '';
    if (!text || !currentUser) return;
    el.messageInput.value = '';
    sendMessage(text, null, null);
  });
  if (el.sendBtn) el.sendBtn.addEventListener('click', function(e) { e.preventDefault(); if (el.chatForm) el.chatForm.requestSubmit(); });
  if (el.messageInput) el.messageInput.addEventListener('input', handleTypingInput);

  /* IMAGES */
  if (el.imageBtn) el.imageBtn.addEventListener('click', showImageOptionsModal);
  if (el.optionCamera) el.optionCamera.addEventListener('click', function() { hideImageOptionsModal(); if (el.imageInputCamera) el.imageInputCamera.click(); });
  if (el.optionGallery) el.optionGallery.addEventListener('click', function() { hideImageOptionsModal(); if (el.imageInputGallery) el.imageInputGallery.click(); });
  if (el.imageOptionsCancel) el.imageOptionsCancel.addEventListener('click', hideImageOptionsModal);
  if (el.imageInputCamera) el.imageInputCamera.addEventListener('change', function(e) { if (e.target.files.length > 0) showImagePreviewModal(e.target.files); e.target.value = ''; });
  if (el.imageInputGallery) el.imageInputGallery.addEventListener('change', function(e) { if (e.target.files.length > 0) showImagePreviewModal(e.target.files); e.target.value = ''; });
  if (el.previewSendBtn) el.previewSendBtn.addEventListener('click', sendPendingImages);
  if (el.previewCancelBtn) el.previewCancelBtn.addEventListener('click', hideImagePreviewModal);
  if (el.previewCloseBtn) el.previewCloseBtn.addEventListener('click', hideImagePreviewModal);

  /* VOICE */
  var voiceTimer = null;
  if (el.voiceBtn) {
    el.voiceBtn.addEventListener('mousedown', function() { voiceTimer = setTimeout(startVoiceRecording, 300); });
    el.voiceBtn.addEventListener('mouseup', function() { clearTimeout(voiceTimer); if (state.mediaRecorder && state.mediaRecorder.state === 'recording') stopVoiceRecording(); });
    el.voiceBtn.addEventListener('mouseleave', function() { clearTimeout(voiceTimer); if (state.mediaRecorder && state.mediaRecorder.state === 'recording') stopVoiceRecording(); });
    el.voiceBtn.addEventListener('touchstart', function(e) { e.preventDefault(); voiceTimer = setTimeout(startVoiceRecording, 300); }, { passive: false });
    el.voiceBtn.addEventListener('touchend', function(e) { e.preventDefault(); clearTimeout(voiceTimer); if (state.mediaRecorder && state.mediaRecorder.state === 'recording') stopVoiceRecording(); });
  }
  var vrc = document.getElementById('voice-rec-cancel-btn');
  if (vrc) vrc.addEventListener('click', cancelVoiceRecording);

  /* EMOJI */
  if (el.emojiBtn) el.emojiBtn.addEventListener('click', toggleEmojiPicker);

  /* GIFS */
  if (el.gifBtn) el.gifBtn.addEventListener('click', toggleGifPicker);
  if (el.giphySaveBtn) el.giphySaveBtn.addEventListener('click', function() {
    var key = el.giphyKeyInput ? el.giphyKeyInput.value.trim() : '';
    if (!key) { showError('Pegá tu API key de GIPHY'); return; }
    try { localStorage.setItem(GIPHY_KEY_STORAGE, key); } catch (e) {}
    el.giphyKeyInput.value = '';
    showSuccess('API key de GIPHY guardada');
  });

  /* ANNIVERSARY */
  if (el.anniversarySaveBtn) el.anniversarySaveBtn.addEventListener('click', function() {
    var val = el.anniversaryInput ? el.anniversaryInput.value : '';
    if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val)) { showError('Elegí una fecha válida'); return; }
    db.collection('rooms').doc(ROOM_ID).set({ anniversary: val }, { merge: true }).then(function() {
      showSuccess('Aniversario guardado');
    }).catch(function(){ showError('No se pudo guardar'); });
  });

  /* WISHLIST */
  function openWishlistModal() {
    if (!el.wishlistModal) return;
    renderWishlistList();
    el.wishlistModal.style.display = 'flex';
    setTimeout(function() { if (el.wishlistInput) el.wishlistInput.focus(); }, 100);
  }
  if (el.wishlistBtn) el.wishlistBtn.addEventListener('click', openWishlistModal);
  if (el.wishlistCloseBtn) el.wishlistCloseBtn.addEventListener('click', hideWishlistModal);
  if (el.wishlistModal) el.wishlistModal.addEventListener('click', function(e) { if (e.target === el.wishlistModal) hideWishlistModal(); });
  if (el.wishlistAddBtn) el.wishlistAddBtn.addEventListener('click', addWishlistItem);
  if (el.wishlistInput) el.wishlistInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); addWishlistItem(); }
  });

  /* E2EE */
  if (el.e2eeSaveBtn) el.e2eeSaveBtn.addEventListener('click', function() {
    var input = document.getElementById('e2ee-pass-input');
    if (input) saveE2eePass(input.value);
  });
  if (el.e2eeDisableBtn) el.e2eeDisableBtn.addEventListener('click', function() {
    showConfirm('¿Desactivar el cifrado en este dispositivo? Los mensajes cifrados se verán como [🔒 Sin clave] hasta que actives la frase de nuevo.').then(function(ok) {
      if (ok) disableE2eeLocal();
    });
  });

  /* EXPORT */
  if (el.exportTxtBtn) el.exportTxtBtn.addEventListener('click', exportChatTxt);
  if (el.exportPdfBtn) el.exportPdfBtn.addEventListener('click', exportChatPdf);

  /* SEARCH */
  if (el.searchToggleBtn) el.searchToggleBtn.addEventListener('click', toggleSearch);
  if (el.searchInput) el.searchInput.addEventListener('input', function(e) { filterMessages(e.target.value); });
  if (el.searchCloseBtn) el.searchCloseBtn.addEventListener('click', toggleSearch);
  var searchPrevBtn = document.getElementById('search-prev-btn');
  var searchNextBtn = document.getElementById('search-next-btn');
  if (searchPrevBtn) { searchPrevBtn.textContent = '\u25C0'; searchPrevBtn.addEventListener('click', searchPrev); }
  if (searchNextBtn) { searchNextBtn.textContent = '\u25B6'; searchNextBtn.addEventListener('click', searchNext); }
  if (el.searchInput) el.searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) searchPrev(); else searchNext(); }
  });

  /* REPLY PREVIEW */
  if (el.replyPreview) { var rpx = el.replyPreview.querySelector('.reply-preview-close'); if (rpx) rpx.addEventListener('click', clearReplyPreview); }

  /* EDIT MODAL */
  if (el.editCancelBtn) el.editCancelBtn.addEventListener('click', closeEditModal);
  if (el.editSaveBtn) el.editSaveBtn.addEventListener('click', saveEdit);
  if (el.editModal) el.editModal.addEventListener('click', function(e) { if (e.target === el.editModal) closeEditModal(); });

  /* PINNED */
  if (el.pinnedBtn) el.pinnedBtn.addEventListener('click', function() {
    if (pinnedMessages.length > 0) { scrollToMessage(pinnedMessages[0].id); }
    else if (el.pinnedBanner) setPinnedBannerVisible(false);
  });
  if (el.pinnedContent) el.pinnedContent.addEventListener('click', function() {
    if (!el.pinnedBanner || el.pinnedBanner.classList.contains('hidden')) return;
    el.pinnedBanner.classList.toggle('expanded');
  });
  if (el.pinnedCloseBtn) el.pinnedCloseBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    pinnedDismissedSig = pinnedSignature();
    try { sessionStorage.setItem(PINNED_DISMISS_KEY, pinnedDismissedSig); } catch(err){}
    setPinnedBannerVisible(false);
  });

  /* SETTINGS */
  if (el.settingsBtn) el.settingsBtn.addEventListener('click', openSettingsModal);
  if (el.settingsCloseBtn) el.settingsCloseBtn.addEventListener('click', closeSettingsModal);
  if (el.settingsModal) el.settingsModal.addEventListener('click', function(e) { if (e.target === el.settingsModal) closeSettingsModal(); });
  if (el.refreshBtn) el.refreshBtn.addEventListener('click', softRefresh);
  if (el.logoutBtn) el.logoutBtn.addEventListener('click', function() { cleanupListeners(); auth.signOut().then(function() { showLoginScreen(); }); });

  /* PROFILE */
  if (el.profileSaveBtn) el.profileSaveBtn.addEventListener('click', saveProfile);
  if (el.profileCancelBtn) el.profileCancelBtn.addEventListener('click', updateMyProfileUI);
  if (el.profileAvatar) el.profileAvatar.addEventListener('click', function() { if (el.profileAvatarInput) el.profileAvatarInput.click(); });
  if (el.profileAvatarInput) el.profileAvatarInput.addEventListener('change', function(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) { myProfile.avatarBase64 = ev.target.result; updateMyProfileUI(); };
    reader.readAsDataURL(file);
  });

  /* DESTACADOS */
  if (el.myDestacadosBtn) el.myDestacadosBtn.addEventListener('click', function() { showDestacadosModal('my'); });
  if (el.partnerDestacadosBtn) el.partnerDestacadosBtn.addEventListener('click', function() { showDestacadosModal('partner'); });
  if (el.destacadosCloseBtn) el.destacadosCloseBtn.addEventListener('click', hideDestacadosModal);
  if (el.destacadosModal) el.destacadosModal.addEventListener('click', function(e) { if (e.target === el.destacadosModal) hideDestacadosModal(); });
  if (el.shareDestacadosToggle) el.shareDestacadosToggle.addEventListener('change', toggleShareDestacados);

  /* SCROLL */
  var loadingOlder = false;
  function loadOlderMessages() {
    if (loadingOlder || allMessages.length <= visibleCount) return;
    loadingOlder = true;
    var sc = el.messagesContainer;
    var prevHeight = sc.scrollHeight, prevTop = sc.scrollTop;
    visibleCount += 30;
    renderMessagesList();
    requestAnimationFrame(function() {
      sc.scrollTop = sc.scrollHeight - prevHeight + prevTop;
      loadingOlder = false;
    });
  }
  if (el.scrollToBottomBtn) el.scrollToBottomBtn.addEventListener('click', scrollToBottom);
  if (el.messagesContainer) el.messagesContainer.addEventListener('scroll', function() {
    if (isUserAtBottom()) { unreadCount = 0; updateScrollButton(); }
    if (el.messagesContainer.scrollTop < 80 && allMessages.length > visibleCount && !loadingOlder && firstSnapshotReceived) {
      loadOlderMessages();
    }
  });

/* ============================================
   WISHLIST / BUCKET LIST COMPARTIDA
   ============================================ */
var WISHLIST_COLLECTION = 'rooms/' + ROOM_ID + '/wishlist';
var wishlistUnsubscribe = null;
var wishlistItems = [];

function startWishlistListener() {
  if (!currentUser) return;
  if (wishlistUnsubscribe) { wishlistUnsubscribe(); wishlistUnsubscribe = null; }
  wishlistUnsubscribe = db.collection(WISHLIST_COLLECTION).onSnapshot(function(snap) {
    wishlistItems = [];
    snap.forEach(function(doc) { wishlistItems.push(Object.assign({}, doc.data(), { id: doc.id })); });
    wishlistItems.sort(function(a, b) { return (b.createdAtMs || b.createdAt || 0) - (a.createdAtMs || a.createdAt || 0); });
    if (el.wishlistCount) el.wishlistCount.textContent = wishlistItems.length > 0 ? wishlistItems.length : '';
    if (el.wishlistModal && el.wishlistModal.style.display === 'flex') renderWishlistList();
  }, function(){});
}
async function renderWishlistList() {
  if (!el.wishlistList) return;
  if (wishlistItems.length === 0) {
    el.wishlistList.innerHTML = '<p style="text-align:center;padding:20px;color:#999">Todavía no hay nada en la lista ✨</p>';
    return;
  }
  var resolved = await Promise.all(wishlistItems.map(async function(w) {
    return { w: w, texto: isEncryptedText(w.texto) ? await decryptText(w.texto) : (w.texto || '') };
  }));
  el.wishlistList.innerHTML = '';
  resolved.forEach(function(it) {
    var row = document.createElement('div');
    row.className = 'wishlist-item' + (it.w.done ? ' done' : '');
    var chk = document.createElement('input');
    chk.type = 'checkbox'; chk.className = 'wishlist-check';
    chk.checked = !!it.w.done;
    chk.addEventListener('change', function() { toggleWishlistItem(it.w.id, chk.checked); });
    var txt = document.createElement('span');
    txt.className = 'wishlist-text';
    txt.textContent = it.texto;
    var meta = document.createElement('span');
    meta.className = 'wishlist-meta';
    meta.textContent = it.w.createdBy || '';
    var del = document.createElement('button');
    del.type = 'button'; del.className = 'wishlist-del'; del.textContent = '\u2715';
    del.setAttribute('aria-label', 'Eliminar de la lista');
    del.addEventListener('click', function() { deleteWishlistItem(it.w.id); });
    row.appendChild(chk); row.appendChild(txt); row.appendChild(meta); row.appendChild(del);
    el.wishlistList.appendChild(row);
  });
}
async function addWishlistItem() {
  var input = el.wishlistInput;
  if (!input) return;
  var text = input.value.trim();
  if (!text || !currentUser) return;
  input.value = '';
  try {
    await db.collection(WISHLIST_COLLECTION).add({
      texto: await encryptText(text),
      done: false,
      createdBy: username || '',
      createdByUid: currentUser.uid,
      createdAtMs: Date.now(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { showError('No se pudo agregar'); }
}
function toggleWishlistItem(id, done) {
  db.collection(WISHLIST_COLLECTION).doc(id).update({ done: !!done }).catch(function(){ showError('No se pudo actualizar'); });
}
function deleteWishlistItem(id) {
  showConfirm('¿Eliminar este deseo de la lista?').then(function(ok) {
    if (ok) db.collection(WISHLIST_COLLECTION).doc(id).delete().catch(function(){ showError('No se pudo eliminar'); });
  });
}
function hideWishlistModal() { if (el.wishlistModal) el.wishlistModal.style.display = 'none'; }

/* ============================================
   ANIVERSARIO
   ============================================ */
var anniversaryDate = '';
var lastAnniversaryToastDay = null;
function renderAnniversaryChip() {
  var chip = el.anniversaryChip;
  if (!chip) return;
  if (!anniversaryDate) { chip.classList.add('hidden'); chip.style.display = 'none'; return; }
  var parts = anniversaryDate.split('-');
  if (parts.length !== 3) { chip.classList.add('hidden'); return; }
  var month = parseInt(parts[1], 10), day = parseInt(parts[2], 10);
  var today = new Date();
  var thisYear = new Date(today.getFullYear(), month - 1, day);
  var next = thisYear;
  if (thisYear < new Date(today.getFullYear(), today.getMonth(), today.getDate())) next = new Date(today.getFullYear() + 1, month - 1, day);
  var isToday = today.getMonth() === month - 1 && today.getDate() === day;
  chip.classList.remove('hidden');
  chip.style.display = 'inline-flex';
  var years = next.getFullYear() - parseInt(parts[0], 10);
  if (isToday) {
    chip.textContent = '💕 ¡Feliz aniversario!' + (years > 0 ? ' (' + years + ')' : '');
    var dayKey = today.toDateString();
    if (lastAnniversaryToastDay !== dayKey) {
      lastAnniversaryToastDay = dayKey;
      showSuccess('¡Feliz aniversario! 💕');
    }
  } else {
    var days = Math.ceil((next - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
    chip.textContent = '💕 Aniversario en ' + days + ' día' + (days === 1 ? '' : 's');
  }
}

/* ============================================
   EXPORTAR CHAT (TXT / PDF vía impresión)
   ============================================ */
function buildChatTranscriptLines() {
  var lines = ['Chat Pareja — Exportado ' + new Date().toLocaleString('es-ES'), ''];
  allMessages.forEach(function(m) {
    var d = new Date(m.timestamp || Date.now());
    var stamp = d.toLocaleDateString('es-ES') + ' ' + formatTime(m.timestamp);
    var body = getPlainText(m);
    var tags = [];
    if (m.imageBase64) tags.push('[Imagen]');
    if (m.imageGifUrl) tags.push('[GIF]');
    if (m.audioBase64) tags.push('[Audio]');
    if (tags.length) body += ' ' + tags.join(' ');
    lines.push('[' + stamp + '] ' + (m.autor || '?') + ': ' + body);
  });
  return lines;
}
function exportChatTxt() {
  if (!allMessages.length) { showError('No hay mensajes para exportar'); return; }
  var blob = new Blob([buildChatTranscriptLines().join('\r\n')], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'chat-pareja-' + new Date().toISOString().slice(0, 10) + '.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
  showSuccess('Chat exportado (.TXT)');
}
function exportChatPdf() {
  if (!allMessages.length) { showError('No hay mensajes para exportar'); return; }
  var rows = allMessages.map(function(m) {
    var d = new Date(m.timestamp || Date.now());
    var stamp = d.toLocaleDateString('es-ES') + ' ' + formatTime(m.timestamp);
    var body = escapeHtml(getPlainText(m));
    var tags = [];
    if (m.imageBase64) tags.push('<em>[Imagen]</em>');
    if (m.imageGifUrl) tags.push('<em>[GIF]</em>');
    if (m.audioBase64) tags.push('<em>[Audio]</em>');
    if (tags.length) body += ' ' + tags.join(' ');
    return '<tr><td class="t">' + escapeHtml(stamp) + '</td><td class="a">' + escapeHtml(m.autor || '?') + '</td><td>' + body + '</td></tr>';
  }).join('');
  var w = window.open('', '_blank');
  if (!w) { showError('Permití ventanas emergentes para imprimir'); return; }
  w.document.write(
    '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Chat Pareja — Conversación</title>' +
    '<style>body{font-family:Segoe UI,Arial,sans-serif;margin:28px;color:#111}h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:13px}' +
    'td{border-bottom:1px solid #e5e7eb;padding:7px 8px;vertical-align:top}td.t{white-space:nowrap;color:#667;width:130px}td.a{white-space:nowrap;font-weight:700;width:90px}' +
    '@media print{.noprint{display:none}}</style></head><body>' +
    '<h1>💕 Chat Pareja</h1><p>Exportado: ' + new Date().toLocaleString('es-ES') + '</p>' +
    '<table>' + rows + '</table>' +
    '<p class="noprint" style="margin-top:22px"><button onclick="window.print()" style="padding:10px 18px;font-size:14px">Imprimir / Guardar como PDF</button></p>' +
    '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})<\/script>' +
    '</body></html>'
  );
  w.document.close();
}

/* ============================================
   GIFS GIPHY (clave propia guardada localmente)
   ============================================ */
var GIPHY_KEY_STORAGE = 'chatpareja_giphy_key';
var gifPickerOverlay = null;
var gifSearchTimer = null;

function getGiphyKey() {
  try { return localStorage.getItem(GIPHY_KEY_STORAGE) || ''; } catch (e) { return ''; }
}
function toggleGifPicker() {
  if (!getGiphyKey()) { showError('Configura tu API key gratuita de GIPHY en Ajustes'); return; }
  if (gifPickerOverlay) { gifPickerOverlay.remove(); gifPickerOverlay = null; return; }
  gifPickerOverlay = document.createElement('div');
  gifPickerOverlay.className = 'gif-picker-overlay';
  var panel = document.createElement('div');
  panel.className = 'gif-picker-panel';
  var head = document.createElement('div');
  head.className = 'gif-picker-head';
  var search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Buscar GIFs...';
  search.className = 'gif-picker-search';
  var closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn-icon';
  closeBtn.innerHTML = '\u2715';
  closeBtn.setAttribute('aria-label', 'Cerrar GIFs');
  head.appendChild(search);
  head.appendChild(closeBtn);
  var grid = document.createElement('div');
  grid.className = 'gif-picker-grid';
  var hint = document.createElement('div');
  hint.className = 'gif-picker-hint';
  hint.textContent = 'Toca un GIF para enviarlo';
  panel.appendChild(head);
  panel.appendChild(grid);
  panel.appendChild(hint);
  gifPickerOverlay.appendChild(panel);
  document.body.appendChild(gifPickerOverlay);

  function loadFeed(q) {
    grid.innerHTML = '<div class="gif-loading">Cargando\u2026</div>';
    var key = getGiphyKey();
    var url = q
      ? 'https://api.giphy.com/v1/gifs/search?api_key=' + encodeURIComponent(key) + '&q=' + encodeURIComponent(q) + '&limit=24&rating=pg-13'
      : 'https://api.giphy.com/v1/gifs/trending?api_key=' + encodeURIComponent(key) + '&limit=24&rating=pg-13';
    fetch(url).then(function(r) { return r.json(); }).then(function(json) {
      grid.innerHTML = '';
      if (!json.data || !json.data.length) { grid.innerHTML = '<div class="gif-loading">Sin resultados</div>'; return; }
      json.data.forEach(function(g) {
        var img = document.createElement('img');
        img.src = g.images.fixed_width.url;
        img.alt = (g.title || 'GIF');
        img.loading = 'lazy';
        img.className = 'gif-thumb';
        img.addEventListener('click', function() {
          sendGifMessage(g.images.original.url, g.images.original.width, g.images.original.height);
          closeGifPicker();
        });
        grid.appendChild(img);
      });
    }).catch(function() {
      grid.innerHTML = '<div class="gif-loading">Error de red o API key inválida</div>';
    });
  }
  search.addEventListener('input', function() {
    clearTimeout(gifSearchTimer);
    gifSearchTimer = setTimeout(function() { loadFeed(search.value.trim()); }, 400);
  });
  function onEsc(e) {
    if (e.key === 'Escape') { closeGifPicker(); document.removeEventListener('keydown', onEsc); }
  }
  document.addEventListener('keydown', onEsc);
  closeBtn.addEventListener('click', closeGifPicker);
  gifPickerOverlay.addEventListener('click', function(e) { if (e.target === gifPickerOverlay) closeGifPicker(); });
  loadFeed('');
}
function closeGifPicker() {
  if (gifPickerOverlay) { gifPickerOverlay.remove(); gifPickerOverlay = null; }
  clearTimeout(gifSearchTimer);
}
function sendGifMessage(url, w, h) {
  sendMessage('', { gifUrl: true, url: url, w: parseInt(w, 10) || 0, h: parseInt(h, 10) || 0 }, null);
}

/* DRAG & DROP */
  if (el.messagesContainer) {
    el.messagesContainer.addEventListener('dragover', handleDragOver);
    el.messagesContainer.addEventListener('dragleave', handleDragLeave);
    el.messagesContainer.addEventListener('drop', handleDrop);
  }

  /* CLOSE MENUS ON CLICK OUTSIDE */
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.custom-context-menu') && !e.target.closest('.message-wrapper')) closeAllMenus();
    if (!e.target.closest('#reaction-picker') && !e.target.closest('.reaction-bubble') && !e.target.closest('.reaction-item')) { 
      closeReactionPicker();
    }
    if (!e.target.closest('#emoji-picker') && !e.target.closest('#emoji-btn')) { if (el.emojiPicker) el.emojiPicker.classList.add('hidden'); }
  });

  /* KEYBOARD */
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeAllMenus();
      closeReactionPicker();
      closeGifPicker();
      hideWishlistModal();
      if (el.emojiPicker) el.emojiPicker.classList.add('hidden');
      if (el.imageOptionsModal) el.imageOptionsModal.style.display = 'none';
      if (el.imagePreviewModal) el.imagePreviewModal.style.display = 'none';
      if (el.settingsModal) el.settingsModal.style.display = 'none';
      if (el.editModal) el.editModal.style.display = 'none';
      if (el.destacadosModal) el.destacadosModal.style.display = 'none';
      document.querySelectorAll('.lightbox-overlay').forEach(function(o){ o.remove(); });
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); toggleSearch(); }
  });

  /* ONLINE/OFFLINE */
  window.addEventListener('online', function() { isOnline = true; if (el.offlineBanner) el.offlineBanner.style.display = 'none'; flushOfflineQueue(); });
  window.addEventListener('offline', function() { isOnline = false; if (el.offlineBanner) el.offlineBanner.style.display = 'flex'; });
  if (!isOnline && el.offlineBanner) el.offlineBanner.style.display = 'flex';

  /* THEME CHANGE */
  if (el.themeSelect) el.themeSelect.addEventListener('change', function(e) { setTheme(e.target.value); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    var t = 'system'; try { t = localStorage.getItem('chatpareja_theme') || 'system'; } catch(e){} if (t === 'system') initTheme();
  });
});


