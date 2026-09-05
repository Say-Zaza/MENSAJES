/* FIREBASE CONFIG */
var firebaseConfig = {
  apiKey: "AIzaSyDiawpwZcAucYTqWDbqm04ydGqOJOzdY9M",
  authDomain: "race-master-3d-ee76f.firebaseapp.com",
  projectId: "race-master-3d-ee76f",
  storageBucket: "race-master-3d-ee76f.firebasestorage.app",
  messagingSenderId: "357557800287",
  appId: "1:357557800287:web:c4ef1b0b3a5854a55abaea"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var auth = firebase.auth();
db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
  console.warn('Firestore persistence failed:', err.code);
});

var ROOM_ID = 'general';
var MESSAGES_COLLECTION = 'rooms/' + ROOM_ID + '/messages';
var USERS_COLLECTION = 'rooms/' + ROOM_ID + '/users';
var DESTACADOS_COLLECTION = 'rooms/' + ROOM_ID + '/destacados';
var SETTINGS_COLLECTION = 'rooms/' + ROOM_ID + '/settings';
var TYPING_COLLECTION = 'rooms/' + ROOM_ID + '/typing';
var PAIRING_COLLECTION = 'rooms/' + ROOM_ID + '/pairing';
var PAIRING_CODE_KEY = 'chatpareja_pairing_code_' + ROOM_ID;
var PAIRING_CODE_TTL = 10 * 60 * 1000; // 10 min

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
var nativePickerOpenAt = 0;
var NATIVE_PICKER_GRACE_MS = 5 * 60 * 1000;
function markNativePickerOpen() { nativePickerOpenAt = Date.now(); }
function clearNativePickerFlag() { nativePickerOpenAt = 0; }
function returningFromNativePicker() {
  return nativePickerOpenAt > 0 && (Date.now() - nativePickerOpenAt) < NATIVE_PICKER_GRACE_MS;
}
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
var pendingViewOnce = false;
var pendingImagePreviews = [];
var CALENDAR_COLLECTION = 'rooms/' + ROOM_ID + '/calendar';
var REMINDERS_COLLECTION = 'rooms/' + ROOM_ID + '/reminders';
var calendarEvents = [];
var calendarMonth = new Date().getMonth();
var calendarYear = new Date().getFullYear();
var remindersItems = [];
var remindersTab = 'active';
var remindersUnsubscribe = null;
var calendarUnsubscribe = null;
var myDestacadosUnsubscribe = null;
var partnerDestacadosUnsubscribe = null;
var partnerShareSettingUnsubscribe = null;
var pairingState = 'checking'; // 'checking' | 'generate' | 'show_code' | 'enter_code' | 'paired' | 'full'
var pairingCode = null;
var pairingCodeExpires = 0;
var currentUserRole = null; // 'owner' | 'partner' | null
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
var _escapeDiv = document.createElement('div');
function escapeHtml(text) {
  _escapeDiv.textContent = text || '';
  return _escapeDiv.innerHTML;
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
var splashVisible = true;
function showError(msg) {
  if (splashVisible) return;
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
  if (splashVisible) return;
  var old = document.querySelector('.success-toast');
  if (old) old.remove();
  var t = document.createElement('div');
  t.className = 'success-toast';
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:10000';
  document.body.appendChild(t);
  setTimeout(function(){ t.remove(); }, 3000);
}
function showInfo(msg) {
  if (splashVisible) return;
  var old = document.querySelector('.info-toast');
  if (old) old.remove();
  var t = document.createElement('div');
  t.className = 'info-toast';
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#3b82f6;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:10000';
  document.body.appendChild(t);
  setTimeout(function(){ t.remove(); }, 3500);
}
function showReminderPopup(title, preMin) {
  if (splashVisible) return;
  var old = document.querySelector('.reminder-popup');
  if (old) old.remove();
  var p = document.createElement('div');
  p.className = 'reminder-popup';
  var icon = document.createElement('div');
  icon.className = 'reminder-popup-icon';
  icon.textContent = preMin ? '🔔' : '⏰';
  var body = document.createElement('div');
  body.className = 'reminder-popup-body';
  var label = document.createElement('div');
  label.className = 'reminder-popup-label';
  label.textContent = preMin ? ('Recordatorio · en ' + preMin + ' min') : 'Recordatorio · ahora';
  var name = document.createElement('div');
  name.className = 'reminder-popup-title';
  name.textContent = title || 'Recordatorio';
  body.appendChild(label);
  body.appendChild(name);
  var close = document.createElement('button');
  close.type = 'button';
  close.className = 'reminder-popup-close';
  close.textContent = '✕';
  var dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    p.classList.add('hide');
    setTimeout(function() { p.remove(); }, 320);
  }
  close.addEventListener('click', function(e) { e.stopPropagation(); dismiss(); });
  p.addEventListener('click', function() { dismiss(); if (typeof openRemindersModal === 'function') openRemindersModal(); });
  p.appendChild(icon);
  p.appendChild(body);
  p.appendChild(close);
  document.body.appendChild(p);
  setTimeout(dismiss, 9000);
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
  return auth.signInWithEmailAndPassword(ACCOUNTS.user1.email, pw).catch(function() {
    return auth.signInWithEmailAndPassword(ACCOUNTS.user2.email, pw);
  });
}
function showLoginScreen() {
  hidePrivacyOverlay();
  if (el.loginScreen) { el.loginScreen.style.display = 'flex'; }
  if (el.chatContainer) { el.chatContainer.style.display = 'none'; }
  if (el.loginSubmitBtn) { el.loginSubmitBtn.disabled = false; el.loginSubmitBtn.querySelector('.btn-text').textContent = 'Entrar'; }
  if (el.loginPassword) el.loginPassword.value = '';
  if (el.loginError) el.loginError.style.display = 'none';
}
function hideLoginScreen() {
  if (el.loginScreen) { el.loginScreen.style.display = 'none'; }
  if (el.chatContainer) { el.chatContainer.style.display = 'flex'; }
  var ss = document.getElementById('splash-screen');
  if (ss && !ss.classList.contains('hidden')) { ss.classList.add('hidden'); splashVisible = false; }
}
function showPrivacyOverlay() {
  var po = document.getElementById('privacy-overlay');
  if (po) po.classList.remove('hidden');
}
function hidePrivacyOverlay() {
  var po = document.getElementById('privacy-overlay');
  if (po) po.classList.add('hidden');
}
function softRefresh() {
  allMessages = [];
  renderedMessageIds = new Set();
  visibleCount = 40;
  loadMyProfile().then(function() {
    startMessagesListener();
    startPinnedListener();
    startTypingListener();
    startDestacadosListeners();
    startPartnerShareSettingListener();
    startWishlistListener();
    startCartasListener();
    startCalendarListener();
    startRemindersListener();
    if (isOnline && currentUser) { flushOfflineQueue(); flushCartasOfflineQueue(); }
    loadPartnerProfile();
    showSuccess('Chat sincronizado');
  });
}
function tryAutoLogin() {
  try { sessionStorage.removeItem('chatpareja_refresh_pw'); } catch(e){}
  return;
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
  var effective = theme;
  if (theme === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    r.setAttribute('data-theme', effective);
  } else {
    r.setAttribute('data-theme', theme);
  }
  // El CSS oscuro está keyeado en body.dark-mode
  document.body.classList.toggle('dark-mode', effective === 'dark');
}


/* ============================================
   OFFLINE QUEUE
   ============================================ */
var OFFLINE_QUEUE_KEY = 'chatpareja_offline';
function getOfflineQueue() { try { var d = localStorage.getItem(OFFLINE_QUEUE_KEY); return d ? JSON.parse(d) : []; } catch(e){ return []; } }
function saveOfflineQueue(q) { try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)); return true; } catch(e){ return false; } }
function addToOfflineQueue(data) {
  var q = getOfflineQueue();
  q.push(data);
  if (!saveOfflineQueue(q)) showError('Sin espacio en cola offline: conecta internet para enviar');
  updatePendingIndicator();
}
function updatePendingIndicator() {
  var q = getOfflineQueue();
  if (!el.pendingIndicator) return;
  if (!el.pendingIndicator._discardBound) {
    el.pendingIndicator._discardBound = true;
    el.pendingIndicator.style.cursor = 'pointer';
    el.pendingIndicator.title = 'Toca para descartar pendientes';
    el.pendingIndicator.addEventListener('click', function() {
      var qq = getOfflineQueue();
      if (!qq.length) return;
      showConfirm('Descartar ' + qq.length + ' mensaje(s) pendiente(s) que no se pudieron enviar?').then(function(ok) {
        if (!ok) return;
        saveOfflineQueue([]);
        updatePendingIndicator();
        showSuccess('Pendientes descartados');
      });
    });
  }
  if (q.length > 0) { el.pendingIndicator.textContent = q.length + ' pendiente' + (q.length > 1 ? 's' : ''); el.pendingIndicator.style.display = 'inline'; }
  else { el.pendingIndicator.style.display = 'none'; }
}
function flushOfflineQueue() {
  if (!isOnline || !currentUser) return;
  var q = getOfflineQueue();
  if (!q.length) return;
  var remaining = [];
  var promises = [];
  var droppedHeavy = 0, droppedRetries = 0;
  q.forEach(function(item) {
    var msgId = item.id || generateClientId();
    item.id = msgId;
    var attempts = item.__attempts || 0;
    delete item.__attempts;
    var size = 0;
    try { size = JSON.stringify(item).length; } catch(e){}
    if (size > 900000) { droppedHeavy++; return; }
    if (attempts >= 5) { droppedRetries++; return; }
    item.timestamp = firebase.firestore.FieldValue.serverTimestamp();
    var p = db.collection(MESSAGES_COLLECTION).doc(msgId).set(item).then(function() {
      return true;
    }).catch(function() {
      item.__attempts = attempts + 1;
      remaining.push(item);
      return false;
    });
    promises.push(p);
  });
  Promise.allSettled(promises).then(function() {
    saveOfflineQueue(remaining);
    updatePendingIndicator();
    if (droppedHeavy > 0) showError('Un mensaje era muy pesado y no se pudo enviar');
    else if (droppedRetries > 0) showError('Se descartó un pendiente que falló varias veces');
  });
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
        ind.innerHTML = '<span>' + escapeHtml(d.username || '') + ' está escribiendo</span><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
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
  ref.set({ online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp(), uid: currentUser.uid, username: username || '', email: currentUser.email }, { merge: true }).catch(function(){});
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
  partnerPresenceUnsubscribe = db.collection(USERS_COLLECTION).where('email', '==', partner.email).limit(1).onSnapshot(function(snap) {
    snap.forEach(function(doc) {
      var d = doc.data();
      partnerRealUid = doc.id;
      var online = d.online === true;
      updateHeaderBadge(online);
    });
  }, function(err){ console.error('Listener:', err && err.message); });
}
function updateHeaderBadge(partnerOnline) {
  var partner = getPartnerConfig();
  if (!partner || !el.userBadge) return;
  var status = partnerOnline === true ? ' - en linea' : partnerOnline === false ? ' - sin conexion' : '';
  var pName = partnerProfile.username || partner.name;
  el.userBadge.textContent = pName + status;
  el.userBadge.style.color = partner.color;
}

/* ============================================
    PINNED MESSAGES (max 3) — atómicos via arrayUnion/arrayRemove
    ============================================ */
var MAX_PINNED = 3;
var pinnedMessages = [];
var pinnedIndex = 0;
var PINNED_DISMISS_KEY = 'chatpareja_pins_dismissed_' + ROOM_ID;
var pinnedDismissedSig = null;
try { pinnedDismissedSig = sessionStorage.getItem(PINNED_DISMISS_KEY); } catch(e){}
function pinnedSignature() { return pinnedMessages.map(function(p){ return p.id; }).join(','); }
function currentPin() { return pinnedMessages[pinnedIndex] || null; }
function setPinnedBannerVisible(visible) {
  if (!el.pinnedBanner || el.pinnedBanner.classList.contains('hidden') === !visible) return;
  if (!visible) {
    el.pinnedBanner.classList.add('hiding');
    setTimeout(function() {
      el.pinnedBanner.classList.add('hidden');
      el.pinnedBanner.classList.remove('hiding');
      el.pinnedBanner.style.display = 'none';
    }, 180);
  } else {
    el.pinnedBanner.classList.remove('hidden', 'hiding');
    el.pinnedBanner.style.display = 'flex';
  }
}
function startPinnedListener() {
  if (pinnedUnsubscribe) pinnedUnsubscribe();
  pinnedUnsubscribe = db.collection('rooms').doc(ROOM_ID).onSnapshot(function(doc) {
    var data = doc.data() || {};
    var touchedIds = new Set();
    pinnedMessages.forEach(function(p){ touchedIds.add(p.id); });
    pinnedMessages = Array.isArray(data.pinnedMessages) ? data.pinnedMessages : [];
    pinnedMessages.forEach(function(p){ touchedIds.add(p.id); });
    anniversaryDate = typeof data.anniversary === 'string' ? data.anniversary : '';
    // Auto-desfijar huérfanos: mensaje eliminado o purgado por sync-service
    if (firstSnapshotReceived && allMessages.length > 0) {
      var orphans = pinnedMessages.filter(function(p) {
        return !allMessages.some(function(m){ return m.id === p.id; });
      });
      if (orphans.length) {
        var orphanIds = new Set(orphans.map(function(p){ return p.id; }));
        orphans.forEach(function(p){ unpinMessage(p.id, true); });
        pinnedMessages = pinnedMessages.filter(function(p){ return !orphanIds.has(p.id); });
        touchedIds = new Set(Array.from(touchedIds).filter(function(id){ return !orphanIds.has(id); }));
      }
    }
    if (pinnedIndex >= pinnedMessages.length) pinnedIndex = 0;
    renderAnniversaryChip();
    renderPinnedBanner();
    touchedIds.forEach(function(mid) {
      var m = allMessages.find(function(x){ return x.id === mid; });
      if (m) updateRenderedMessage(m);
    });
  }, function(err){ console.error('Listener:', err && err.message); });
}
async function pinMessage(msgId, text, autor) {
  if (!currentUser || !msgId) return;
  if (pinnedMessages.some(function(p){ return p.id === msgId; })) return;
  if (pinnedMessages.length >= MAX_PINNED) {
    showError('Ya tenés ' + MAX_PINNED + ' mensajes fijados, desfijá uno para continuar');
    return;
  }
  var srcMsg = allMessages.find(function(m){ return m.id === msgId; }) || {};
  var cipher = await encryptText((text || '').substring(0, 200));
  var newPin = {
    id: msgId,
    texto: cipher,
    autor: autor || '',
    pinnedAt: Date.now(),
    pinnedByUid: currentUser.uid,
    pinnedByName: username || '',
    hasImage: !!(srcMsg.imageBase64 || srcMsg.imageGifUrl),
    hasAudio: !!srcMsg.audioBase64
  };
  // arrayUnion es atómico en servidor: fijados simultáneos no se pisan
  db.collection('rooms').doc(ROOM_ID).set({
    pinnedMessages: firebase.firestore.FieldValue.arrayUnion(newPin)
  }, { merge: true })
    .then(function(){ showSuccess('Mensaje fijado \uD83D\uDCCC'); })
    .catch(function(err) { console.error('Pin error:', err); showError('Error al fijar'); });
}
function unpinMessage(msgId, silent) {
  var obj = pinnedMessages.find(function(p){ return p.id === msgId; });
  if (!obj) return;
  db.collection('rooms').doc(ROOM_ID).set({
    pinnedMessages: firebase.firestore.FieldValue.arrayRemove(obj)
  }, { merge: true })
    .then(function(){ if (!silent) showSuccess('Mensaje desfijado'); })
    .catch(function(err) { console.error('Unpin error:', err); if (!silent) showError('Error al desfijar'); });
}
function renderPinnedBanner() {
  var count = pinnedMessages.length;
  var sig = pinnedSignature();
  if (count === 0) {
    pinnedDismissedSig = null;
    try { sessionStorage.removeItem(PINNED_DISMISS_KEY); } catch(e){}
    setPinnedBannerVisible(false);
    if (el.pinnedPreview) el.pinnedPreview.textContent = '';
    if (el.pinnedCounter) el.pinnedCounter.classList.add('hidden');
    if (el.pinnedPrevBtn) el.pinnedPrevBtn.classList.add('hidden');
    if (el.pinnedNextBtn) el.pinnedNextBtn.classList.add('hidden');
    return;
  }
  if (sig === pinnedDismissedSig) { setPinnedBannerVisible(false); return; }
  setPinnedBannerVisible(true);
  var multi = count > 1;
  if (el.pinnedPrevBtn) el.pinnedPrevBtn.classList.toggle('hidden', !multi);
  if (el.pinnedNextBtn) el.pinnedNextBtn.classList.toggle('hidden', !multi);
  if (el.pinnedCounter) {
    el.pinnedCounter.textContent = (pinnedIndex + 1) + '/' + count;
    el.pinnedCounter.classList.toggle('hidden', !multi);
  }
  var pin = currentPin();
  if (!pin || !el.pinnedPreview) return;
  // Camino síncrono para texto plano (sin E2EE): cero carrera
  if (!isEncryptedText(pin.texto)) {
    var src0 = allMessages.find(function(m){ return m.id === pin.id; });
    var pre0 = (pin.hasImage || (src0 && (src0.imageBase64 || src0.imageGifUrl))) ? '\uD83D\uDDBC\uFE0F '
             : ((pin.hasAudio || (src0 && src0.audioBase64)) ? '\uD83C\uDFA4 ' : '');
    el.pinnedPreview.textContent = pre0 + (pin.texto || '[Mensaje]') + (pin.pinnedByName ? ' \u2014 por ' + pin.pinnedByName : '');
    return;
  }
  el.pinnedPreview.textContent = '\u2026';
  fillPinnedPreview(pin, count, sig);
}
async function fillPinnedPreview(pin, countAtCall, sigAtCall) {
  var prefix = '';
  var src = allMessages.find(function(m){ return m.id === pin.id; });
  var isImg = pin.hasImage || (src && (src.imageBase64 || src.imageGifUrl));
  var isAud = pin.hasAudio || (src && src.audioBase64);
  if (isImg) prefix = '\uD83D\uDDBC\uFE0F ';
  else if (isAud) prefix = '\uD83C\uDFA4 ';
  var texto = isEncryptedText(pin.texto) ? await decryptText(pin.texto) : (pin.texto || '[Mensaje]');
  // Guarda: si cambió la lista, el índice o el mensaje mientras decodificábamos, descartar
  var cur = currentPin();
  if (pinnedSignature() !== sigAtCall || countAtCall !== pinnedMessages.length || !cur || cur.id !== pin.id) return;
  var by = pin.pinnedByName ? ' \u2014 por ' + pin.pinnedByName : '';
  if (el.pinnedPreview) el.pinnedPreview.textContent = prefix + texto + by;
}


/* ============================================
   PAIRING — Solo 2 usuarios permitidos
   ============================================ */
function generatePairingCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function savePairingCodeLocal(code) {
  var data = { code: code, expires: Date.now() + PAIRING_CODE_TTL };
  try { localStorage.setItem(PAIRING_CODE_KEY, JSON.stringify(data)); } catch(e) {}
  pairingCode = code;
  pairingCodeExpires = data.expires;
}
function loadPairingCodeLocal() {
  try {
    var stored = localStorage.getItem(PAIRING_CODE_KEY);
    if (stored) {
      var data = JSON.parse(stored);
      if (data.expires > Date.now()) {
        pairingCode = data.code;
        pairingCodeExpires = data.expires;
        return data.code;
      } else {
        localStorage.removeItem(PAIRING_CODE_KEY);
      }
    }
  } catch(e) {}
  return null;
}
function clearPairingCodeLocal() {
  try { localStorage.removeItem(PAIRING_CODE_KEY); } catch(e) {}
  pairingCode = null;
  pairingCodeExpires = 0;
}
async function checkPairingStatus(uid) {
  try {
    var doc = await db.collection(PAIRING_COLLECTION).doc(uid).get();
    if (doc.exists) {
      var data = doc.data();
      currentUserRole = data.role || 'owner';
      if (data.pairedAt) return true;
      return false;
    }
    return false;
  } catch (e) {
    console.error('Error checking pairing status:', e);
    return false;
  }
}
async function getPairedUsersCount() {
  try {
    var snap = await db.collection(PAIRING_COLLECTION).get();
    return snap.size;
  } catch (e) {
    console.error('Error getting paired count:', e);
    return 2;
  }
}
async function createPairingAsOwner(uid) {
  var code = generatePairingCode();
  var batch = db.batch();
  var ownerRef = db.collection(PAIRING_COLLECTION).doc(uid);
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
  var ownerQuery = await db.collection(PAIRING_COLLECTION).where('code', '==', code).where('role', '==', 'owner').limit(1).get();
  if (ownerQuery.empty) {
    throw new Error('Código inválido o expirado');
  }
  var ownerDoc = ownerQuery.docs[0];
  var ownerUid = ownerDoc.id;
  var partnerQuery = await db.collection(PAIRING_COLLECTION).where('role', '==', 'partner').limit(1).get();
  if (!partnerQuery.empty) {
    throw new Error('Este chat ya tiene pareja emparejada');
  }
  var batch = db.batch();
  var partnerRef = db.collection(PAIRING_COLLECTION).doc(uid);
  batch.set(partnerRef, {
    role: 'partner',
    ownerUid: ownerUid,
    code: code,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    pairedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  batch.update(db.collection(PAIRING_COLLECTION).doc(ownerUid), {
    pairedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
  clearPairingCodeLocal();
  currentUserRole = 'partner';
  return true;
}
function showPairingModal(step) {
  var modal = document.getElementById('pairing-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  var steps = modal.querySelectorAll('.pairing-step');
  for (var i = 0; i < steps.length; i++) steps[i].classList.add('hidden');
  var stepEl = document.getElementById('pairing-step-' + step);
  if (stepEl) stepEl.classList.remove('hidden');
}
function hidePairingModal() {
  var modal = document.getElementById('pairing-modal');
  if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
}

/* ============================================
   AUTH + LOGIN + INIT
   ============================================ */
function checkUserAccess(user) {
  if (!user) { showLoginScreen(); return; }
  currentUser = user;
  var cfg = getUserConfig();
  if (!cfg) { showLoginScreen(); return; }
  db.collection(PAIRING_COLLECTION).doc(user.uid).get().then(function(doc) {
    if (doc.exists && doc.data().pairedAt) {
      currentUserRole = doc.data().role || 'owner';
      hidePairingModal();
      hideLoginScreen();
      initializeUser();
      return;
    }
    var isOwnerWaiting = doc.exists && doc.data().role === 'owner' && !doc.data().pairedAt;
    getPairedUsersCount().then(function(count) {
      if (count >= 2) {
        pairingState = 'full';
        showPairingModal('full');
        hideLoginScreen();
        if (el.messageInput) el.messageInput.disabled = true;
        if (el.sendBtn) el.sendBtn.disabled = true;
        return;
      }
      var savedCode = loadPairingCodeLocal();
      if (savedCode && isOwnerWaiting) {
        pairingState = 'show_code';
        showPairingModal('show_code');
        var codeDisplay = document.getElementById('pairing-code-display');
        if (codeDisplay) codeDisplay.textContent = savedCode;
        hideLoginScreen();
        if (el.messageInput) el.messageInput.disabled = true;
        if (el.sendBtn) el.sendBtn.disabled = true;
        return;
      }
      if (isOwnerWaiting) {
        pairingState = 'generate';
        showPairingModal('generate');
        hideLoginScreen();
        if (el.messageInput) el.messageInput.disabled = true;
        if (el.sendBtn) el.sendBtn.disabled = true;
        return;
      }
      if (count >= 1) {
        pairingState = 'enter_code';
        showPairingModal('enter');
        hideLoginScreen();
        if (el.messageInput) el.messageInput.disabled = true;
        if (el.sendBtn) el.sendBtn.disabled = true;
        return;
      }
      pairingState = 'generate';
      showPairingModal('generate');
      hideLoginScreen();
      if (el.messageInput) el.messageInput.disabled = true;
      if (el.sendBtn) el.sendBtn.disabled = true;
    });
  }).catch(function() {
    getPairedUsersCount().then(function(count) {
      if (count >= 2) {
        pairingState = 'full';
        showPairingModal('full');
        hideLoginScreen();
        if (el.messageInput) el.messageInput.disabled = true;
        if (el.sendBtn) el.sendBtn.disabled = true;
        return;
      }
      var savedCode = loadPairingCodeLocal();
      if (savedCode) {
        pairingState = 'show_code';
        showPairingModal('show_code');
        var codeDisplay = document.getElementById('pairing-code-display');
        if (codeDisplay) codeDisplay.textContent = savedCode;
        hideLoginScreen();
        if (el.messageInput) el.messageInput.disabled = true;
        if (el.sendBtn) el.sendBtn.disabled = true;
        return;
      }
      if (count >= 1) {
        pairingState = 'enter_code';
        showPairingModal('enter');
        hideLoginScreen();
        if (el.messageInput) el.messageInput.disabled = true;
        if (el.sendBtn) el.sendBtn.disabled = true;
        return;
      }
      pairingState = 'generate';
      showPairingModal('generate');
      hideLoginScreen();
      if (el.messageInput) el.messageInput.disabled = true;
      if (el.sendBtn) el.sendBtn.disabled = true;
    });
  });
}
function initializeUser() {
  var cfg = getUserConfig();
  if (!cfg) return;
  username = cfg.name;
  assignedKey = cfg.key;
  allMessages = [];
  renderedMessageIds = new Set();
  visibleCount = 40;
  updateHeaderBadge(null);
  if (el.messageInput) el.messageInput.disabled = false;
  if (el.cartaInput) el.cartaInput.disabled = false;
  if (el.cartaBody) el.cartaBody.disabled = false;
  if (el.sendBtn) el.sendBtn.disabled = false;
  loadMyProfile().then(function() {
    startMessagesListener();
    startTypingListener();
    startPinnedListener();
    startPresenceHeartbeat();
    startPartnerPresenceListener();
    loadPartnerProfile();
    updateHeaderPartnerAvatar();
    startDestacadosListeners();
    startPartnerShareSettingListener();
    startWishlistListener();
    startCartasListener();
    startCalendarListener();
    startRemindersListener();
    initE2ee();
    try { if (typeof window.reloadChatBackground === 'function') window.reloadChatBackground(); } catch(e){}
    if (scheduledCartasInterval) clearInterval(scheduledCartasInterval);
    scheduledCartasInterval = setInterval(checkScheduledCartas, 60000);
    if (remindersCheckInterval) clearInterval(remindersCheckInterval);
    remindersCheckInterval = setInterval(checkRemindersDue, 30000);
    if (isOnline) { flushOfflineQueue(); flushCartasOfflineQueue(); }
  });
}
function cleanupListeners() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (typingUnsubscribe) { typingUnsubscribe(); typingUnsubscribe = null; }
  if (pinnedUnsubscribe) { pinnedUnsubscribe(); pinnedUnsubscribe = null; }
  if (partnerPresenceUnsubscribe) { partnerPresenceUnsubscribe(); partnerPresenceUnsubscribe = null; }
  if (wishlistUnsubscribe) { wishlistUnsubscribe(); wishlistUnsubscribe = null; }
  if (cartasUnsubscribe) { cartasUnsubscribe(); cartasUnsubscribe = null; }
  if (calendarUnsubscribe) { calendarUnsubscribe(); calendarUnsubscribe = null; }
  if (remindersUnsubscribe) { remindersUnsubscribe(); remindersUnsubscribe = null; }
  if (myDestacadosUnsubscribe) { myDestacadosUnsubscribe(); myDestacadosUnsubscribe = null; }
  if (partnerDestacadosUnsubscribe) { partnerDestacadosUnsubscribe(); partnerDestacadosUnsubscribe = null; }
  if (partnerShareSettingUnsubscribe) { partnerShareSettingUnsubscribe(); partnerShareSettingUnsubscribe = null; }
  stopPresenceHeartbeat();
  if (scheduledCartasInterval) { clearInterval(scheduledCartasInterval); scheduledCartasInterval = null; }
  if (remindersCheckInterval) { clearInterval(remindersCheckInterval); remindersCheckInterval = null; }
}

/* ============================================
   IMAGE COMPRESSION
   ============================================ */
function compressImageToBase64(file) {
  return new Promise(function(resolve, reject) {
    if (!file) { reject(new Error('No se proporcionó ningún archivo')); return; }
    
    var MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB
    if (file.size > MAX_INPUT_BYTES) {
      reject(new Error('La imagen pesa más de 25 MB. Elige una más liviana.'));
      return;
    }

    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var origSizeMb = (file.size / (1024 * 1024)).toFixed(2);
        var MAX = 1600;
        var w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }

        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        var mime = (file.type === 'image/png') ? 'image/png' : 'image/jpeg';
        var quality = 0.82;
        var base64 = c.toDataURL(mime, quality);

        var TARGET_LEN = 450000; // ~330 KB
        while (base64.length > TARGET_LEN && quality > 0.30) {
          quality -= 0.08;
          base64 = c.toDataURL('image/jpeg', quality);
        }

        if (base64.length > 600000) {
          var c2 = document.createElement('canvas');
          c2.width = Math.round(w * 0.75);
          c2.height = Math.round(h * 0.75);
          c2.getContext('2d').drawImage(img, 0, 0, c2.width, c2.height);
          base64 = c2.toDataURL('image/jpeg', 0.70);
          w = c2.width; h = c2.height;
        }

        var compSizeKb = Math.round((base64.length * 0.75) / 1024);
        console.log('📸 Compresión exitosa de imagen: Original (' + origSizeMb + ' MB) -> Comprimido (' + compSizeKb + ' KB) | Dim: ' + w + 'x' + h);

        var blur = document.createElement('canvas');
        blur.width = 30; blur.height = Math.round(30 * h / w) || 30;
        blur.getContext('2d').drawImage(img, 0, 0, blur.width, blur.height);

        resolve({
          base64: base64,
          blurPlaceholder: blur.toDataURL('image/jpeg', 0.25),
          width: w,
          height: h,
          name: file.name,
          originalFile: file
        });
      };
      img.onerror = function(){ reject(new Error('No se pudo procesar el formato de la imagen')); };
      img.src = e.target.result;
    };
    reader.onerror = function(){ reject(new Error('No se pudo leer el archivo de imagen')); };
    reader.readAsDataURL(file);
  });
}
function resizeAvatarForProfile(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      var img = new Image();
      img.onload = function() {
        var MAX = 2048, w = img.width, h = img.height;
        if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h * MAX / w); w = MAX; } else { w = Math.round(w * MAX / h); h = MAX; } }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        var quality = 1.0;
        var dataUrl = c.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 900000 && quality > 0.90) {
          quality -= 0.02;
          dataUrl = c.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.onerror = function() { reject(new Error('Error loading image')); };
      img.src = ev.target.result;
    };
    reader.onerror = function() { reject(new Error('Error reading file')); };
    reader.readAsDataURL(file);
  });
}
function resizeImageForFirestore(base64Src) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() {
      var MAX = 1920, w = img.width, h = img.height;
      if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h * MAX / w); w = MAX; } else { w = Math.round(w * MAX / h); h = MAX; } }
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      var q = 0.85, out = c.toDataURL('image/jpeg', q);
      while (out.length > 450000 && q > 0.30) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      if (out.length > 600000) {
        var c2 = document.createElement('canvas');
        c2.width = Math.max(1, Math.round(w * 0.6)); c2.height = Math.max(1, Math.round(h * 0.6));
        c2.getContext('2d').drawImage(img, 0, 0, c2.width, c2.height);
        out = c2.toDataURL('image/jpeg', 0.7);
      }
      if (out.length > 900000) { reject(new Error('La imagen es demasiado pesada aun comprimida')); return; }
      resolve(out);
    };
    img.onerror = function(){ reject(new Error('Error loading image')); };
    img.src = base64Src;
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
      // Si el mensaje eliminado estaba fijado, desfijarlo automáticamente
      if (pinnedMessages.some(function(p){ return p.id === msg.id; })) {
        unpinMessage(msg.id, true);
      }
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
  el.messagesContainer.querySelectorAll('.message-wrapper, .date-separator, .skeleton-msg').forEach(function(e){
    if (e._cleanupAudioScrub) e._cleanupAudioScrub();
    e.remove();
  });
  renderedMessageIds = new Set();
  if (el.welcomeMessage && allMessages.length > 0) el.welcomeMessage.remove();
  var msgs = allMessages.slice(-visibleCount);
  var lastDateStr = null, lastUid = null, lastTs = 0;
  msgs.forEach(function(msg) {
    var isSelf = msg.uid === (currentUser && currentUser.uid);
    var ts = msg.timestamp || 0;
    var d = new Date(ts);
    var ds = d.toDateString();
    if (ts && ds !== lastDateStr) {
      el.messagesContainer.appendChild(createDateSeparator(d));
      lastDateStr = ds; lastUid = null; lastTs = 0;
    }
    var isGrouped = lastUid === msg.uid && ts - lastTs < 120000;
    lastUid = msg.uid; lastTs = ts;
    var wrapper = createMessageElement(msg, isSelf, isGrouped);
    if (pendingHighlightId && msg.id === pendingHighlightId && Date.now() < pendingHighlightUntil) wrapper.classList.add('highlight-flash');
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
  var audioPlayerEl = bubble.querySelector('.msg-audio-player');
  if (audioPlayerEl && audioPlayerEl._cleanupAudioScrub) {
    wrapper._cleanupAudioScrub = audioPlayerEl._cleanupAudioScrub;
  }
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
  bubble.addEventListener('click', function(e) {
    if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.message-reply')) return;
    var rect = bubble.getBoundingClientRect();
    showContextMenu({ clientX: rect.left + rect.width / 2, clientY: rect.top, target: bubble }, msg, isSelf);
  });
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
    var isMine = msg.uid === currentUser.uid;
    var showPlaceholder = msg.viewOnce;
    if (showPlaceholder && msg.viewOnceViewed) {
      var viewedEl = document.createElement('div');
      viewedEl.className = 'viewonce-viewed';
      viewedEl.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">visibility_off</span> Imagen vista';
      iw.appendChild(viewedEl);
      iw.style.aspectRatio = 'auto';
    } else if (showPlaceholder && isMine) {
      var sentPh = document.createElement('div');
      sentPh.className = 'viewonce-placeholder';
      sentPh.innerHTML = '<span class="material-symbols-outlined viewonce-icon">visibility</span><span class="viewonce-label">Ver una vez - enviada</span>';
      iw.appendChild(sentPh);
      iw.style.aspectRatio = 'auto';
    } else if (showPlaceholder) {
      var ph = document.createElement('div');
      ph.className = 'viewonce-placeholder';
      ph.innerHTML = '<span class="material-symbols-outlined viewonce-icon">visibility</span><span class="viewonce-label">Toca para ver una vez</span>';
      ph.addEventListener('click', function() {
        db.collection('rooms/' + ROOM_ID + '/messages').doc(msg.id).update({ viewOnceViewed: true }).catch(function(){});
        msg.viewOnceViewed = true;
        openLightbox(msg.imageBase64, [msg.imageBase64], 0, true);
      });
      iw.appendChild(ph);
      iw.style.aspectRatio = 'auto';
    } else {
      if (msg.imageBlur) { var bi = document.createElement('img'); bi.src = msg.imageBlur; bi.className = 'message-image-blur'; bi.loading = 'lazy'; iw.appendChild(bi); }
      var im = document.createElement('img');
      im.src = msg.imageBase64; im.alt = 'Imagen'; im.className = 'message-image'; im.loading = 'lazy';
      im.onload = function() { this.classList.add('loaded'); };
      im.addEventListener('click', function() {
        var imgs = allMessages.filter(function(m) { return m.imageBase64 && !m.viewOnce; }).map(function(m) { return m.imageBase64; });
        var idx = imgs.indexOf(msg.imageBase64);
        openLightbox(msg.imageBase64, imgs, idx >= 0 ? idx : 0);
      });
      iw.appendChild(im);
    }
    bubble.appendChild(iw);
    if (msg.texto && !showPlaceholder) { var c = document.createElement('span'); c.className = 'msg-caption'; c.textContent = getPlainText(msg); bubble.appendChild(c); }
    bubble.classList.add('has-image');
  } else if (msg.imageGifUrl) {
    var gw = document.createElement('div');
    gw.className = 'message-image-wrapper gif-wrapper';
    gw.style.minHeight = '160px';
    var gi = document.createElement('img');
    gi.src = msg.imageGifUrl; gi.alt = 'GIF'; gi.className = 'message-image loaded';
    gi.loading = 'lazy';
    gi.addEventListener('click', function() { openLightbox(msg.imageGifUrl); });
    gw.appendChild(gi);
    bubble.appendChild(gw);
    if (msg.texto) { var gc = document.createElement('span'); gc.className = 'msg-caption'; gc.textContent = getPlainText(msg); bubble.appendChild(gc); }
    bubble.classList.add('has-image');
  } else if (msg.audioBase64 || msg.audioUrl) {
    var aw = document.createElement('div');
    aw.className = 'msg-audio-player';
    var playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'audio-play-btn';
    playBtn.setAttribute('aria-label', 'Reproducir audio');
    playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    var trackWrap = document.createElement('div');
    trackWrap.className = 'audio-track-wrap';
    var progress = document.createElement('div');
    progress.className = 'audio-progress';
    var progressFill = document.createElement('div');
    progressFill.className = 'audio-progress-fill';
    progress.appendChild(progressFill);
    var waveform = document.createElement('div');
    waveform.className = 'audio-waveform-v2';
    var barCount = 32;
    for (var wi = 0; wi < barCount; wi++) {
      var bar = document.createElement('span');
      bar.className = 'wave-bar';
      bar.style.height = (4 + Math.random() * 18) + 'px';
      waveform.appendChild(bar);
    }
    trackWrap.appendChild(progress);
    trackWrap.appendChild(waveform);
    var durationVal = msg.audioDuration || 0;
    var timeLabel = document.createElement('span');
    timeLabel.className = 'audio-time-label';
    timeLabel.textContent = durationVal ? fmtTime(durationVal) : '0:00';
    aw.appendChild(playBtn);
    aw.appendChild(trackWrap);
    aw.appendChild(timeLabel);
    var au = document.createElement('audio');
    au.src = msg.localAudioPath || msg.audioUrl || msg.audioBase64;
    au.preload = 'metadata';
    au.style.display = 'none';
    aw.appendChild(au);
    var playing = false;

    au.addEventListener('loadedmetadata', function() {
      if (au.duration && isFinite(au.duration)) {
        timeLabel.textContent = fmtTime(au.currentTime) + ' / ' + fmtTime(au.duration);
      }
    });

    au.addEventListener('timeupdate', function() {
      if (!au.duration) return;
      var pct = (au.currentTime / au.duration) * 100;
      progressFill.style.width = pct + '%';
      timeLabel.textContent = fmtTime(au.currentTime) + ' / ' + fmtTime(au.duration);
    });

    au.addEventListener('ended', function() {
      playing = false;
      if (currentlyPlayingAudio === au) currentlyPlayingAudio = null;
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      playBtn.classList.remove('playing');
      progressFill.style.width = '0%';
      if (durationVal || au.duration) {
        timeLabel.textContent = fmtTime(durationVal || au.duration);
      }
    });

    au.addEventListener('pause', function() {
      if (playing) {
        playing = false;
        if (currentlyPlayingAudio === au) currentlyPlayingAudio = null;
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        playBtn.classList.remove('playing');
      }
    });

    playBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (playing) {
        au.pause();
        playing = false;
        if (currentlyPlayingAudio === au) currentlyPlayingAudio = null;
        playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        playBtn.classList.remove('playing');
      } else {
        if (currentlyPlayingAudio && currentlyPlayingAudio !== au) {
          try { currentlyPlayingAudio.pause(); } catch(err){}
        }
        currentlyPlayingAudio = au;
        au.play().then(function() {
          playing = true;
          playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>';
          playBtn.classList.add('playing');
        }).catch(function(err) {
          console.error('Play error:', err);
          showError('No se pudo reproducir el audio');
        });
      }
    });

    var dragging = false;
    function onDocMove(e) { if (dragging) { var touch = e.touches ? e.touches[0] : e; scrub(touch); } }
    function onDocEnd() { dragging = false; }
    function scrub(e) {
      var rect = progress.getBoundingClientRect();
      var x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (au.duration && isFinite(au.duration)) { au.currentTime = x * au.duration; }
      progressFill.style.width = (x * 100) + '%';
    }
    progress.addEventListener('mousedown', function(e) { dragging = true; scrub(e); });
    progress.addEventListener('touchstart', function(e) { dragging = true; scrub(e.touches[0]); }, { passive: true });
    document.addEventListener('mousemove', onDocMove);
    document.addEventListener('touchmove', onDocMove, { passive: true });
    document.addEventListener('mouseup', onDocEnd);
    document.addEventListener('touchend', onDocEnd);
    aw._cleanupAudioScrub = function() {
      document.removeEventListener('mousemove', onDocMove);
      document.removeEventListener('touchmove', onDocMove);
      document.removeEventListener('mouseup', onDocEnd);
      document.removeEventListener('touchend', onDocEnd);
    };

    if (msg.audioBase64 && msg.audioBase64.indexOf('data:audio') === 0) {
      try {
        var raw = msg.audioBase64.split(',')[1];
        var bytes = atob(raw);
        var arr = new Uint8Array(bytes.length);
        for (var ai = 0; ai < bytes.length; ai++) arr[ai] = bytes.charCodeAt(ai);
        var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtx.decodeAudioData(arr.buffer).then(function(buffer) {
          var raw_data = buffer.getChannelData(0);
          var step = Math.floor(raw_data.length / barCount);
          var bars = waveform.querySelectorAll('.wave-bar');
          for (var bi = 0; bi < bars.length; bi++) {
            var start = bi * step;
            var sum = 0;
            for (var j = 0; j < step && start + j < raw_data.length; j++) { sum += Math.abs(raw_data[start + j]); }
            var avg = sum / step;
            bars[bi].style.height = Math.max(4, Math.min(32, Math.round(avg * 80))) + 'px';
          }
          audioCtx.close();
        }).catch(function(){});
      } catch(e){}
    }
    bubble.appendChild(aw);
    bubble.classList.add('has-audio');
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
  if (pinnedMessages.some(function(p){ return p.id === msg.id; })) {
    var pb = document.createElement('span');
    pb.className = 'msg-pin';
    pb.title = 'Mensaje fijado';
    pb.innerHTML = getIcon('pin');
    meta.appendChild(pb);
  }
  if (myDestacadoIds.has(msg.id)) {
    var stb = document.createElement('span');
    stb.className = 'msg-star';
    stb.title = 'Destacado';
    stb.innerHTML = getIcon('starFilled');
    meta.appendChild(stb);
  }
  if (isSelf) {
    var se = document.createElement('span');
    var s = msg.status || 'sent';
    se.className = 'msg-status-icon ' + s;
    if (s === 'sending') se.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    else if (s === 'sent') se.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>';
    else if (s === 'delivered') se.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="18 6 9 17 4 12"/><polyline points="23 6 12 17"/></svg>';
    else if (s === 'read') se.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#53bdeb" stroke-width="2.5" width="14" height="14"><polyline points="18 6 9 17 4 12"/><polyline points="23 6 12 17"/></svg>';
    else if (s === 'error') {
      se.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" width="14" height="14" title="Error al enviar. Click para reintentar"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      se.style.cursor = 'pointer';
      se.onclick = function(evt) { evt.stopPropagation(); retrySendMessage(msg.id); };
    }
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
    else { data.imageBase64 = imageData.base64; data.imageBlur = imageData.blurPlaceholder; data.imageWidth = imageData.width; data.imageHeight = imageData.height; if (imageData.viewOnce) data.viewOnce = true; }
  }
  if (audioData) {
    if (audioData.url) data.audioUrl = audioData.url;
    if (audioData.base64) data.audioBase64 = audioData.base64;
    data.audioMimeType = audioData.mimeType || 'audio/webm';
    data.audioDuration = audioData.duration || 0;
  }
  decryptedMap[msgId] = { texto: plainText };
  if (currentReply) {
    decryptedMap[msgId].replyTexto = replyPlain;
    data.replyTo = { id: currentReply.id, autor: currentReply.autor, texto: replyCipher, imageSrc: currentReply.imageBase64 || null };
  }
  mergeIncomingMessages([Object.assign({}, data, { status: 'sending', timestamp: Date.now() })]);
  sendToFirestoreOrQueue(data, msgId);
}
function sendToFirestoreOrQueue(data, msgId) {
  var TIMEOUT_MS = 30000;
  var timer = null;
  var isDone = false;

  function markError(errReason) {
    if (isDone) return;
    isDone = true;
    if (timer) clearTimeout(timer);
    console.error('Send error for message ' + msgId + ':', errReason);
    var localMsg = allMessages.find(function(m){ return m.id === msgId; });
    if (localMsg) {
      localMsg.status = 'error';
      updateRenderedMessage(localMsg);
    }
    showError(errReason || 'Error al enviar mensaje. Toca para reintentar.');
    addToOfflineQueue(data);
  }

  if (!isOnline) {
    markError('Sin conexión a internet. Guardado en cola offline.');
    return;
  }

  timer = setTimeout(function() {
    markError('El envío tardó demasiado tiempo (Timeout). Revisa tu conexión.');
  }, TIMEOUT_MS);

  db.collection(MESSAGES_COLLECTION).doc(msgId).set(data).then(function() {
    if (isDone) return;
    isDone = true;
    if (timer) clearTimeout(timer);
    var localMsg = allMessages.find(function(m){ return m.id === msgId; });
    if (localMsg && localMsg.status === 'sending') {
      localMsg.status = 'sent';
      updateRenderedMessage(localMsg);
    }
  }).catch(function(e) {
    var reason = (e && e.message && e.message.includes('maximum size'))
      ? 'La imagen o mensaje excede el tamaño máximo permitido por Firestore'
      : 'Error al guardar en la nube';
    markError(reason);
  });
}

function retrySendMessage(msgId) {
  var msg = allMessages.find(function(m){ return m.id === msgId; });
  if (!msg || !currentUser) return;
  msg.status = 'sending';
  updateRenderedMessage(msg);
  showInfo('Reintentando envío...');
  sendToFirestoreOrQueue(msg, msgId);
}
function sendImageMessage(base64, blur, w, h, caption, viewOnce) {
  sendMessage(caption || '', { base64: base64, blurPlaceholder: blur, width: w, height: h, viewOnce: !!viewOnce }, null);
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
function computeReactionToggle(baseReactions, emoji, uid) {
  var reactions = JSON.parse(JSON.stringify(baseReactions || {}));
  var uids = reactions[emoji] ? reactions[emoji].slice() : [];
  var idx = uids.indexOf(uid);
  if (idx >= 0) {
    uids.splice(idx, 1);
    if (uids.length === 0) { delete reactions[emoji]; }
    else { reactions[emoji] = uids; }
  } else {
    // Quitar MI reacción de otros emojis y AÑADIRME al emoji nuevo (conservando a mi pareja)
    Object.keys(reactions).forEach(function(e) {
      var arr = reactions[e] ? reactions[e].slice() : [];
      var i = arr.indexOf(uid);
      if (i >= 0) { arr.splice(i, 1); }
      if (arr.length === 0) { delete reactions[e]; }
      else { reactions[e] = arr; }
    });
    var target = reactions[emoji] ? reactions[emoji].slice() : [];
    if (target.indexOf(uid) < 0) target.push(uid);
    reactions[emoji] = target;
  }
  return reactions;
}
function toggleReaction(msgId, emoji) {
  if (!currentUser || !msgId) return;
  var myUid = currentUser.uid;
  var msg = allMessages.find(function(m){ return m.id === msgId; });
  if (!msg) return;

  var prevReactions = JSON.parse(JSON.stringify(msg.reactions || {}));
  var optimistic = computeReactionToggle(prevReactions, emoji, myUid);
  var msgIndex = allMessages.findIndex(function(m){ return m.id === msgId; });
  if (msgIndex >= 0) { allMessages[msgIndex].reactions = optimistic; }

  var wrapper = el.messagesContainer ? el.messagesContainer.querySelector('[data-msg-id="' + msgId + '"]') : null;
  if (wrapper) { updateRenderedMessage(allMessages[msgIndex] || msg); }

  // Transacción atómica sobre el estado del SERVIDOR: reacciones simultáneas no se pisan
  var ref = db.collection(MESSAGES_COLLECTION).doc(msgId);
  db.runTransaction(function(tx) {
    return tx.get(ref).then(function(doc) {
      var serverReactions = (doc.exists && doc.data().reactions) || {};
      tx.update(ref, { reactions: computeReactionToggle(serverReactions, emoji, myUid) });
    });
  }).catch(function(err) {
    console.error('Reaction error:', err);
    if (msgIndex >= 0) { allMessages[msgIndex].reactions = prevReactions; }
    var w2 = el.messagesContainer ? el.messagesContainer.querySelector('[data-msg-id="' + msgId + '"]') : null;
    if (w2) { updateRenderedMessage(allMessages[msgIndex] || msg); }
  });
}
function setReplyPreview(msg) {
  replyToMessage = msg;
  if (!el.replyPreview) return;
  var content = el.replyPreview.querySelector('.reply-preview-content');
  if (content) {
    var txt = msg.texto ? getPlainText(msg).substring(0, 60) : (msg.imageBase64 ? 'Imagen' : msg.audioBase64 ? 'Audio' : '');
    content.innerHTML = '<strong class="reply-preview-author">' + escapeHtml(msg.autor || '') + '</strong>' +
      '<span class="reply-preview-text">' + escapeHtml(txt) + '</span>';
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
  var msg = allMessages.find(function(m){ return m.id === msgId; });
  if (msg) {
    var msgTime = msg.localTimestamp || (msg.timestamp && msg.timestamp.toMillis ? msg.timestamp.toMillis() : 0);
    if (!msgTime || (Date.now() - msgTime) >= 15 * 60 * 1000) { showError('Tiempo de edición expirado (15 min)'); return; }
  }
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
    ['user1', 'user2'].forEach(function(slot) {
      db.collection(DESTACADOS_COLLECTION).doc(slot).collection('items').doc(msgId).delete().catch(function(){});
    });
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
  if (isSelf && msg.texto && !msg.audioBase64) {
    var msgTime = msg.localTimestamp || (msg.timestamp && msg.timestamp.toMillis ? msg.timestamp.toMillis() : 0);
    var canEdit = msgTime && (Date.now() - msgTime) < 15 * 60 * 1000;
    if (canEdit) items.push({ label: 'Editar', action: function(){ openEditModal(msg.id, getPlainText(msg)); } });
  }
  if (isSelf) items.push({ label: 'Eliminar', action: function(){ deleteMessage(msg.id); }, danger: true });
  var isPinned = pinnedMessages.some(function(p){ return p.id === msg.id; });
  items.push({
    label: isPinned ? 'Desfijar' : 'Fijar',
    action: function(){
      if (isPinned) { unpinMessage(msg.id); showSuccess('Mensaje desfijado'); }
      else { pinMessage(msg.id, getPlainText(msg) || '[Mensaje]', msg.autor || ''); }
    }
  });
  items.push({ label: myDestacadoIds.has(msg.id) ? 'Quitar de destacados' : 'Destacar', action: function(){ toggleDestacado(msg.id); } });
  items.forEach(function(item) {
    var btn = document.createElement('button');
    btn.className = 'context-menu-item' + (item.danger ? ' danger' : '');
    btn.textContent = item.label;
    btn.addEventListener('click', function(e){ e.stopPropagation(); closeAllMenus(); item.action(); });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  if (window.innerWidth >= 768) {
    var rect = (e.target.closest('.message-wrapper') || e.target).getBoundingClientRect();
    menu.style.top = Math.min(rect.top, window.innerHeight - 200) + 'px';
    menu.style.left = Math.min(e.clientX || rect.left, window.innerWidth - 180) + 'px';
  }
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
  allWrappers.forEach(function(w) {
    w.classList.remove('search-highlight', 'search-active');
    w.style.display = '';
  });
  allWrappers.forEach(function(w) {
    w.querySelectorAll('.search-match').forEach(function(m) {
      m.outerHTML = m.textContent;
    });
  });
  if (!q) { updateSearchCount(0, 0); el._searchMatches = []; el._searchIndex = 0; return; }
  var matches = [];
  allWrappers.forEach(function(w) {
    var text = (w.textContent || '').toLowerCase();
    if (text.indexOf(q.toLowerCase()) >= 0) { matches.push(w); }
  });
  matches.forEach(function(w) {
    highlightTextInElement(w, q);
    w.classList.add('search-highlight');
  });
  el._searchMatches = matches;
  el._searchIndex = 0;
  if (matches.length > 0) {
    matches[0].classList.add('search-active');
    matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  updateSearchCount(matches.length > 0 ? 1 : 0, matches.length);
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
  if (total === 0) { if (existing) existing.textContent = '0/0'; return; }
  if (!existing) {
    existing = document.createElement('span');
    existing.className = 'search-count';
    if (el.searchBar) el.searchBar.appendChild(existing);
  }
  existing.textContent = current + '/' + total;
}
function searchNext() {
  if (!el._searchMatches || el._searchMatches.length === 0) return;
  el._searchMatches[el._searchIndex].classList.remove('search-active');
  el._searchIndex = (el._searchIndex + 1) % el._searchMatches.length;
  var cur = el._searchMatches[el._searchIndex];
  cur.classList.add('search-active');
  cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
  updateSearchCount(el._searchIndex + 1, el._searchMatches.length);
}
function searchPrev() {
  if (!el._searchMatches || el._searchMatches.length === 0) return;
  el._searchMatches[el._searchIndex].classList.remove('search-active');
  el._searchIndex = (el._searchIndex - 1 + el._searchMatches.length) % el._searchMatches.length;
  var cur = el._searchMatches[el._searchIndex];
  cur.classList.add('search-active');
  cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
  updateSearchCount(el._searchIndex + 1, el._searchMatches.length);
}
function openLightbox(src, allImages, curIdx, viewOnce) {
  if (!allImages) allImages = [src];
  if (curIdx == null) curIdx = 0;
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:9999;display:flex;align-items:center;justify-content:center;touch-action:none;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none';
  var img = document.createElement('img');
  img.src = src;
  img.style.cssText = 'max-width:95%;max-height:85%;object-fit:contain;border-radius:4px;will-change:transform;-webkit-user-drag:none;touch-action:none;transition:opacity .15s';
  ov.appendChild(img);

  var counter = document.createElement('div');
  counter.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.7);font-size:13px;z-index:10;font-variant-numeric:tabular-nums';
  counter.textContent = (curIdx + 1) + ' / ' + allImages.length;
  if (viewOnce) counter.textContent = '\uD83D\uDC41 Ver una vez \u2022 ' + counter.textContent;
  if (allImages.length <= 1 && !viewOnce) counter.style.display = 'none';
  ov.appendChild(counter);

  var prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.innerHTML = '\u25C0';
  prevBtn.style.cssText = 'position:absolute;left:10px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);color:#fff;border:none;width:40px;height:40px;border-radius:50%;font-size:18px;cursor:pointer;z-index:10;backdrop-filter:blur(4px);display:' + (allImages.length > 1 ? 'flex' : 'none') + ';align-items:center;justify-content:center';
  var nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.innerHTML = '\u25B6';
  nextBtn.style.cssText = 'position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);color:#fff;border:none;width:40px;height:40px;border-radius:50%;font-size:18px;cursor:pointer;z-index:10;backdrop-filter:blur(4px);display:' + (allImages.length > 1 ? 'flex' : 'none') + ';align-items:center;justify-content:center';
  ov.appendChild(prevBtn);
  ov.appendChild(nextBtn);

  var actions = document.createElement('div');
  actions.style.cssText = 'position:absolute;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:16px;z-index:10';
  if (!viewOnce) {
    var dl = document.createElement('button');
    dl.textContent = '\u2B07 Descargar';
    dl.style.cssText = 'background:rgba(255,255,255,.15);color:#fff;border:none;padding:10px 20px;border-radius:20px;font-size:14px;cursor:pointer;backdrop-filter:blur(4px)';
    dl.addEventListener('click', function(e) {
      e.stopPropagation();
      var a = document.createElement('a'); a.href = img.src; a.download = 'imagen-' + Date.now() + '.jpg';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
    actions.appendChild(dl);
  }
  var cb = document.createElement('button');
  cb.textContent = '\u2715 Cerrar';
  cb.style.cssText = 'background:rgba(255,255,255,.15);color:#fff;border:none;padding:10px 20px;border-radius:20px;font-size:14px;cursor:pointer;backdrop-filter:blur(4px)';
  cb.addEventListener('click', function(e) { e.stopPropagation(); ov.remove(); });
  actions.appendChild(cb);
  ov.appendChild(actions);

  var sc = 1, tx = 0, ty = 0;
  var pDist = 0, pSc = 1, pinching = false;
  var tapT = 0, dragging = false, dX = 0, dY = 0, sTx = 0, sTy = 0;

  function apply() {
    if (sc < 1) { sc = 1; tx = 0; ty = 0; }
    if (sc > 5) sc = 5;
    if (sc <= 1) { tx = 0; ty = 0; }
    img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + sc + ')';
  }
  function resetZoom() { sc = 1; tx = 0; ty = 0; apply(); }
  function navigate(newIdx) {
    if (newIdx < 0 || newIdx >= allImages.length) return;
    curIdx = newIdx;
    resetZoom();
    img.style.opacity = '0';
    setTimeout(function() {
      img.src = allImages[curIdx];
      img.style.opacity = '1';
      counter.textContent = (curIdx + 1) + ' / ' + allImages.length;
    }, 100);
  }
  prevBtn.addEventListener('click', function(e) { e.stopPropagation(); navigate(curIdx - 1); });
  nextBtn.addEventListener('click', function(e) { e.stopPropagation(); navigate(curIdx + 1); });

  function pd(a, b) {
    return Math.sqrt(Math.pow(a.clientX - b.clientX, 2) + Math.pow(a.clientY - b.clientY, 2));
  }

  ov.addEventListener('touchstart', function(e) {
    if (e.target.closest && e.target.closest('[style*="z-index:10"]')) return;
    if (e.touches.length === 2) {
      pinching = true;
      pDist = pd(e.touches[0], e.touches[1]);
      pSc = sc;
      e.preventDefault();
    } else if (e.touches.length === 1 && !pinching) {
      var now = Date.now();
      if (now - tapT < 300) {
        sc = (sc === 1) ? 2.5 : 1;
        if (sc === 1) { tx = 0; ty = 0; }
        apply();
        tapT = 0;
      } else {
        tapT = now;
        if (sc > 1) {
          dragging = true;
          dX = e.touches[0].clientX;
          dY = e.touches[0].clientY;
          sTx = tx; sTy = ty;
          e.preventDefault();
        } else {
          swipeX = e.touches[0].clientX;
          swipeY = e.touches[0].clientY;
          swipeActive = true;
        }
      }
    }
  }, { passive: false });

  var swipeX = 0, swipeY = 0, swipeActive = false;

  ov.addEventListener('touchmove', function(e) {
    if (pinching && e.touches.length === 2) {
      e.preventDefault();
      sc = pSc * (pd(e.touches[0], e.touches[1]) / pDist);
      apply();
    } else if (dragging && e.touches.length === 1 && sc > 1) {
      e.preventDefault();
      tx = sTx + (e.touches[0].clientX - dX);
      ty = sTy + (e.touches[0].clientY - dY);
      apply();
    } else if (swipeActive && e.touches.length === 1 && sc <= 1) {
      var dx = e.touches[0].clientX - swipeX;
      var dy = e.touches[0].clientY - swipeY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swipeActive = false;
        if (dx < 0 && curIdx < allImages.length - 1) navigate(curIdx + 1);
        else if (dx > 0 && curIdx > 0) navigate(curIdx - 1);
      }
    }
  }, { passive: false });

  ov.addEventListener('touchend', function(e) {
    if (e.touches.length < 2) pinching = false;
    if (e.touches.length === 0) { dragging = false; swipeActive = false; }
  });

  ov.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });
  ov.addEventListener('gesturechange', function(e) {
    e.preventDefault();
    sc = Math.max(1, Math.min(5, e.scale));
    apply();
  }, { passive: false });
  ov.addEventListener('gestureend', function(e) { e.preventDefault(); }, { passive: false });

  ov.addEventListener('wheel', function(e) {
    if (e.target.closest && e.target.closest('[style*="z-index:10"]')) return;
    e.preventDefault();
    sc += e.deltaY > 0 ? -0.15 : 0.15;
    apply();
  }, { passive: false });

  ov.addEventListener('dblclick', function(e) {
    if (e.target.closest && e.target.closest('[style*="z-index:10"]')) return;
    sc = (sc === 1) ? 2.5 : 1;
    if (sc === 1) { tx = 0; ty = 0; }
    apply();
  });

  ov.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowLeft') navigate(curIdx - 1);
    else if (e.key === 'ArrowRight') navigate(curIdx + 1);
    else if (e.key === 'Escape') ov.remove();
  });
  ov.setAttribute('tabindex', '0');
  setTimeout(function() { ov.focus(); }, 50);

  ov.addEventListener('click', function(e) {
    if (e.target === ov) ov.remove();
  });
  document.body.appendChild(ov);
}
function fmtTime(s) {
  if (!s || !isFinite(s) || isNaN(s)) return '0:00';
  var t = Math.round(s);
  var m = Math.floor(t / 60);
  var sec = Math.floor(t % 60);
  return m + ':' + String(sec).padStart(2, '0');
}

/* ============================================
   VOICE MESSAGES SYSTEM (RECONSTRUCTED & ROBUST)
   ============================================ */
var mediaStream = null;
var currentlyPlayingAudio = null;
var pendingAudioBlob = null;
var pendingAudioDuration = 0;
var pendingAudioMimeType = '';
var audioPreviewAudio = null;
var isStartingRecording = false;
var isPendingStopRecording = false;

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  var types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ];
  for (var i = 0; i < types.length; i++) {
    if (MediaRecorder.isTypeSupported(types[i])) return types[i];
  }
  return '';
}

function startVoiceRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError('Tu navegador no soporta grabación de voz o requiere un entorno seguro (HTTPS)');
    return;
  }
  if (isStartingRecording) return;
  isStartingRecording = true;
  isPendingStopRecording = false;

  navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    isStartingRecording = false;
    mediaStream = stream;
    var mime = getSupportedAudioMimeType();
    var options = mime ? { mimeType: mime } : {};

    try {
      state.mediaRecorder = new MediaRecorder(stream, options);
    } catch(err) {
      console.warn('Fallback MediaRecorder sin options:', err);
      try {
        state.mediaRecorder = new MediaRecorder(stream);
      } catch(e) {
        showError('No se pudo inicializar la grabación de audio');
        cleanupVoiceRecording();
        return;
      }
    }

    state.audioChunks = [];
    state.recordingSeconds = 0;
    state.voiceCancelled = false;

    state.mediaRecorder.ondataavailable = function(e) {
      if (e.data && e.data.size > 0) state.audioChunks.push(e.data);
    };

    state.mediaRecorder.onstop = function() {
      var finalDuration = state.recordingSeconds;
      var wasCancelled = state.voiceCancelled;
      var chunks = state.audioChunks;
      var usedMime = (state.mediaRecorder && state.mediaRecorder.mimeType) || mime || 'audio/webm';

      cleanupVoiceRecording();

      if (!wasCancelled && chunks && chunks.length > 0) {
        if (finalDuration < 1) {
          showError('Nota de voz muy corta. Toca para grabar o mantén presionado');
          return;
        }
        var blob = new Blob(chunks, { type: usedMime });
        showAudioPreviewModal(blob, finalDuration, usedMime);
      }
    };

    state.mediaRecorder.start(100);
    if (el.voiceIndicator) {
      el.voiceIndicator.style.display = 'flex';
      el.voiceIndicator.classList.remove('hidden');
    }
    if (el.voiceBtn) {
      el.voiceBtn.setAttribute('aria-pressed', 'true');
      el.voiceBtn.classList.add('recording');
    }

    state.recordingTimer = setInterval(function() {
      state.recordingSeconds++;
      if (el.voiceRecTime) {
        el.voiceRecTime.textContent = Math.floor(state.recordingSeconds / 60) + ':' + String(state.recordingSeconds % 60).padStart(2, '0');
      }
      var pct = Math.min(100, (state.recordingSeconds / 180) * 100);
      var fill = document.getElementById('voice-rec-progress-fill');
      if (fill) fill.style.width = pct + '%';
      if (state.recordingSeconds >= 180) {
        stopVoiceRecording();
      }
    }, 1000);

    if (isPendingStopRecording) {
      isPendingStopRecording = false;
      setTimeout(stopVoiceRecording, 200);
    }
  }).catch(function(err) {
    isStartingRecording = false;
    isPendingStopRecording = false;
    console.error('Mic error:', err);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showError('Permiso de micrófono denegado en tu navegador');
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      showError('No se encontró ningún micrófono en este dispositivo');
    } else {
      showError('No se pudo acceder al micrófono');
    }
    cleanupVoiceRecording();
  });
}

function stopVoiceRecording() {
  if (isStartingRecording) {
    isPendingStopRecording = true;
    return;
  }
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  } else {
    cleanupVoiceRecording();
  }
}

function cancelVoiceRecording() {
  state.voiceCancelled = true;
  stopVoiceRecording();
}

function cleanupVoiceRecording() {
  isStartingRecording = false;
  isPendingStopRecording = false;
  if (state.recordingTimer) {
    clearInterval(state.recordingTimer);
    state.recordingTimer = null;
  }
  if (mediaStream) {
    try {
      mediaStream.getTracks().forEach(function(t){ t.stop(); });
    } catch(e){}
    mediaStream = null;
  }
  state.mediaRecorder = null;
  state.audioChunks = [];
  state.recordingSeconds = 0;
  if (el.voiceIndicator) {
    el.voiceIndicator.style.display = 'none';
    el.voiceIndicator.classList.add('hidden');
  }
  if (el.voiceBtn) {
    el.voiceBtn.setAttribute('aria-pressed', 'false');
    el.voiceBtn.classList.remove('recording');
  }
  var fill = document.getElementById('voice-rec-progress-fill');
  if (fill) fill.style.width = '0%';
}

/* AUDIO PREVIEW MODAL */
function showAudioPreviewModal(blob, duration, mimeType) {
  pendingAudioBlob = blob;
  pendingAudioDuration = duration || 1;
  pendingAudioMimeType = mimeType || 'audio/webm';

  if (!el.audioPreviewModal) return;

  var audioUrl = URL.createObjectURL(blob);
  if (audioPreviewAudio) {
    audioPreviewAudio.pause();
    audioPreviewAudio = null;
  }
  audioPreviewAudio = new Audio(audioUrl);

  var timeEl = document.getElementById('audio-preview-time');
  var playBtn = document.getElementById('audio-preview-play-btn');
  var progressFill = document.getElementById('audio-preview-progress-fill');
  var progressContainer = document.getElementById('audio-upload-progress-container');

  if (timeEl) timeEl.textContent = '0:00 / ' + fmtTime(pendingAudioDuration);
  if (progressFill) progressFill.style.width = '0%';
  if (progressContainer) progressContainer.classList.add('hidden');
  if (playBtn) playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5v14l11-7z"/></svg>';

  var wf = document.getElementById('audio-preview-waveform');
  if (wf) {
    wf.innerHTML = '';
    for (var wi = 0; wi < 28; wi++) {
      var bar = document.createElement('span');
      bar.className = 'wave-bar';
      bar.style.height = (4 + Math.random() * 16) + 'px';
      wf.appendChild(bar);
    }
  }

  audioPreviewAudio.addEventListener('timeupdate', function() {
    if (!audioPreviewAudio || !audioPreviewAudio.duration) return;
    var pct = (audioPreviewAudio.currentTime / audioPreviewAudio.duration) * 100;
    if (progressFill) progressFill.style.width = pct + '%';
    if (timeEl) timeEl.textContent = fmtTime(audioPreviewAudio.currentTime) + ' / ' + fmtTime(pendingAudioDuration);
  });

  audioPreviewAudio.addEventListener('ended', function() {
    if (playBtn) playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5v14l11-7z"/></svg>';
    if (progressFill) progressFill.style.width = '0%';
    if (timeEl) timeEl.textContent = '0:00 / ' + fmtTime(pendingAudioDuration);
  });

  el.audioPreviewModal.classList.remove('hidden');
  el.audioPreviewModal.style.display = 'flex';
}

function hideAudioPreviewModal() {
  if (audioPreviewAudio) {
    audioPreviewAudio.pause();
    audioPreviewAudio = null;
  }
  pendingAudioBlob = null;
  pendingAudioDuration = 0;
  pendingAudioMimeType = '';
  if (el.audioPreviewModal) {
    el.audioPreviewModal.classList.add('hidden');
    el.audioPreviewModal.style.display = 'none';
  }
}

function sendPendingAudio() {
  if (!pendingAudioBlob || !currentUser) return;

  var blob = pendingAudioBlob;
  var duration = pendingAudioDuration;
  var mimeType = pendingAudioMimeType;
  var msgId = generateClientId();

  var progressContainer = document.getElementById('audio-upload-progress-container');
  var progressFill = document.getElementById('audio-upload-progress-fill');
  var progressText = document.getElementById('audio-upload-progress-text');
  var sendBtn = document.getElementById('audio-preview-send-btn');

  if (sendBtn) sendBtn.disabled = true;
  if (progressContainer) progressContainer.classList.remove('hidden');

  var reader = new FileReader();
  reader.onload = function() {
    var base64Data = reader.result;

    if (typeof firebase !== 'undefined' && firebase.storage && isOnline) {
      try {
        var ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        var storageRef = firebase.storage().ref().child('voice_messages/' + msgId + '.' + ext);
        var uploadTask = storageRef.put(blob, { contentType: mimeType });

        uploadTask.on('state_changed',
          function(snapshot) {
            var pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            if (progressFill) progressFill.style.width = pct + '%';
            if (progressText) progressText.textContent = 'Subiendo audio... ' + pct + '%';
          },
          function(error) {
            console.warn('Storage upload error, usando base64 fallback:', error);
            hideAudioPreviewModal();
            if (sendBtn) sendBtn.disabled = false;
            sendMessage('', null, { base64: base64Data, mimeType: mimeType, duration: duration });
          },
          function() {
            uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
              hideAudioPreviewModal();
              if (sendBtn) sendBtn.disabled = false;
              sendMessage('', null, { url: downloadURL, base64: base64Data, mimeType: mimeType, duration: duration });
            }).catch(function() {
              hideAudioPreviewModal();
              if (sendBtn) sendBtn.disabled = false;
              sendMessage('', null, { base64: base64Data, mimeType: mimeType, duration: duration });
            });
          }
        );
        return;
      } catch(err) {
        console.warn('Storage init failed, enviando base64:', err);
      }
    }

    hideAudioPreviewModal();
    if (sendBtn) sendBtn.disabled = false;
    sendMessage('', null, { base64: base64Data, mimeType: mimeType, duration: duration });
  };
  reader.readAsDataURL(blob);
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
  showImageChip(pendingImagePreviews[0] || '');
}
function hideImagePreviewModal() {
  pendingImageFiles = []; pendingImagePreviews = []; pendingViewOnce = false;
  if (el.imagePreviewModal) el.imagePreviewModal.style.display = 'none';
  if (el.imagePreviewContainer) el.imagePreviewContainer.innerHTML = '';
  if (el.imageCaptionInput) el.imageCaptionInput.value = '';
  if (el.previewViewOnceBtn) { el.previewViewOnceBtn.classList.remove('active'); el.previewViewOnceBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">visibility</span> Ver una vez'; }
  hideImageChip();
}
function showImageChip(src) {
  var chip = document.getElementById('image-chip-preview');
  var thumb = document.getElementById('image-chip-thumb');
  if (!chip || !thumb) return;
  if (src) { thumb.src = src; chip.classList.remove('hidden'); }
}
function hideImageChip() {
  var chip = document.getElementById('image-chip-preview');
  if (chip) chip.classList.add('hidden');
}
function sendPendingImages() {
  if (pendingImageFiles.length === 0) return;
  // Capturar los archivos ANTES de llamar a hideImagePreviewModal,
  // porque esa función vacía pendingImageFiles inmediatamente.
  var filesToSend = pendingImageFiles.slice();
  var caption = el.imageCaptionInput ? el.imageCaptionInput.value.trim() : '';
  var viewOnce = pendingViewOnce;
  hideImagePreviewModal();
  var total = filesToSend.length;
  filesToSend.forEach(function(file, i) {
    var fileSizeMb = (file.size / (1024 * 1024)).toFixed(1);
    if (total === 1) showInfo('Comprimiendo imagen (' + fileSizeMb + ' MB)...');
    compressImageToBase64(file).then(function(r) {
      sendImageMessage(r.base64, r.blurPlaceholder, r.width, r.height, i === 0 ? caption : '', viewOnce);
    }).catch(function(err) {
      var msg = (err && err.message) ? err.message : 'Error al procesar imagen';
      showError(msg);
    });
  });
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
  if (!currentUser) return Promise.resolve();
  var cfg = getUserConfig();
  return db.collection(USERS_COLLECTION).doc(currentUser.uid).get().then(function(doc) {
    if (doc.exists) {
      var d = doc.data();
      myProfile = { username: d.username || '', avatarBase64: d.avatarBase64 || '', bio: d.bio || '' };
      if (myProfile.username) { username = myProfile.username; }
      else if (cfg) { username = cfg.name; myProfile.username = cfg.name; }
      updateMyProfileUI();
    } else {
      return db.collection(USERS_COLLECTION).where('email', '==', currentUser.email).limit(1).get().then(function(snap) {
        if (!snap.empty) {
          var d = snap.docs[0].data();
          myProfile = { username: d.username || '', avatarBase64: d.avatarBase64 || '', bio: d.bio || '' };
          if (myProfile.username) { username = myProfile.username; }
          else if (cfg) { username = cfg.name; myProfile.username = cfg.name; }
          var light = { username: myProfile.username, bio: myProfile.bio, email: currentUser.email, uid: currentUser.uid };
          db.collection(USERS_COLLECTION).doc(currentUser.uid).set(light, { merge: true }).catch(function(){});
        } else {
          if (cfg) { username = cfg.name; myProfile.username = cfg.name; }
        }
        updateMyProfileUI();
      }).catch(function(){ if (cfg) { username = cfg.name; myProfile.username = cfg.name; } updateMyProfileUI(); });
    }
  }).catch(function(){ if (cfg) { username = cfg.name; myProfile.username = cfg.name; } updateMyProfileUI(); });
}
function loadPartnerProfile() {
  var partner = getPartnerConfig();
  if (!partner) return;
  db.collection(USERS_COLLECTION).where('email', '==', partner.email).limit(1).get().then(function(snap) {
    if (!snap.empty) {
      var d = snap.docs[0].data();
      partnerRealUid = snap.docs[0].id;
      partnerProfile = { username: d.username || partner.name, avatarBase64: d.avatarBase64 || '', bio: d.bio || '' };
    } else {
      partnerProfile = { username: partner.name, avatarBase64: '', bio: '' };
    }
    updateMyProfileUI(); updatePartnerProfileUI(); updateHeaderBadge(null);
  }).catch(function(){
    partnerProfile = { username: partner.name, avatarBase64: '', bio: '' };
    updateMyProfileUI(); updatePartnerProfileUI();
  });
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
  var partner = getPartnerConfig();
  var name = partnerProfile.username || (partner && partner.name) || 'Mi Amor';
  var avatar = partnerProfile.avatarBase64 || '';
  var img = document.getElementById('header-partner-img');
  var initial = document.getElementById('header-partner-initial');
  var headerName = document.getElementById('header-partner-name');
  var headerBio = document.getElementById('header-partner-bio');
  if (headerName) headerName.textContent = name;
  if (headerBio) headerBio.textContent = partnerProfile.bio || '';
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
  if (name) username = name;
  var base = {
    username: name, bio: bio,
    uid: currentUser.uid, email: currentUser.email,
    lastActive: firebase.firestore.FieldValue.serverTimestamp()
  };
  db.collection(USERS_COLLECTION).doc(currentUser.uid).set(base, { merge: true }).then(function() {
    if (myProfile.avatarBase64 && myProfile.avatarBase64.length < 900000) {
      return db.collection(USERS_COLLECTION).doc(currentUser.uid).set({
        avatarBase64: myProfile.avatarBase64
      }, { merge: true });
    }
  }).then(function() {
    updateMyProfileUI();
    updateHeaderPartnerAvatar();
    showSuccess('Perfil guardado');
  }).catch(function(e) {
    console.error('Profile save error:', e);
    showError('Error al guardar perfil');
  });
}


/* SETTINGS + DESTACADOS */
function openSettingsModal() {
  if (el.settingsModal) el.settingsModal.style.display = 'flex';
  updateMyProfileUI(); updatePartnerProfileUI(); loadStats();
  if (el.anniversaryInput) el.anniversaryInput.value = anniversaryDate || '';
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
  if (myDestacadosUnsubscribe) { myDestacadosUnsubscribe(); myDestacadosUnsubscribe = null; }
  if (partnerDestacadosUnsubscribe) { partnerDestacadosUnsubscribe(); partnerDestacadosUnsubscribe = null; }
  myDestacadosUnsubscribe = db.collection(DESTACADOS_COLLECTION).doc(mySlot).collection('items').onSnapshot(function(snap) {
    var touchedIds = [];
    snap.docChanges().forEach(function(ch) { touchedIds.push(ch.doc.id); });
    myDestacados = []; myDestacadoIds = new Set();
    snap.forEach(function(doc) { var d = Object.assign({}, doc.data(), { id: doc.id }); myDestacados.push(d); myDestacadoIds.add(doc.id); });
    if (el.destacadosCount) el.destacadosCount.textContent = myDestacados.length > 0 ? myDestacados.length : '';
    touchedIds.forEach(function(mid) {
      var m = allMessages.find(function(x){ return x.id === mid; });
      if (m) updateRenderedMessage(m);
    });
  }, function(err){ console.error('Listener:', err && err.message); });
  var partnerSlot = mySlot === 'user1' ? 'user2' : 'user1';
  partnerDestacadosUnsubscribe = db.collection(DESTACADOS_COLLECTION).doc(partnerSlot).collection('items').onSnapshot(function(snap) {
    partnerDestacados = []; partnerDestacadoIds = new Set();
    snap.forEach(function(doc) { var d = Object.assign({}, doc.data(), { id: doc.id }); partnerDestacados.push(d); partnerDestacadoIds.add(doc.id); });
  }, function(err){ console.error('Listener:', err && err.message); });
}
function startPartnerShareSettingListener() {
  var partner = getPartnerConfig();
  if (!partner) return;
  if (partnerShareSettingUnsubscribe) { partnerShareSettingUnsubscribe(); partnerShareSettingUnsubscribe = null; }
  partnerShareSettingUnsubscribe = db.collection(SETTINGS_COLLECTION).doc(partner.key).onSnapshot(function(doc) {
    if (doc.exists) {
      partnerShares = doc.data().shareDestacados === true;
      if (el.partnerDestacadosStatus) el.partnerDestacadosStatus.textContent = partnerShares ? 'Disponible' : 'No compartido';
    }
  }, function(err){ console.error('Listener:', err && err.message); });
}
async function toggleDestacado(msgId) {
  if (!currentUser || !msgId) return;
  var mySlot = getAssignedUser();
  if (!mySlot) return;
  var ref = db.collection(DESTACADOS_COLLECTION).doc(mySlot).collection('items').doc(msgId);
  if (myDestacadoIds.has(msgId)) {
    ref.delete().then(function() { showSuccess('Quitado de destacados'); })
      .catch(function() { showError('No se pudo quitar'); });
  }
  else {
    var msg = allMessages.find(function(m){ return m.id === msgId; });
    if (!msg) { showError('Mensaje no encontrado'); return; }
    var cipher = await encryptText(getPlainText(msg));
    ref.set({ texto: cipher, imageBase64: msg.imageBase64 || null, autor: msg.autor || '', timestamp: msg.timestamp || Date.now(), createdAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function() { showSuccess('Agregado a destacados ⭐'); })
      .catch(function(e) { console.error('Destacado error:', e); showError('No se pudo destacar'); });
  }
}
function toggleShareDestacados() {
  var mySlot = getAssignedUser();
  if (!mySlot || !el.shareDestacadosToggle) return;
  myShareDestacados = el.shareDestacadosToggle.checked;
  db.collection(SETTINGS_COLLECTION).doc(mySlot).set({ shareDestacados: myShareDestacados }, { merge: true }).catch(function(){});
}
/* Paneles sobre Ajustes (destacados / wishlist): overlay sin ocultar Ajustes */
function enterSubPanel(panel) {
  if (panel) panel.style.display = 'flex';
}
function exitSubPanel(panel) {
  if (panel) panel.style.display = 'none';
}
async function showDestacadosModal(type) {
  if (!el.destacadosModal || !el.destacadosList) return;
  if (type === 'partner' && !partnerShares) {
    el.destacadosList.innerHTML = '<p style="text-align:center;padding:20px;color:#999">Tu pareja no ha compartido sus destacados</p>';
    enterSubPanel(el.destacadosModal);
    return;
  }
  enterSubPanel(el.destacadosModal);
  el.destacadosList.innerHTML = '<p style="text-align:center;padding:20px;color:#999">Cargando…</p>';
  var title = el.destacadosModal.querySelector('.destacados-title');
  var items = type === 'my' ? myDestacados : partnerDestacados;
  if (title) title.textContent = type === 'my' ? 'Mis destacados' : 'Destacados de mi pareja';
  if (items.length === 0) { el.destacadosList.innerHTML = '<p style="text-align:center;padding:20px;color:#999">No hay destacados</p>'; }
  else {
    var resolved = await Promise.all(items.map(async function(d) {
      return { d: d, texto: isEncryptedText(d.texto) ? await decryptText(d.texto) : (d.texto || '') };
    }));
    el.destacadosList.innerHTML = '';
    resolved.forEach(function(it) {
      var card = document.createElement('div'); card.className = 'destacado-card';
      card.innerHTML = '<div class="destacado-card-text">' + escapeHtml(it.texto) + '</div><span class="destacado-card-time">' + timeAgo(it.d.timestamp) + '</span>';
      card.addEventListener('click', function() { scrollToMessage(it.d.id); exitSubPanel(el.destacadosModal); });
      el.destacadosList.appendChild(card);
    });
  }
}
function hideDestacadosModal() { exitSubPanel(el.destacadosModal); }
var pendingHighlightId = null, pendingHighlightUntil = 0, suppressLoadOlderUntil = 0;
function scrollToMessage(msgId) {
  if (!msgId || !el.messagesContainer) return;
  pendingHighlightId = msgId;
  pendingHighlightUntil = Date.now() + 2600;
  suppressLoadOlderUntil = Date.now() + 900;
  var w = el.messagesContainer.querySelector('[data-msg-id="' + msgId + '"]');
  if (w) { w.scrollIntoView({ behavior: 'smooth', block: 'center' }); w.classList.add('highlight-flash'); }
  setTimeout(function() {
    var cur = el.messagesContainer ? el.messagesContainer.querySelector('[data-msg-id="' + msgId + '"]') : null;
    if (cur) {
      var r = cur.getBoundingClientRect(), c = el.messagesContainer.getBoundingClientRect();
      if (r.top < c.top || r.bottom > c.bottom) cur.scrollIntoView({ behavior: 'auto', block: 'center' });
      if (Date.now() < pendingHighlightUntil) cur.classList.add('highlight-flash');
    }
    if (Date.now() >= pendingHighlightUntil) pendingHighlightId = null;
  }, 750);
  setTimeout(function() {
    pendingHighlightId = null;
    var cur2 = el.messagesContainer ? el.messagesContainer.querySelector('[data-msg-id="' + msgId + '"]') : null;
    if (cur2) cur2.classList.remove('highlight-flash');
  }, 2700);
}

/* ============================================
   BUZÓN DE CARTAS 💌
   ============================================ */
var CARTAS_COLLECTION = 'rooms/' + ROOM_ID + '/cartas';
var cartasUnsubscribe = null;
var cartasItems = [];
var cartasTab = 'in';
var currentCarta = null;
var partnerRealUid = '';
var cartaPlainMap = {};
var pendingCartas = {};
var cartaSelectedImage = null;
var cartaScheduledDate = null;

function startCartasListener() {
  if (!currentUser) return;
  if (cartasUnsubscribe) { cartasUnsubscribe(); cartasUnsubscribe = null; }
  cartasUnsubscribe = db.collection(CARTAS_COLLECTION).onSnapshot(function(snap) {
    var prevUnread = myUnreadCount();
    cartasItems = [];
    snap.forEach(function(doc) {
      // Confirmado por servidor: sale de la lista de pendientes
      if (pendingCartas[doc.id]) delete pendingCartas[doc.id];
      cartasItems.push(Object.assign({}, doc.data(), { id: doc.id }));
    });
    cartasItems.sort(function(a, b) { return (b.createdAtMs || 0) - (a.createdAtMs || 0); });
    updateCartasBadges();
    if (myUnreadCount() > prevUnread) showSuccess('Tienes una carta nueva \uD83D\uDC8C');
    if (el.cartasModal && el.cartasModal.style.display === 'flex') renderCartasList();
  }, function(err){ console.error('Cartas listener:', err); });
}
function getAllCartasMerged() {
  var pending = Object.keys(pendingCartas).map(function(k){ return pendingCartas[k]; });
  return cartasItems.concat(pending).sort(function(a, b) { return (b.createdAtMs || 0) - (a.createdAtMs || 0); });
}
function cartaIsForMe(c) {
  var mySlot = getAssignedUser();
  return c.paraUid ? c.paraUid === (currentUser && currentUser.uid) : c.paraSlot === mySlot;
}
function cartaIsMine(c) {
  var mySlot = getAssignedUser();
  return c.deUid ? c.deUid === (currentUser && currentUser.uid) : c.deSlot === mySlot;
}
function myUnreadCount() {
  var nowMs = Date.now();
  return cartasItems.filter(function(c){
    if (!cartaIsForMe(c) || c.leida) return false;
    if (c._scheduled && c.scheduledForMs && c.scheduledForMs > nowMs) return false;
    return true;
  }).length;
}
function updateCartasBadges() {
  var n = myUnreadCount();
  var label = n > 9 ? '9+' : (n > 0 ? String(n) : '');
  if (el.moreBadge) {
    el.moreBadge.textContent = label;
    el.moreBadge.classList.toggle('hidden', n === 0);
  }
  if (el.cartasUnreadBadge) {
    el.cartasUnreadBadge.textContent = label;
    el.cartasUnreadBadge.classList.toggle('hidden', n === 0);
  }
  if (el.cartasInBadge) {
    el.cartasInBadge.textContent = label;
    el.cartasInBadge.classList.toggle('hidden', n === 0);
  }
}
function updateCartasStats() {
  var all = getAllCartasMerged();
  var nowMs = Date.now();
  function isDelivered(c) { return !(c._scheduled && c.scheduledForMs && c.scheduledForMs > nowMs); }
  var sent = all.filter(function(c) { return cartaIsMine(c); }).length;
  var received = all.filter(function(c) { return cartaIsForMe(c) && isDelivered(c); }).length;
  var read = all.filter(function(c) { return cartaIsForMe(c) && c.leida; }).length;
  var unread = all.filter(function(c) { return cartaIsForMe(c) && !c.leida && isDelivered(c); }).length;
  if (el.statSent) el.statSent.textContent = sent;
  if (el.statReceived) el.statReceived.textContent = received;
  if (el.statRead) el.statRead.textContent = read;
  if (el.statUnread) el.statUnread.textContent = unread;
}
async function renderCartasList() {
  if (!el.cartasList) return;
  var mine = cartasTab === 'out';
  var nowMs = Date.now();
  var items = getAllCartasMerged().filter(function(c) {
    if (mine) return cartaIsMine(c);
    if (!cartaIsForMe(c)) return false;
    if (c._scheduled && c.scheduledForMs && c.scheduledForMs > nowMs) return false;
    return true;
  });
  if (items.length === 0) {
    el.cartasList.innerHTML = '<div class="carta-empty">' + (mine
      ? 'Aún no enviaste ninguna carta 💌'
      : 'No hay cartas pendientes… por ahora 💕') + '</div>';
    return;
  }
  var resolved = await Promise.all(items.map(async function(c) {
    var texto = cartaPlainMap[c.id] || (isEncryptedText(c.texto) ? await decryptText(c.texto) : (c.texto || ''));
    return { c: c, texto: texto };
  }));
  el.cartasList.innerHTML = '';
  resolved.forEach(function(it) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'carta-card' + ((!it.c.leida && cartaIsForMe(it.c)) ? ' unread' : '');
    if (it.c._scheduled) card.classList.add('scheduled');
    if (it.c.imagen) card.classList.add('has-image');
    var env = document.createElement('span');
    env.className = 'carta-env';
    env.textContent = (it.c._pending ? '\uD83D\uDCF2' : (it.c._scheduled ? '\u23F0' : (cartaIsMine(it.c) ? '\uD83D\uDCE4' : (it.c.leida ? '\uD83D\uDCE9' : '\uD83D\uDC8C'))));
    var body = document.createElement('span');
    body.className = 'carta-body';
    var top = document.createElement('span');
    top.className = 'carta-top';
    var who = document.createElement('span');
    who.className = 'carta-from';
    who.textContent = cartaIsMine(it.c) ? 'Para ' + (it.c.paraName || 'mi amor') : 'De ' + (it.c.deNombre || 'mi amor');
    var date = document.createElement('span');
    date.className = 'carta-date';
    if (it.c._scheduled && it.c.scheduledForMs) {
      var now = Date.now();
      if (now < it.c.scheduledForMs) {
        date.textContent = '\u23F0 ' + new Date(it.c.scheduledForMs).toLocaleDateString('es-ES') + ' ' + formatTime(it.c.scheduledForMs);
        date.style.color = '#92400e';
      } else {
        date.textContent = timeAgo(it.c.createdAtMs || it.c.createdAt);
      }
    } else {
      date.textContent = timeAgo(it.c.createdAtMs || it.c.createdAt);
    }
    var snip = document.createElement('span');
    snip.className = 'carta-snippet';
    var prefix = it.c._pending ? '\u23F3 ' : (it.c.imagen ? '\uD83D\uDDBC ' : '');
    snip.textContent = prefix + (it.texto.substring(0, 70) || (it.c.imagen ? '(imagen)' : '(vacía)'));
    var dot = document.createElement('span');
    dot.className = 'carta-dot';
    top.appendChild(who);
    top.appendChild(date);
    body.appendChild(top);
    body.appendChild(snip);
    card.appendChild(env);
    card.appendChild(body);
    card.appendChild(dot);
    card.addEventListener('click', function() { openCartaReader(it.c); });
    el.cartasList.appendChild(card);
  });
}
function setCartasTab(tab) {
  cartasTab = tab;
  if (el.cartasTabIn) el.cartasTabIn.classList.toggle('active', tab === 'in');
  if (el.cartasTabOut) el.cartasTabOut.classList.toggle('active', tab === 'out');
  renderCartasList();
}
async function openCartaReader(c) {
  if (c && !cartaIsMine(c) && c._scheduled && c.scheduledForMs && c.scheduledForMs > Date.now()) {
    showInfo('Esta carta llegará el ' + new Date(c.scheduledForMs).toLocaleDateString('es-ES'));
    return;
  }
  currentCarta = c;
  var texto = isEncryptedText(c.texto) ? await decryptText(c.texto) : (c.texto || '');
  // Guarda: pudo llegar otro clic mientras desciframos
  if (currentCarta !== c) return;
  if (el.cartaReadFrom) el.cartaReadFrom.textContent = cartaIsMine(c) ? 'Para ' + (c.paraName || 'mi amor') : 'De ' + (c.deNombre || 'mi amor');
  var ts = c.createdAtMs || c.createdAt || Date.now();
  if (el.cartaReadDate) el.cartaReadDate.textContent = new Date(ts).toLocaleDateString('es-ES') + ' ' + formatTime(ts);
  if (el.cartaReadText) el.cartaReadText.textContent = texto;
  if (c.imagen && el.cartaReadImgWrap && el.cartaReadImg) {
    el.cartaReadImg.src = c.imagen;
    el.cartaReadImgWrap.classList.remove('hidden');
  } else if (el.cartaReadImgWrap) {
    el.cartaReadImgWrap.classList.add('hidden');
  }
  if (c._scheduled && c.scheduledForMs && el.cartaReadScheduleInfo && el.cartaReadScheduleText) {
    el.cartaReadScheduleText.textContent = 'Programada para: ' + new Date(c.scheduledForMs).toLocaleDateString('es-ES') + ' ' + formatTime(c.scheduledForMs);
    el.cartaReadScheduleInfo.classList.remove('hidden');
  } else if (el.cartaReadScheduleInfo) {
    el.cartaReadScheduleInfo.classList.add('hidden');
  }
  if (el.cartaReader) el.cartaReader.style.display = 'flex';
  if (cartaIsForMe(c) && !c.leida) {
    db.collection(CARTAS_COLLECTION).doc(c.id).update({
      leida: true,
      leidaAtMs: Date.now()
    }).catch(function(){});
  }
}
function sendCarta() {
  var input = el.cartaInput;
  var body = el.cartaBody;
  if (!input || !currentUser) return;
  var greeting = input.value.trim();
  var bodyText = body ? body.value.trim() : '';
  var text = greeting + (bodyText ? '\n\n' + bodyText : '');
  text = text.trim();
  if (!text && !cartaSelectedImage) { showError('Escribe algo bonito primero'); return; }
  if (!text) text = '📷';
  var partner = getPartnerConfig();
  var mySlot = getAssignedUser();
  var sealBtn = document.querySelector('.carta-compose-seal-btn.active');
  var sealType = sealBtn ? sealBtn.getAttribute('data-seal') : 'favorite';
  var btn = el.cartaSendBtn;
  if (btn) btn.disabled = true;
  function doSend(imageData) {
    var schedDate = cartaScheduledDate;
    var encryptPromise = text === '📷' ? Promise.resolve('📷') : encryptText(text);
    encryptPromise.then(function(cipher) {
      var cartaId = generateClientId();
      var data = {
        texto: cipher,
        deUid: currentUser.uid,
        deSlot: mySlot || '',
        deNombre: username || '',
        paraUid: partnerRealUid || '',
        paraSlot: mySlot === 'user1' ? 'user2' : 'user1',
        paraName: (partnerProfile.username || (partner && partner.name) || 'Mi amor'),
        leida: false,
        sello: sealType,
        createdAtMs: Date.now(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (imageData) data.imagen = imageData;
      if (schedDate) {
        data.scheduledForMs = schedDate.getTime();
        data.scheduledFor = schedDate.toISOString();
        data._scheduled = true;
      }
      cartaPlainMap[cartaId] = text;
      pendingCartas[cartaId] = Object.assign({}, data, { id: cartaId, _pending: true });
      delete pendingCartas[cartaId].createdAt;
      updateCartasBadges();
      if (el.cartasModal && el.cartasModal.style.display === 'flex') renderCartasList();
      hideCartasCompose();
      setCartasTab('out');
      input.value = '';
      if (body) body.value = '';
      if (el.cartaCounter) el.cartaCounter.textContent = '0/4000';
      // Siempre se guarda en Firestore (también programadas): si no, se pierden al recargar
      sendCartaToFirestoreOrQueue(data, cartaId, !!schedDate);
      if (schedDate) {
        showSuccess('Carta programada para ' + new Date(schedDate).toLocaleDateString('es-ES') + ' ' + formatTime(schedDate.getTime()));
      }
    }).catch(function(e) {
      console.error('Carta error:', e);
      showError('No se pudo enviar la carta');
    }).then(function() { if (btn) btn.disabled = false; });
  }
  if (cartaSelectedImage) {
    resizeImageForFirestore(cartaSelectedImage).then(function(dataUrl) { doSend(dataUrl); })
      .catch(function() { showError('No se pudo procesar la imagen'); if (btn) btn.disabled = false; });
  } else {
    doSend(null);
  }
}
function sendCartaToFirestoreOrQueue(data, cartaId, silentSuccess) {
  if (isOnline) {
    db.collection(CARTAS_COLLECTION).doc(cartaId).set(data).then(function() {
      if (!silentSuccess) showSuccess('Carta enviada 💌');
    }).catch(function(err) {
      console.error('Carta send error:', err);
      addToCartasOfflineQueue(data, cartaId);
      showError('Sin conexión: la carta se enviará al reconectar');
    });
  } else {
    addToCartasOfflineQueue(data, cartaId);
    showError('Sin conexión: la carta se enviará al reconectar');
  }
}

/* Cola offline de cartas (misma lógica que mensajes) */
var CARTAS_OFFLINE_KEY = 'chatpareja_cartas_offline';
function getCartasOfflineQueue() { try { var d = localStorage.getItem(CARTAS_OFFLINE_KEY); return d ? JSON.parse(d) : []; } catch(e){ return []; } }
function saveCartasOfflineQueue(q) { try { localStorage.setItem(CARTAS_OFFLINE_KEY, JSON.stringify(q)); } catch(e){} }
function addToCartasOfflineQueue(data, cartaId) {
  var q = getCartasOfflineQueue();
  q.push({ cartaId: cartaId, data: data });
  saveCartasOfflineQueue(q);
}
function flushCartasOfflineQueue() {
  if (!isOnline || !currentUser) return;
  var q = getCartasOfflineQueue();
  if (!q.length) return;
  var remaining = [];
  var promises = [];
  q.forEach(function(item) {
    var p = db.collection(CARTAS_COLLECTION).doc(item.cartaId).set(item.data).then(function() {
      return true;
    }).catch(function() {
      remaining.push(item);
      return false;
    });
    promises.push(p);
  });
  Promise.allSettled(promises).then(function() {
    saveCartasOfflineQueue(remaining);
  });
}
function closeCartaReader() {
  currentCarta = null;
  if (el.cartaReader) el.cartaReader.style.display = 'none';
}
function checkScheduledCartas() {
  if (!isOnline || !currentUser) return;
  var now = Date.now();
  cartasItems.forEach(function(c) {
    if (c._scheduled && c.scheduledForMs && c.deUid === currentUser.uid && !c._sentScheduled) {
      if (now >= c.scheduledForMs) {
        c._sentScheduled = true;
        db.collection(CARTAS_COLLECTION).doc(c.id).update({
          _scheduled: false,
          scheduledSentAtMs: now
        }).catch(function(){});
      }
    }
  });
}
var scheduledCartasInterval = null;
function hideCartasCompose() {
  if (el.cartasCompose) el.cartasCompose.classList.add('hidden');
  if (el.cartasNewBtn) el.cartasNewBtn.style.display = '';
  if (el.cartaInput) el.cartaInput.value = '';
  if (el.cartaBody) el.cartaBody.value = '';
  if (el.cartaCounter) el.cartaCounter.textContent = '0/4000';
  cartaSelectedImage = null;
  cartaScheduledDate = null;
  if (el.cartaImgPreview) el.cartaImgPreview.classList.add('hidden');
  if (el.cartaImgThumb) el.cartaImgThumb.src = '';
  if (el.cartaImgInput) el.cartaImgInput.value = '';
  if (el.cartaSchedulePreview) el.cartaSchedulePreview.classList.add('hidden');
  if (el.cartaSchedulePicker) el.cartaSchedulePicker.classList.add('hidden');
  if (el.cartaScheduleDatetime) el.cartaScheduleDatetime.value = '';
  if (el.cartaScheduleBtn) el.cartaScheduleBtn.classList.remove('active');
  document.querySelectorAll('.carta-compose-seal-btn').forEach(function(b){ b.classList.remove('active'); });
  var firstSeal = document.querySelector('.carta-compose-seal-btn[data-seal="favorite"]');
  if (firstSeal) firstSeal.classList.add('active');
}

/* ============================================
   MÁS (HUB)
   ============================================ */
function openMoreModal() {
  updateCartasBadges();
  updateMediaCount();
  if (el.moreModal) el.moreModal.style.display = 'flex';
}
function closeMoreModal() {
  if (el.moreModal) el.moreModal.style.display = 'none';
}

/* ===== CALENDAR ===== */
var EVENT_ICONS = { anniversary: '💕', birthday: '🎂', date: '🌹', trip: '✈️', goal: '🎯', other: '📌' };
var MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function startCalendarListener() {
  if (!currentUser) return;
  if (calendarUnsubscribe) { calendarUnsubscribe(); calendarUnsubscribe = null; }
  calendarUnsubscribe = db.collection(CALENDAR_COLLECTION).onSnapshot(function(snap) {
    calendarEvents = [];
    snap.forEach(function(doc) { calendarEvents.push(Object.assign({}, doc.data(), { id: doc.id })); });
    calendarEvents.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
    if (el.calendarCount) el.calendarCount.textContent = calendarEvents.length || '';
    renderCalendar();
  }, function(err) { console.error('Calendar listener:', err); });
}

function openCalendarModal() {
  if (el.calendarModal) { el.calendarModal.classList.remove('hidden'); el.calendarModal.style.display = 'flex'; }
  renderCalendar();
  renderCalendarEvents();
}
function closeCalendarModal() {
  if (el.calendarModal) { el.calendarModal.classList.add('hidden'); el.calendarModal.style.display = 'none'; }
}

function renderCalendar() {
  if (!el.calendarGrid || !el.calendarMonthLabel) return;
  el.calendarMonthLabel.textContent = MONTH_NAMES[calendarMonth] + ' ' + calendarYear;
  var firstDay = new Date(calendarYear, calendarMonth, 1);
  var lastDay = new Date(calendarYear, calendarMonth + 1, 0);
  var startDay = (firstDay.getDay() + 6) % 7;
  var daysInMonth = lastDay.getDate();
  var today = new Date();
  var eventDates = {};
  calendarEvents.forEach(function(ev) {
    var d = ev.date;
    if (d) eventDates[d] = ev;
  });
  var html = '';
  var prevMonthDays = new Date(calendarYear, calendarMonth, 0).getDate();
  for (var i = startDay - 1; i >= 0; i--) {
    html += '<div class="calendar-day other-month">' + (prevMonthDays - i) + '</div>';
  }
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = calendarYear + '-' + String(calendarMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var isToday = d === today.getDate() && calendarMonth === today.getMonth() && calendarYear === today.getFullYear();
    var hasEvent = eventDates[dateStr];
    var cls = 'calendar-day' + (isToday ? ' today' : '') + (hasEvent ? ' has-event' : '');
    html += '<div class="' + cls + '" data-date="' + dateStr + '">' + d + '</div>';
  }
  var remaining = 42 - (startDay + daysInMonth);
  for (var j = 1; j <= remaining && j <= 7; j++) {
    html += '<div class="calendar-day other-month">' + j + '</div>';
  }
  el.calendarGrid.innerHTML = html;
  el.calendarGrid.querySelectorAll('.calendar-day:not(.other-month)').forEach(function(cell) {
    cell.addEventListener('click', function() {
      var date = cell.getAttribute('data-date');
      var ev = eventDates[date];
      if (ev) showEventOnDay(ev);
    });
  });
  renderCalendarEvents();
}

function renderCalendarEvents() {
  if (!el.calendarEventsList) return;
  var now = new Date();
  var upcoming = calendarEvents.filter(function(ev) {
    if (!ev.date) return false;
    return ev.date >= (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'));
  }).slice(0, 10);
  if (upcoming.length === 0) {
    el.calendarEventsList.innerHTML = '<div class="carta-empty" style="padding:20px;">No hay eventos próximos</div>';
    return;
  }
  el.calendarEventsList.innerHTML = '';
  upcoming.forEach(function(ev) {
    var item = document.createElement('div');
    item.className = 'calendar-event-item';
    var icon = document.createElement('span');
    icon.className = 'calendar-event-icon';
    icon.textContent = EVENT_ICONS[ev.type] || '📌';
    var info = document.createElement('div');
    info.className = 'calendar-event-info';
    var name = document.createElement('div');
    name.className = 'calendar-event-name';
    name.textContent = ev.title || 'Sin nombre';
    var date = document.createElement('div');
    date.className = 'calendar-event-date';
    var d = new Date(ev.date + 'T00:00:00');
    date.textContent = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) + (ev.repeat ? ' 🔄' : '');
    info.appendChild(name);
    info.appendChild(date);
    item.style.cursor = 'pointer';
    item.addEventListener('click', function() {
      try {
        var parts = ev.date.split('-');
        if (parts.length === 3) {
          calendarYear = parseInt(parts[0], 10);
          calendarMonth = parseInt(parts[1], 10) - 1;
          renderCalendar();
        }
      } catch(e){}
    });
    var del = document.createElement('button');
    del.className = 'calendar-event-del';
    del.innerHTML = '✕';
    del.addEventListener('click', function(e) {
      e.stopPropagation();
      showConfirm('¿Eliminar este evento?').then(function(ok) {
        if (ok) {
          db.collection(CALENDAR_COLLECTION).doc(ev.id).delete().catch(function(){});
        }
      });
    });
    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(del);
    el.calendarEventsList.appendChild(item);
  });
}

function showEventOnDay(ev) {
  var msg = (EVENT_ICONS[ev.type] || '📌') + ' ' + (ev.title || 'Sin nombre');
  if (ev.repeat) msg += ' (se repite cada año)';
  showInfo(msg);
}

function saveCalendarEvent() {
  if (!currentUser) { showError('Debes iniciar sesión'); return; }
  var title = el.eventTitleInput ? el.eventTitleInput.value.trim() : '';
  var date = el.eventDateInput ? el.eventDateInput.value : '';
  var type = el.eventTypeSelect ? el.eventTypeSelect.value : 'other';
  var repeat = el.eventRepeatCheck ? el.eventRepeatCheck.checked : false;
  if (!title) { showError('Escribe un nombre para el evento'); return; }
  if (!date) { showError('Selecciona una fecha'); return; }
  db.collection(CALENDAR_COLLECTION).add({
    title: title, date: date, type: type, repeat: repeat,
    createdAtMs: Date.now(), createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    uid: currentUser.uid, autor: username || ''
  }).then(function(docRef) {
    calendarEvents.push({ id: docRef.id, title: title, date: date, type: type, repeat: repeat, uid: currentUser.uid });
    calendarEvents.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
    if (el.calendarCount) el.calendarCount.textContent = calendarEvents.length || '';
    try {
      var parts = date.split('-');
      if (parts.length === 3) { calendarYear = parseInt(parts[0], 10); calendarMonth = parseInt(parts[1], 10) - 1; }
    } catch(e){}
    showSuccess('Evento guardado');
    if (el.eventModal) { el.eventModal.classList.add('hidden'); el.eventModal.style.display = 'none'; }
    renderCalendar();
  }).catch(function(e) {
    console.error('Calendar error:', e);
    showError('No se pudo guardar: ' + (e.message || e));
  });
}

/* ===== REMINDERS ===== */
function startRemindersListener() {
  if (!currentUser) return;
  if (remindersUnsubscribe) { remindersUnsubscribe(); remindersUnsubscribe = null; }
  remindersUnsubscribe = db.collection(REMINDERS_COLLECTION).onSnapshot(function(snap) {
    remindersItems = [];
    snap.forEach(function(doc) { remindersItems.push(Object.assign({}, doc.data(), { id: doc.id })); });
    remindersItems.sort(function(a, b) { return (a.remindAtMs || 0) - (b.remindAtMs || 0); });
    var activeCount = remindersItems.filter(function(r) { return !r.done; }).length;
    if (el.remindersCount) { el.remindersCount.textContent = activeCount > 0 ? activeCount : ''; el.remindersCount.classList.toggle('hidden', activeCount === 0); }
    if (el.remindersModal && el.remindersModal.style.display === 'flex') renderRemindersList();
    checkRemindersDue();
  }, function(err) { console.error('Reminders listener:', err); });
}

function openRemindersModal() {
  if (el.remindersModal) el.remindersModal.style.display = 'flex';
  renderRemindersList();
}
function closeRemindersModal() {
  if (el.remindersModal) el.remindersModal.style.display = 'none';
}

function renderRemindersList() {
  if (!el.remindersList) return;
  var showDone = remindersTab === 'done';
  var items = remindersItems.filter(function(r) { return showDone ? r.done : !r.done; });
  if (items.length === 0) {
    el.remindersList.innerHTML = '<div class="carta-empty">' + (showDone ? 'No hay completados aún' : 'No hay recordatorios pendientes') + '</div>';
    return;
  }
  el.remindersList.innerHTML = '';
  items.forEach(function(r) {
    var card = document.createElement('div');
    card.className = 'reminder-card' + (r.done ? ' done' : '') + ' ' + (r.priority || 'normal');
    var check = document.createElement('button');
    check.className = 'reminder-check' + (r.done ? ' checked' : '');
    check.addEventListener('click', function() {
      db.collection(REMINDERS_COLLECTION).doc(r.id).update({ done: !r.done, doneAtMs: r.done ? null : Date.now() }).catch(function(){});
    });
    var info = document.createElement('div');
    info.className = 'reminder-info';
    var title = document.createElement('div');
    title.className = 'reminder-title';
    title.textContent = r.title || 'Sin título';
    var time = document.createElement('div');
    time.className = 'reminder-time';
    var now = Date.now();
    if (r.remindAtMs) {
      var diff = r.remindAtMs - now;
      if (!r.done && diff < 0) {
        time.innerHTML = '<span class="material-symbols-outlined" style="font-size:12px;">warning</span> Venció ' + timeAgo(r.remindAtMs);
        time.classList.add('overdue');
      } else if (!r.done && diff < 3600000) {
        time.textContent = 'En ' + Math.round(diff / 60000) + ' min';
        time.style.color = '#f59e0b';
      } else {
        time.textContent = new Date(r.remindAtMs).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' + new Date(r.remindAtMs).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      }
    }
    if (r.repeat) { time.textContent += ' 🔄'; }
    info.appendChild(title);
    info.appendChild(time);
    var del = document.createElement('button');
    del.className = 'reminder-del';
    del.innerHTML = '✕';
    del.addEventListener('click', function() {
      db.collection(REMINDERS_COLLECTION).doc(r.id).delete().catch(function(){});
    });
    card.appendChild(check);
    card.appendChild(info);
    card.appendChild(del);
    el.remindersList.appendChild(card);
  });
  var activeCount = remindersItems.filter(function(r) { return !r.done; }).length;
  if (el.remindersActiveBadge) {
    el.remindersActiveBadge.textContent = activeCount > 0 ? activeCount : '';
    el.remindersActiveBadge.classList.toggle('hidden', activeCount === 0);
  }
}

function saveReminder() {
  var title = el.reminderTitleInput ? el.reminderTitleInput.value.trim() : '';
  var dt = el.reminderDatetimeInput ? el.reminderDatetimeInput.value : '';
  var priority = el.reminderPrioritySelect ? el.reminderPrioritySelect.value : 'normal';
  var repeat = el.reminderRepeatCheck ? el.reminderRepeatCheck.checked : false;
  var preMin = el.reminderPreSelect ? parseInt(el.reminderPreSelect.value, 10) : 15;
  if (isNaN(preMin) || preMin < 0) preMin = 15;
  if (!title) { showError('Escribe qué recordar'); return; }
  if (!dt) { showError('Selecciona fecha y hora'); return; }
  var remindAt = new Date(dt);
  if (remindAt.getTime() <= Date.now()) { showError('La fecha debe ser en el futuro'); return; }
  db.collection(REMINDERS_COLLECTION).add({
    title: title, remindAtMs: remindAt.getTime(), remindAt: dt,
    priority: priority, repeat: repeat, notifyBeforeMin: preMin, done: false,
    createdAtMs: Date.now(), createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    uid: currentUser.uid, autor: username || ''
  }).then(function() {
    showSuccess('Recordatorio guardado');
    if (el.reminderModal) el.reminderModal.style.display = 'none';
  }).catch(function(e) {
    console.error('Reminder error:', e);
    showError('No se pudo guardar');
  });
}

var REMINDER_NAG_MS = 15 * 60 * 1000;
function checkRemindersDue() {
  if (!currentUser) return;
  var now = Date.now();
  remindersItems.forEach(function(r) {
    if (r.done || !r.remindAtMs) return;
    var preMin = (r.notifyBeforeMin === undefined || r.notifyBeforeMin === null) ? 15 : r.notifyBeforeMin;
    var preMs = preMin * 60 * 1000;
    if (r.remindAtMs > now && preMs > 0 && (r.remindAtMs - now) <= preMs && !r._preNotified) {
      r._preNotified = true;
      showReminderPopup(r.title || 'Recordatorio', preMin);
      return;
    }
    if (r.remindAtMs <= now && (!r._lastNotifiedMs || (now - r._lastNotifiedMs) >= REMINDER_NAG_MS)) {
      r._lastNotifiedMs = now;
      showReminderPopup(r.title || 'Recordatorio', 0);
      if (r.repeat) {
        var nextDay = new Date(r.remindAtMs);
        nextDay.setDate(nextDay.getDate() + 1);
        db.collection(REMINDERS_COLLECTION).doc(r.id).update({ remindAtMs: nextDay.getTime() }).catch(function(){});
      }
    }
  });
}
var remindersCheckInterval = null;

/* ===== DETAILED STATISTICS ===== */
function openDetailedStats() {
  if (el.detailedStatsModal) el.detailedStatsModal.style.display = 'flex';
  renderDetailedStats();
}

function renderDetailedStats() {
  if (!el.dsTotal) return;
  var msgs = allMessages;
  el.dsTotal.textContent = msgs.length;
  var daySet = {};
  msgs.forEach(function(m) {
    var ts = m.timestamp || m.localTimestamp || 0;
    if (ts) { var d = new Date(ts).toDateString(); daySet[d] = true; }
  });
  el.dsDays.textContent = Object.keys(daySet).length;
  drawDailyChart(msgs);
  drawHourlyChart(msgs);
  drawPieChart(msgs);
  drawTopDays(msgs);
}

function drawDailyChart(msgs) {
  var canvas = document.getElementById('chart-daily');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  var days = [];
  var now = new Date();
  for (var i = 13; i >= 0; i--) {
    var d = new Date(now);
    d.setDate(d.getDate() - i);
    var key = d.toDateString();
    var count = msgs.filter(function(m) { return new Date(m.timestamp || m.localTimestamp || 0).toDateString() === key; }).length;
    days.push({ label: d.getDate() + '/' + (d.getMonth() + 1), count: count });
  }
  var maxVal = Math.max.apply(null, days.map(function(d) { return d.count; })) || 1;
  var barW = (w - 40) / days.length;
  var barArea = h - 45;
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(35, h - 30, w - 40, 1);
  days.forEach(function(day, i) {
    var barH = Math.max((day.count / maxVal) * barArea, day.count > 0 ? 8 : 0);
    var x = 35 + i * barW + barW * 0.2;
    var bw = barW * 0.6;
    var gradient = ctx.createLinearGradient(0, h - 30 - barH, 0, h - 30);
    gradient.addColorStop(0, '#c2185b');
    gradient.addColorStop(1, '#880e4f');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, h - 30 - barH, bw, barH, [3, 3, 0, 0]);
    ctx.fill();
    if (day.count > 0) {
      ctx.fillStyle = '#880e4f';
      ctx.font = 'bold 11px Manrope';
      ctx.textAlign = 'center';
      ctx.fillText(day.count, x + bw / 2, h - 33 - barH);
    }
    ctx.fillStyle = '#374151';
    ctx.font = '10px Manrope';
    ctx.textAlign = 'center';
    ctx.fillText(day.label, x + bw / 2, h - 10);
  });
}

function drawHourlyChart(msgs) {
  var canvas = document.getElementById('chart-hourly');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  var hours = new Array(24).fill(0);
  msgs.forEach(function(m) {
    var h2 = new Date(m.timestamp || m.localTimestamp || 0).getHours();
    hours[h2]++;
  });
  var maxVal = Math.max.apply(null, hours) || 1;
  var barW = (w - 30) / 24;
  hours.forEach(function(count, i) {
    var barH = Math.max((count / maxVal) * (h - 40), count > 0 ? 6 : 0);
    var x = 25 + i * barW + barW * 0.15;
    var bw = barW * 0.7;
    var gradient = ctx.createLinearGradient(0, h - 25 - barH, 0, h - 25);
    gradient.addColorStop(0, '#f59e0b');
    gradient.addColorStop(1, '#b45309');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, h - 25 - barH, bw, barH, [2, 2, 0, 0]);
    ctx.fill();
    ctx.fillStyle = '#374151';
    ctx.font = '10px Manrope';
    ctx.textAlign = 'center';
    ctx.fillText(i + 'h', x + bw / 2, h - 8);
  });
}

function drawPieChart(msgs) {
  var canvas = document.getElementById('chart-pie');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  var myUid = currentUser ? currentUser.uid : '';
  var mine = msgs.filter(function(m) { return m.uid === myUid; }).length;
  var partner = msgs.length - mine;
  var total = msgs.length || 1;
  var centerX = w / 2, centerY = h / 2, r = Math.min(w, h) / 2 - 30;
  var startAngle = -Math.PI / 2;
  if (mine > 0) {
    var mineAngle = (mine / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, r, startAngle, startAngle + mineAngle);
    ctx.closePath();
    ctx.fillStyle = '#c2185b';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    var midAngle = startAngle + mineAngle / 2;
    var lx = centerX + Math.cos(midAngle) * (r * 0.65);
    var ly = centerY + Math.sin(midAngle) * (r * 0.65);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Manrope';
    ctx.textAlign = 'center';
    ctx.fillText(mine, lx, ly + 5);
    startAngle += mineAngle;
  }
  if (partner > 0) {
    var partnerAngle = (partner / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, r, startAngle, startAngle + partnerAngle);
    ctx.closePath();
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    var midAngle2 = startAngle + partnerAngle / 2;
    var lx2 = centerX + Math.cos(midAngle2) * (r * 0.65);
    var ly2 = centerY + Math.sin(midAngle2) * (r * 0.65);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Manrope';
    ctx.textAlign = 'center';
    ctx.fillText(partner, lx2, ly2 + 5);
  }
  ctx.fillStyle = '#374151';
  ctx.font = '12px Manrope';
  ctx.textAlign = 'left';
  ctx.fillRect(w - 130, 12, 12, 12);
  ctx.fillStyle = '#c2185b';
  ctx.fillRect(w - 130, 12, 12, 12);
  ctx.fillStyle = '#374151';
  ctx.fillText('Tú', w - 112, 22);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(w - 130, 32, 12, 12);
  ctx.fillStyle = '#374151';
  ctx.fillText('Pareja', w - 112, 42);
}

function drawTopDays(msgs) {
  var container = document.getElementById('stats-top-days');
  if (!container) return;
  var dayCounts = {};
  msgs.forEach(function(m) {
    var d = new Date(m.timestamp || m.localTimestamp || 0);
    var key = d.toDateString();
    if (!dayCounts[key]) dayCounts[key] = { label: d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }), count: 0 };
    dayCounts[key].count++;
  });
  var sorted = Object.values(dayCounts).sort(function(a, b) { return b.count - a.count; }).slice(0, 5);
  var maxCount = sorted.length > 0 ? sorted[0].count : 1;
  container.innerHTML = '';
  sorted.forEach(function(day) {
    var row = document.createElement('div');
    row.className = 'stats-top-day';
    var name = document.createElement('span');
    name.className = 'stats-top-day-name';
    name.textContent = day.label;
    var bar = document.createElement('div');
    bar.className = 'stats-top-day-bar';
    bar.style.width = Math.round((day.count / maxCount) * 100) + '%';
    var count = document.createElement('span');
    count.className = 'stats-top-day-count';
    count.textContent = day.count;
    row.appendChild(name);
    row.appendChild(bar);
    row.appendChild(count);
    container.appendChild(row);
  });
}
function openMediaGallery() {
  if (!el.mediaGalleryModal || !el.mediaGalleryGrid) return;
  el.mediaGalleryGrid.innerHTML = '';
  var images = allMessages.filter(function(m) { return m.imageBase64 && !m.viewOnce; });
  if (!images.length) {
    el.mediaGalleryGrid.innerHTML = '<p style="text-align:center;padding:40px;color:#999;grid-column:1/-1">No hay imágenes en el chat</p>';
    el.mediaGalleryModal.style.display = 'flex';
    return;
  }
  images.reverse().forEach(function(m) {
    var card = document.createElement('div');
    card.className = 'media-card';
    var img = document.createElement('img');
    img.src = m.imageBase64;
    img.loading = 'lazy';
    img.className = 'media-thumb';
    var time = document.createElement('span');
    time.className = 'media-time';
    var ts = m.timestamp || m.createdAtMs || 0;
    time.textContent = ts ? new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '';
    card.appendChild(img);
    card.appendChild(time);
    card.addEventListener('click', function() {
      var imgs = images.map(function(m) { return m.imageBase64; });
      var idx = imgs.indexOf(m.imageBase64);
      openLightbox(m.imageBase64, imgs, idx >= 0 ? idx : 0);
    });
    el.mediaGalleryGrid.appendChild(card);
  });
  el.mediaGalleryModal.style.display = 'flex';
}
function closeMediaGallery() {
  if (el.mediaGalleryModal) el.mediaGalleryModal.style.display = 'none';
}
function updateMediaCount() {
  var count = allMessages.filter(function(m) { return m.imageBase64 && !m.viewOnce; }).length;
  if (el.mediaCount) el.mediaCount.textContent = count > 0 ? count : '';
}
function openCartasModal() {
  if (el.cartasModal) el.cartasModal.style.display = 'flex';
  setCartasTab(cartasTab);
}
function closeCartasModal() {
  hideCartasCompose();
  if (el.cartasModal) el.cartasModal.style.display = 'none';
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
  }, function(err){ console.error('Listener:', err && err.message); });
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
function hideWishlistModal() { exitSubPanel(el.wishlistModal); }

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

/* ============================================
   GIFS GIPHY (clave propia guardada localmente)
   ============================================ */
var GIPHY_KEY_STORAGE = 'chatpareja_giphy_key';
var GIPHY_DEFAULT_KEY = 'huBnnWBGPtWnH0vpbzXtayTQxYmmQTYE';
var gifPickerOverlay = null;
var gifSearchTimer = null;

function getGiphyKey() {
  try { return localStorage.getItem(GIPHY_KEY_STORAGE) || GIPHY_DEFAULT_KEY; } catch (e) { return GIPHY_DEFAULT_KEY; }
}
function toggleGifPicker() {
  if (!getGiphyKey()) { showError('Configura tu API key gratuita de GIPHY en Ajustes'); return; }
  if (gifPickerOverlay) { gifPickerOverlay.remove(); gifPickerOverlay = null; return; }
  var pickerMode = 'gifs';
  gifPickerOverlay = document.createElement('div');
  gifPickerOverlay.className = 'gif-picker-overlay';
  var panel = document.createElement('div');
  panel.className = 'gif-picker-panel';
  var head = document.createElement('div');
  head.className = 'gif-picker-head';
  var toggleRow = document.createElement('div');
  toggleRow.className = 'gif-picker-toggle';
  var btnGifs = document.createElement('button');
  btnGifs.type = 'button';
  btnGifs.className = 'gif-toggle-btn active';
  btnGifs.textContent = 'GIFs';
  var btnStickers = document.createElement('button');
  btnStickers.type = 'button';
  btnStickers.className = 'gif-toggle-btn';
  btnStickers.textContent = 'Stickers';
  toggleRow.appendChild(btnGifs);
  toggleRow.appendChild(btnStickers);
  var searchRow = document.createElement('div');
  searchRow.className = 'gif-picker-search-row';
  var search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Buscar GIFs...';
  search.className = 'gif-picker-search';
  search.setAttribute('autocomplete', 'off');
  search.setAttribute('autocorrect', 'off');
  search.setAttribute('autocapitalize', 'off');
  search.setAttribute('spellcheck', 'false');
  search.setAttribute('aria-label', 'Buscar GIFs o Stickers');
  var closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn-icon gif-picker-close';
  closeBtn.innerHTML = '\u2715';
  closeBtn.setAttribute('aria-label', 'Cerrar');
  searchRow.appendChild(search);
  searchRow.appendChild(closeBtn);
  head.appendChild(toggleRow);
  head.appendChild(searchRow);
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

  function setMode(mode) {
    pickerMode = mode;
    btnGifs.classList.toggle('active', mode === 'gifs');
    btnStickers.classList.toggle('active', mode === 'stickers');
    search.placeholder = mode === 'gifs' ? 'Buscar GIFs...' : 'Buscar Stickers...';
    hint.textContent = mode === 'gifs' ? 'Toca un GIF para enviarlo' : 'Toca un sticker para enviarlo';
    loadFeed(search.value.trim());
  }
  btnGifs.addEventListener('click', function() { setMode('gifs'); });
  btnStickers.addEventListener('click', function() { setMode('stickers'); });

  function loadFeed(q) {
    grid.innerHTML = '';
    for (var s = 0; s < 9; s++) {
      var skel = document.createElement('div');
      skel.className = 'gif-skel';
      grid.appendChild(skel);
    }
    var key = getGiphyKey();
    var type = pickerMode === 'stickers' ? 'stickers' : 'gifs';
    var url = q
      ? 'https://api.giphy.com/v1/' + type + '/search?api_key=' + encodeURIComponent(key) + '&q=' + encodeURIComponent(q) + '&limit=24&rating=pg-13'
      : 'https://api.giphy.com/v1/' + type + '/trending?api_key=' + encodeURIComponent(key) + '&limit=24&rating=pg-13';
    fetch(url).then(function(r) { return r.json(); }).then(function(json) {
      grid.innerHTML = '';
      if (!json.data || !json.data.length) {
        var label = pickerMode === 'stickers' ? 'stickers' : 'GIFs';
        grid.innerHTML = '<div class="gif-msg">' + (q ? 'Sin resultados para "' + escapeHtml(q) + '"' : 'No hay ' + label + ' por ahora') + '</div>';
        return;
      }
      json.data.forEach(function(g) {
        var img = document.createElement('img');
        img.src = g.images.fixed_width.url;
        img.alt = (g.title || (pickerMode === 'stickers' ? 'Sticker' : 'GIF'));
        img.loading = 'lazy';
        img.className = 'gif-thumb' + (pickerMode === 'stickers' ? ' sticker-thumb' : '');
        img.addEventListener('click', function() {
          sendGifMessage(g.images.original.url, g.images.original.width, g.images.original.height);
          closeGifPicker();
        });
        grid.appendChild(img);
      });
    }).catch(function() {
      grid.innerHTML = '<div class="gif-msg">Error de red — intentá de nuevo</div>';
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
    voiceRecStopBtn: document.getElementById('voice-rec-stop-btn'),
    audioPreviewModal: document.getElementById('audio-preview-modal'),
    audioPreviewPlayBtn: document.getElementById('audio-preview-play-btn'),
    audioPreviewSendBtn: document.getElementById('audio-preview-send-btn'),
    audioPreviewDiscardBtn: document.getElementById('audio-preview-discard-btn'),
    audioPreviewCloseBtn: document.getElementById('audio-preview-close-btn'),
    pinnedBtn: document.getElementById('pinned-btn'),
    pinnedBanner: document.getElementById('pinned-banner'),
    pinnedMain: document.getElementById('pinned-main'),
    pinnedPreview: document.getElementById('pinned-preview'),
    pinnedCounter: document.getElementById('pinned-counter'),
    pinnedPrevBtn: document.getElementById('pinned-prev-btn'),
    pinnedNextBtn: document.getElementById('pinned-next-btn'),
    pinnedUnpinBtn: document.getElementById('pinned-unpin-btn'),
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
    avatarLightbox: document.getElementById('avatar-lightbox'),
    avatarLightboxImg: document.getElementById('avatar-lightbox-img'),
    avatarLightboxClose: document.getElementById('avatar-lightbox-close'),
    partnerProfileName: document.getElementById('partner-profile-name'),
    partnerProfileBio: document.getElementById('partner-profile-bio'),
    headerPartnerAvatar: document.getElementById('header-partner-avatar'),
    headerPartnerImg: document.getElementById('header-partner-img'),
    headerPartnerBio: document.getElementById('header-partner-bio'),
    headerPartnerInitial: document.getElementById('header-partner-initial'),
    themeSelect: document.getElementById('theme-select'),
    chatBgInput: document.getElementById('chat-bg-input'),
    chatBgPreview: document.getElementById('chat-bg-preview'),
    chatBgClearBtn: document.getElementById('chat-bg-clear-btn'),
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
    previewViewOnceBtn: document.getElementById('preview-viewonce-btn'),
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
    moreBtn: document.getElementById('more-btn'),
    moreBadge: document.getElementById('more-badge'),
    moreModal: document.getElementById('more-modal'),
    moreCloseBtn: document.getElementById('more-close-btn'),
    mediaGalleryBtn: document.getElementById('media-gallery-btn'),
    mediaGalleryModal: document.getElementById('media-gallery-modal'),
    mediaGalleryClose: document.getElementById('media-gallery-close'),
    mediaGalleryGrid: document.getElementById('media-gallery-grid'),
    mediaCount: document.getElementById('media-count'),
    cartasRow: document.getElementById('cartas-row'),
    calendarRow: document.getElementById('calendar-row'),
    remindersRow: document.getElementById('reminders-row'),
    cartasUnreadBadge: document.getElementById('cartas-unread-badge'),
    cartasModal: document.getElementById('cartas-modal'),
    cartasCloseBtn: document.getElementById('cartas-close-btn'),
    cartasTabIn: document.getElementById('cartas-tab-in'),
    cartasTabOut: document.getElementById('cartas-tab-out'),
    cartasInBadge: document.getElementById('cartas-in-badge'),
    cartasNewBtn: document.getElementById('cartas-new-btn'),
    cartasCompose: document.getElementById('cartas-compose'),
    cartaInput: document.getElementById('carta-input'),
    cartaBody: document.getElementById('carta-compose-body'),
    cartaCounter: document.getElementById('carta-counter'),
    cartaCancelBtn: document.getElementById('carta-cancel-btn'),
    cartaSendBtn: document.getElementById('carta-send-btn'),
    cartasList: document.getElementById('cartas-list'),
    cartaReader: document.getElementById('carta-reader'),
    cartaReadFrom: document.getElementById('carta-read-from'),
    cartaReadDate: document.getElementById('carta-read-date'),
    cartaReadText: document.getElementById('carta-read-text'),
    cartaCloseBtn: document.getElementById('carta-close-btn'),
    cartaReadImgWrap: document.getElementById('carta-read-img-wrap'),
    cartaReadImg: document.getElementById('carta-read-img'),
    cartaReadScheduleInfo: document.getElementById('carta-read-schedule-info'),
    cartaReadScheduleText: document.getElementById('carta-read-schedule-text'),
    cartaImgBtn: document.getElementById('carta-img-btn'),
    cartaImgInput: document.getElementById('carta-img-input'),
    cartaImgPreview: document.getElementById('carta-img-preview'),
    cartaImgThumb: document.getElementById('carta-img-thumb'),
    cartaImgRemove: document.getElementById('carta-img-remove'),
    cartaScheduleBtn: document.getElementById('carta-schedule-btn'),
    cartaSchedulePicker: document.getElementById('carta-schedule-picker'),
    cartaScheduleDatetime: document.getElementById('carta-schedule-datetime'),
    cartaScheduleConfirm: document.getElementById('carta-schedule-confirm'),
    cartaSchedulePreview: document.getElementById('carta-schedule-preview'),
    cartaScheduleText: document.getElementById('carta-schedule-text'),
    cartaScheduleRemove: document.getElementById('carta-schedule-remove'),
    cartaStatsBtn: document.getElementById('cartas-stats-btn'),
    cartaStatsPanel: document.getElementById('cartas-stats-panel'),
    statSent: document.getElementById('stat-sent'),
    statReceived: document.getElementById('stat-received'),
    statRead: document.getElementById('stat-read'),
    statUnread: document.getElementById('stat-unread'),
    calendarModal: document.getElementById('calendar-modal'),
    calendarCloseBtn: document.getElementById('calendar-close-btn'),
    calendarPrevBtn: document.getElementById('calendar-prev-btn'),
    calendarNextBtn: document.getElementById('calendar-next-btn'),
    calendarMonthLabel: document.getElementById('calendar-month-label'),
    calendarGrid: document.getElementById('calendar-grid'),
    calendarEventsList: document.getElementById('calendar-events-list'),
    calendarAddBtn: document.getElementById('calendar-add-btn'),
    calendarCount: document.getElementById('calendar-count'),
    eventModal: document.getElementById('event-modal'),
    eventTitleInput: document.getElementById('event-title-input'),
    eventDateInput: document.getElementById('event-date-input'),
    eventTypeSelect: document.getElementById('event-type-select'),
    eventRepeatCheck: document.getElementById('event-repeat-check'),
    eventCancelBtn: document.getElementById('event-cancel-btn'),
    eventSaveBtn: document.getElementById('event-save-btn'),
    detailedStatsModal: document.getElementById('detailed-stats-modal'),
    detailedStatsBtn: document.getElementById('detailed-stats-btn'),
    statsCloseBtn: document.getElementById('stats-close-btn'),
    dsTotal: document.getElementById('ds-total'),
    dsDays: document.getElementById('ds-days'),
    remindersModal: document.getElementById('reminders-modal'),
    remindersCloseBtn: document.getElementById('reminders-close-btn'),
    remindersTabActive: document.getElementById('reminders-tab-active'),
    remindersTabDone: document.getElementById('reminders-tab-done'),
    remindersActiveBadge: document.getElementById('reminders-active-badge'),
    remindersList: document.getElementById('reminders-list'),
    remindersAddBtn: document.getElementById('reminders-add-btn'),
    remindersCount: document.getElementById('reminders-count'),
    reminderModal: document.getElementById('reminder-modal'),
    reminderTitleInput: document.getElementById('reminder-title-input'),
    reminderDatetimeInput: document.getElementById('reminder-datetime-input'),
    reminderPrioritySelect: document.getElementById('reminder-priority-select'),
    reminderPreSelect: document.getElementById('reminder-pre-select'),
    reminderRepeatCheck: document.getElementById('reminder-repeat-check'),
    reminderCancelBtn: document.getElementById('reminder-cancel-btn'),
    reminderSaveBtn: document.getElementById('reminder-save-btn')
  };

  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).then(function() {
    initTheme();

    /* STATIC ICONS */
    renderIcon(document.querySelector('.welcome-icon'), 'messageCircle');
    renderIcon(document.querySelector('.drag-drop-icon'), 'upload');
    renderIcon(document.querySelector('.scroll-icon'), 'arrowDown');
    renderIcon(el.imageBtn && el.imageBtn.querySelector('.btn-media-inner'), 'image');
    renderIcon(el.pinnedBtn && el.pinnedBtn.querySelector('.btn-icon-inner'), 'pin');
    renderIcon(el.searchToggleBtn && el.searchToggleBtn.querySelector('.btn-icon-inner'), 'search');
    renderIcon(el.moreBtn && el.moreBtn.querySelector('.btn-icon-inner'), 'more');
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

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        showPrivacyOverlay();
        if (!currentUser) return;
        if (returningFromNativePicker()) return;
        try { sessionStorage.removeItem('chatpareja_refresh_pw'); } catch(e){}
        cleanupListeners();
        auth.signOut().then(function() {
          currentUser = null;
          currentUserRole = null;
          if (el.loginScreen) el.loginScreen.style.display = 'none';
          if (el.chatContainer) el.chatContainer.style.display = 'none';
          var ss = document.getElementById('splash-screen');
          if (ss) { ss.classList.remove('hidden'); splashVisible = true; }
        });
      } else {
        clearNativePickerFlag();
        hidePrivacyOverlay();
      }
    });
    window.addEventListener('blur', function() { if (currentUser) showPrivacyOverlay(); });
    window.addEventListener('focus', function() { if (!document.hidden) hidePrivacyOverlay(); });
    window.addEventListener('pagehide', function() { showPrivacyOverlay(); });

  /* PAIRING */
  var pairingGenerateBtn = document.getElementById('pairing-generate-btn');
  if (pairingGenerateBtn) pairingGenerateBtn.addEventListener('click', function() {
    var btn = pairingGenerateBtn;
    btn.disabled = true;
    var btnText = btn.querySelector('.btn-text');
    if (btnText) btnText.textContent = 'Generando...';
    createPairingAsOwner(currentUser.uid).then(function(code) {
      pairingState = 'show_code';
      showPairingModal('show_code');
      var codeDisplay = document.getElementById('pairing-code-display');
      if (codeDisplay) codeDisplay.textContent = code;
      btn.disabled = false;
      if (btnText) btnText.textContent = 'Generar código';
    }).catch(function(e) {
      console.error('Pairing error:', e);
      btn.disabled = false;
      if (btnText) btnText.textContent = 'Generar código';
      showError('No se pudo generar el código');
    });
  });
  var pairingCopyBtn = document.getElementById('pairing-copy-btn');
  if (pairingCopyBtn) pairingCopyBtn.addEventListener('click', function() {
    var codeDisplay = document.getElementById('pairing-code-display');
    var code = codeDisplay ? codeDisplay.textContent : '';
    navigator.clipboard.writeText(code).then(function() {
      var btnText = pairingCopyBtn.querySelector('.btn-text');
      var original = btnText ? btnText.textContent : '';
      if (btnText) btnText.textContent = '¡Copiado!';
      setTimeout(function() { if (btnText) btnText.textContent = original; }, 2000);
    }).catch(function() {});
  });
  var pairingSubmitBtn = document.getElementById('pairing-submit-btn');
  if (pairingSubmitBtn) pairingSubmitBtn.addEventListener('click', function() {
    var input = document.getElementById('pairing-code-input');
    var code = input ? input.value.trim() : '';
    var errorEl = document.getElementById('pairing-error');
    var btn = pairingSubmitBtn;
    if (!code || code.length !== 6) {
      if (errorEl) { errorEl.textContent = 'Ingresa un código de 6 dígitos'; errorEl.classList.remove('hidden'); }
      return;
    }
    btn.disabled = true;
    var btnText = btn.querySelector('.btn-text');
    if (btnText) btnText.textContent = 'Uniendo...';
    joinPairingAsPartner(currentUser.uid, code).then(function() {
      pairingState = 'paired';
      showPairingModal('success');
      var successText = document.getElementById('pairing-success-text');
      if (successText) successText.textContent = 'Ya pueden chatear juntos 💕';
      btn.disabled = false;
      if (btnText) btnText.textContent = 'Unirse';
    }).catch(function(e) {
      console.error('Join pairing error:', e);
      if (errorEl) { errorEl.textContent = e.message || 'Error al unirse'; errorEl.classList.remove('hidden'); }
      btn.disabled = false;
      if (btnText) btnText.textContent = 'Unirse';
    });
  });
  var pairingContinueBtn = document.getElementById('pairing-continue-btn');
  if (pairingContinueBtn) pairingContinueBtn.addEventListener('click', function() {
    hidePairingModal();
    hideLoginScreen();
    initializeUser();
  });
  var pairingCodeInput = document.getElementById('pairing-code-input');
  if (pairingCodeInput) pairingCodeInput.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '').slice(0, 6);
    var errorEl = document.getElementById('pairing-error');
    if (errorEl) errorEl.classList.add('hidden');
  });

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
  if (el.imageInputCamera) el.imageInputCamera.addEventListener('change', function(e) { clearNativePickerFlag(); if (e.target.files.length > 0) showImagePreviewModal(e.target.files); e.target.value = ''; });
  if (el.imageInputGallery) el.imageInputGallery.addEventListener('change', function(e) { clearNativePickerFlag(); if (e.target.files.length > 0) showImagePreviewModal(e.target.files); e.target.value = ''; });
  ['imageInputCamera', 'imageInputGallery', 'profileAvatarInput', 'chatBgInput', 'cartaImgInput'].forEach(function(k) {
    if (el[k]) {
      el[k].addEventListener('click', markNativePickerOpen);
      el[k].addEventListener('change', clearNativePickerFlag);
    }
  });
  if (el.previewSendBtn) el.previewSendBtn.addEventListener('click', sendPendingImages);
  if (el.previewViewOnceBtn) el.previewViewOnceBtn.addEventListener('click', function() {
    pendingViewOnce = !pendingViewOnce;
    el.previewViewOnceBtn.classList.toggle('active', pendingViewOnce);
    if (pendingViewOnce) {
      el.previewViewOnceBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">visibility_off</span> Ver una vez';
    } else {
      el.previewViewOnceBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">visibility</span> Ver una vez';
    }
  });
  if (el.previewCancelBtn) el.previewCancelBtn.addEventListener('click', hideImagePreviewModal);
  if (el.previewCloseBtn) el.previewCloseBtn.addEventListener('click', hideImagePreviewModal);

  /* IMAGE CHIP REMOVE */
  var chipRemoveBtn = document.getElementById('image-chip-remove');
  if (chipRemoveBtn) chipRemoveBtn.addEventListener('click', function() { hideImagePreviewModal(); hideImageChip(); });

  /* VOICE RECORDING & PREVIEW EVENTS */
  var voiceTimer = null;
  var isHoldingVoiceBtn = false;

  if (el.voiceBtn) {
    el.voiceBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (isHoldingVoiceBtn) {
        isHoldingVoiceBtn = false;
        return;
      }
      if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
        stopVoiceRecording();
      } else {
        startVoiceRecording();
      }
    });

    el.voiceBtn.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      clearTimeout(voiceTimer);
      voiceTimer = setTimeout(function() {
        isHoldingVoiceBtn = true;
        startVoiceRecording();
      }, 300);
    });

    el.voiceBtn.addEventListener('mouseup', function() {
      clearTimeout(voiceTimer);
      if (isHoldingVoiceBtn) {
        stopVoiceRecording();
        setTimeout(function() { isHoldingVoiceBtn = false; }, 100);
      }
    });

    el.voiceBtn.addEventListener('mouseleave', function() {
      clearTimeout(voiceTimer);
      if (isHoldingVoiceBtn) {
        stopVoiceRecording();
        setTimeout(function() { isHoldingVoiceBtn = false; }, 100);
      }
    });

    el.voiceBtn.addEventListener('touchstart', function(e) {
      clearTimeout(voiceTimer);
      voiceTimer = setTimeout(function() {
        isHoldingVoiceBtn = true;
        startVoiceRecording();
      }, 300);
    }, { passive: true });

    el.voiceBtn.addEventListener('touchend', function(e) {
      clearTimeout(voiceTimer);
      if (isHoldingVoiceBtn) {
        e.preventDefault();
        stopVoiceRecording();
        setTimeout(function() { isHoldingVoiceBtn = false; }, 100);
      }
    });
  }

  var vstop = document.getElementById('voice-rec-stop-btn');
  if (vstop) vstop.addEventListener('click', stopVoiceRecording);

  var vrc = document.getElementById('voice-rec-cancel-btn');
  if (vrc) vrc.addEventListener('click', cancelVoiceRecording);

  var apPlay = document.getElementById('audio-preview-play-btn');
  if (apPlay) {
    apPlay.addEventListener('click', function() {
      if (!audioPreviewAudio) return;
      if (audioPreviewAudio.paused) {
        if (currentlyPlayingAudio && currentlyPlayingAudio !== audioPreviewAudio) {
          try { currentlyPlayingAudio.pause(); } catch(err){}
        }
        currentlyPlayingAudio = audioPreviewAudio;
        audioPreviewAudio.play().then(function() {
          apPlay.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>';
        }).catch(function(){});
      } else {
        audioPreviewAudio.pause();
        if (currentlyPlayingAudio === audioPreviewAudio) currentlyPlayingAudio = null;
        apPlay.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8 5v14l11-7z"/></svg>';
      }
    });
  }

  var apSend = document.getElementById('audio-preview-send-btn');
  if (apSend) apSend.addEventListener('click', sendPendingAudio);

  var apDiscard = document.getElementById('audio-preview-discard-btn');
  if (apDiscard) apDiscard.addEventListener('click', hideAudioPreviewModal);

  var apClose = document.getElementById('audio-preview-close-btn');
  if (apClose) apClose.addEventListener('click', hideAudioPreviewModal);

  /* EMOJI */
  if (el.emojiBtn) el.emojiBtn.addEventListener('click', toggleEmojiPicker);

  /* GIFS */
  if (el.gifBtn) el.gifBtn.addEventListener('click', toggleGifPicker);

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
    closeMoreModal();
    enterSubPanel(el.wishlistModal);
    renderWishlistList();
    setTimeout(function() { if (el.wishlistInput) el.wishlistInput.focus(); }, 150);
  }
  if (el.wishlistBtn) el.wishlistBtn.addEventListener('click', openWishlistModal);
  if (el.wishlistCloseBtn) el.wishlistCloseBtn.addEventListener('click', function(){ hideWishlistModal(); });
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

  /* FORCE REFRESH */
  var forceRefreshBtn = document.getElementById('force-refresh-btn');
  if (forceRefreshBtn) forceRefreshBtn.addEventListener('click', function() {
    if ('caches' in window) {
      caches.keys().then(function(names) {
        return Promise.all(names.map(function(n) { return caches.delete(n); }));
      }).then(function() {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(function(regs) {
            return Promise.all(regs.map(function(r) { return r.unregister(); }));
          }).then(function() { location.reload(true); });
        } else { location.reload(true); }
      });
    } else { location.reload(true); }
  });

  /* SPLASH ENTER */
  var splashEnterBtn = document.getElementById('splash-enter-btn');
  var splashScreen = document.getElementById('splash-screen');
  if (splashEnterBtn && splashScreen) {
    splashEnterBtn.addEventListener('click', function() {
      setTimeout(function() { splashScreen.classList.add('hidden'); splashVisible = false; showLoginScreen(); }, 7000);
    });
  }

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
    if (pinnedMessages.length > 0) {
      pinnedDismissedSig = null;
      try { sessionStorage.removeItem(PINNED_DISMISS_KEY); } catch(err){}
      renderPinnedBanner();
      scrollToMessage(currentPin().id);
    } else if (el.pinnedBanner) setPinnedBannerVisible(false);
  });
  if (el.pinnedMain) el.pinnedMain.addEventListener('click', function() {
    var pin = currentPin();
    if (pin) scrollToMessage(pin.id);
  });
  if (el.pinnedMain) el.pinnedMain.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); var pin = currentPin(); if (pin) scrollToMessage(pin.id); }
  });
  if (el.pinnedPrevBtn) el.pinnedPrevBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (pinnedMessages.length < 2) return;
    pinnedIndex = (pinnedIndex - 1 + pinnedMessages.length) % pinnedMessages.length;
    renderPinnedBanner();
  });
  if (el.pinnedNextBtn) el.pinnedNextBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (pinnedMessages.length < 2) return;
    pinnedIndex = (pinnedIndex + 1) % pinnedMessages.length;
    renderPinnedBanner();
  });
  if (el.pinnedUnpinBtn) el.pinnedUnpinBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    var pin = currentPin();
    if (pin) unpinMessage(pin.id);
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
  if (el.profileAvatar) el.profileAvatar.addEventListener('click', function(e) {
    if (myProfile.avatarBase64) {
      openLightbox(myProfile.avatarBase64);
    }
  });
  var camBtn = document.getElementById('profile-avatar-camera-btn');
  if (camBtn) camBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (el.profileAvatarInput) el.profileAvatarInput.click();
  });
  if (el.profileAvatarInput) el.profileAvatarInput.addEventListener('change', function(e) {
    if (!e.target.files || !e.target.files[0]) return;
    resizeAvatarForProfile(e.target.files[0]).then(function(dataUrl) {
      myProfile.avatarBase64 = dataUrl;
      updateMyProfileUI();
      e.target.value = '';
    });
  });
  if (el.partnerProfileAvatar) el.partnerProfileAvatar.addEventListener('click', function() {
    var av = partnerProfile.avatarBase64;
    if (!av) return;
    openLightbox(av);
  });
  if (el.headerPartnerAvatar) el.headerPartnerAvatar.addEventListener('click', function() {
    var av = partnerProfile.avatarBase64;
    if (!av) return;
    openLightbox(av);
  });

  /* MÁS (HUB) */
  if (el.moreBtn) el.moreBtn.addEventListener('click', openMoreModal);
  if (el.moreCloseBtn) el.moreCloseBtn.addEventListener('click', closeMoreModal);
  if (el.moreModal) el.moreModal.addEventListener('click', function(e) { if (e.target === el.moreModal) closeMoreModal(); });
  if (el.cartasRow) el.cartasRow.addEventListener('click', function() { closeMoreModal(); openCartasModal(); });
  if (el.mediaGalleryBtn) el.mediaGalleryBtn.addEventListener('click', function() { closeMoreModal(); openMediaGallery(); });
  if (el.mediaGalleryClose) el.mediaGalleryClose.addEventListener('click', closeMediaGallery);
  if (el.mediaGalleryModal) el.mediaGalleryModal.addEventListener('click', function(e) { if (e.target === el.mediaGalleryModal) closeMediaGallery(); });

  /* CARTAS */
  if (el.cartasCloseBtn) el.cartasCloseBtn.addEventListener('click', closeCartasModal);
  if (el.cartasModal) el.cartasModal.addEventListener('click', function(e) { if (e.target === el.cartasModal) closeCartasModal(); });
  if (el.cartasTabIn) el.cartasTabIn.addEventListener('click', function() { setCartasTab('in'); });
  if (el.cartasTabOut) el.cartasTabOut.addEventListener('click', function() { setCartasTab('out'); });
  if (el.cartasNewBtn) el.cartasNewBtn.addEventListener('click', function() {
    if (el.cartasCompose) el.cartasCompose.classList.remove('hidden');
    if (el.cartasNewBtn) el.cartasNewBtn.style.display = 'none';
    setTimeout(function() { if (el.cartaInput) el.cartaInput.focus(); }, 120);
  });
  if (el.cartaInput) el.cartaInput.addEventListener('input', function() {
    if (el.cartaCounter) {
      var total = el.cartaInput.value.length + (el.cartaBody ? el.cartaBody.value.length : 0);
      el.cartaCounter.textContent = total + '/4000';
    }
  });
  if (el.cartaBody) el.cartaBody.addEventListener('input', function() {
    if (el.cartaCounter) {
      var total = (el.cartaInput ? el.cartaInput.value.length : 0) + el.cartaBody.value.length;
      el.cartaCounter.textContent = total + '/4000';
    }
  });
  if (el.cartaCancelBtn) el.cartaCancelBtn.addEventListener('click', hideCartasCompose);
  if (el.cartaSendBtn) el.cartaSendBtn.addEventListener('click', sendCarta);
  if (el.cartaCloseBtn) el.cartaCloseBtn.addEventListener('click', closeCartaReader);
  if (el.cartaReader) el.cartaReader.addEventListener('click', function(e) { if (e.target === el.cartaReader) closeCartaReader(); });
  document.querySelectorAll('.carta-compose-seal-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.carta-compose-seal-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });
  if (el.cartaImgBtn) el.cartaImgBtn.addEventListener('click', function() { if (el.cartaImgInput) el.cartaImgInput.click(); });
  if (el.cartaImgInput) el.cartaImgInput.addEventListener('change', function(e) {
    if (!e.target.files || !e.target.files[0]) return;
    var file = e.target.files[0];
    if (file.size > 5 * 1024 * 1024) { showError('La imagen no puede superar 5MB'); return; }
    var reader = new FileReader();
    reader.onload = function(ev) {
      cartaSelectedImage = ev.target.result;
      if (el.cartaImgThumb) el.cartaImgThumb.src = cartaSelectedImage;
      if (el.cartaImgPreview) el.cartaImgPreview.classList.remove('hidden');
      if (el.cartaImgBtn) el.cartaImgBtn.classList.add('active');
    };
    reader.readAsDataURL(file);
  });
  if (el.cartaImgRemove) el.cartaImgRemove.addEventListener('click', function() {
    cartaSelectedImage = null;
    if (el.cartaImgPreview) el.cartaImgPreview.classList.add('hidden');
    if (el.cartaImgThumb) el.cartaImgThumb.src = '';
    if (el.cartaImgInput) el.cartaImgInput.value = '';
    if (el.cartaImgBtn) el.cartaImgBtn.classList.remove('active');
  });
  if (el.cartaScheduleBtn) el.cartaScheduleBtn.addEventListener('click', function() {
    if (el.cartaSchedulePicker) {
      var isHidden = el.cartaSchedulePicker.classList.contains('hidden');
      el.cartaSchedulePicker.classList.toggle('hidden');
      el.cartaScheduleBtn.classList.toggle('active', isHidden);
    }
  });
  if (el.cartaScheduleConfirm) el.cartaScheduleConfirm.addEventListener('click', function() {
    var val = el.cartaScheduleDatetime ? el.cartaScheduleDatetime.value : '';
    if (!val) { showError('Selecciona una fecha y hora'); return; }
    var d = new Date(val);
    if (d.getTime() <= Date.now()) { showError('La fecha debe ser en el futuro'); return; }
    cartaScheduledDate = d;
    var dateStr = d.toLocaleDateString('es-ES') + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (el.cartaScheduleText) el.cartaScheduleText.textContent = dateStr;
    if (el.cartaSchedulePreview) el.cartaSchedulePreview.classList.remove('hidden');
    if (el.cartaSchedulePicker) el.cartaSchedulePicker.classList.add('hidden');
    if (el.cartaScheduleBtn) el.cartaScheduleBtn.classList.add('active');
  });
  if (el.cartaScheduleRemove) el.cartaScheduleRemove.addEventListener('click', function() {
    cartaScheduledDate = null;
    if (el.cartaSchedulePreview) el.cartaSchedulePreview.classList.add('hidden');
    if (el.cartaScheduleDatetime) el.cartaScheduleDatetime.value = '';
    if (el.cartaScheduleBtn) el.cartaScheduleBtn.classList.remove('active');
  });
  if (el.cartaStatsBtn) el.cartaStatsBtn.addEventListener('click', function() {
    if (el.cartaStatsPanel) el.cartaStatsPanel.classList.toggle('hidden');
    updateCartasStats();
  });

  /* DESTACADOS */
  if (el.myDestacadosBtn) el.myDestacadosBtn.addEventListener('click', function() { closeMoreModal(); showDestacadosModal('my'); });
  if (el.partnerDestacadosBtn) el.partnerDestacadosBtn.addEventListener('click', function() { closeMoreModal(); showDestacadosModal('partner'); });
  if (el.destacadosCloseBtn) el.destacadosCloseBtn.addEventListener('click', hideDestacadosModal);
  if (el.destacadosModal) el.destacadosModal.addEventListener('click', function(e) { if (e.target === el.destacadosModal) hideDestacadosModal(); });
  if (el.shareDestacadosToggle) el.shareDestacadosToggle.addEventListener('change', toggleShareDestacados);

  /* CALENDAR */
  if (el.calendarRow) el.calendarRow = document.getElementById('calendar-row');
  if (el.calendarRow) el.calendarRow.addEventListener('click', function() { closeMoreModal(); openCalendarModal(); });
  if (el.calendarCloseBtn) el.calendarCloseBtn.addEventListener('click', closeCalendarModal);
  if (el.calendarModal) el.calendarModal.addEventListener('click', function(e) { if (e.target === el.calendarModal) closeCalendarModal(); });
  if (el.calendarPrevBtn) el.calendarPrevBtn.addEventListener('click', function() { calendarMonth--; if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; } renderCalendar(); });
  if (el.calendarNextBtn) el.calendarNextBtn.addEventListener('click', function() { calendarMonth++; if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; } renderCalendar(); });
  if (el.calendarAddBtn) el.calendarAddBtn.addEventListener('click', function() {
    if (el.eventModal) { el.eventModal.classList.remove('hidden'); el.eventModal.style.display = 'flex'; }
    if (el.eventTitleInput) el.eventTitleInput.value = '';
    if (el.eventDateInput) el.eventDateInput.value = calendarYear + '-' + String(calendarMonth + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
    if (el.eventRepeatCheck) el.eventRepeatCheck.checked = false;
    setTimeout(function() { if (el.eventTitleInput) el.eventTitleInput.focus(); }, 120);
  });
  if (el.eventCancelBtn) el.eventCancelBtn.addEventListener('click', function() { if (el.eventModal) { el.eventModal.classList.add('hidden'); el.eventModal.style.display = 'none'; } });
  if (el.eventSaveBtn) el.eventSaveBtn.addEventListener('click', saveCalendarEvent);

  /* DETAILED STATS */
  if (el.detailedStatsBtn) el.detailedStatsBtn.addEventListener('click', function() { closeMoreModal(); openDetailedStats(); });
  if (el.statsCloseBtn) el.statsCloseBtn.addEventListener('click', function() { if (el.detailedStatsModal) el.detailedStatsModal.style.display = 'none'; });
  if (el.detailedStatsModal) el.detailedStatsModal.addEventListener('click', function(e) { if (e.target === el.detailedStatsModal) el.detailedStatsModal.style.display = 'none'; });

  /* REMINDERS */
  el.remindersRow = document.getElementById('reminders-row');
  if (el.remindersRow) el.remindersRow.addEventListener('click', function() { closeMoreModal(); openRemindersModal(); });
  if (el.remindersCloseBtn) el.remindersCloseBtn.addEventListener('click', closeRemindersModal);
  if (el.remindersModal) el.remindersModal.addEventListener('click', function(e) { if (e.target === el.remindersModal) closeRemindersModal(); });
  if (el.remindersTabActive) el.remindersTabActive.addEventListener('click', function() { remindersTab = 'active'; el.remindersTabActive.classList.add('active'); el.remindersTabDone.classList.remove('active'); renderRemindersList(); });
  if (el.remindersTabDone) el.remindersTabDone.addEventListener('click', function() { remindersTab = 'done'; el.remindersTabDone.classList.add('active'); el.remindersTabActive.classList.remove('active'); renderRemindersList(); });
  if (el.remindersAddBtn) el.remindersAddBtn.addEventListener('click', function() {
    if (el.reminderModal) el.reminderModal.style.display = 'flex';
    if (el.reminderTitleInput) el.reminderTitleInput.value = '';
    if (el.reminderDatetimeInput) {
      var now = new Date();
      now.setMinutes(now.getMinutes() + 30);
      el.reminderDatetimeInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + 'T' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }
    if (el.reminderRepeatCheck) el.reminderRepeatCheck.checked = false;
    setTimeout(function() { if (el.reminderTitleInput) el.reminderTitleInput.focus(); }, 120);
  });
  if (el.reminderCancelBtn) el.reminderCancelBtn.addEventListener('click', function() { if (el.reminderModal) el.reminderModal.style.display = 'none'; });
  if (el.reminderSaveBtn) el.reminderSaveBtn.addEventListener('click', saveReminder);

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
    if (el.messagesContainer.scrollTop < 80 && allMessages.length > visibleCount && !loadingOlder && firstSnapshotReceived && Date.now() >= suppressLoadOlderUntil) {
      loadOlderMessages();
    }
  });

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
      closeMoreModal();
      closeCartasModal();
      closeCartaReader();
      closeCalendarModal();
      if (el.eventModal) el.eventModal.style.display = 'none';
      closeRemindersModal();
      if (el.reminderModal) el.reminderModal.style.display = 'none';
      if (el.detailedStatsModal) el.detailedStatsModal.style.display = 'none';
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
  window.addEventListener('online', function() { isOnline = true; if (el.offlineBanner) el.offlineBanner.style.display = 'none'; flushOfflineQueue(); flushCartasOfflineQueue(); });
  window.addEventListener('offline', function() { isOnline = false; if (el.offlineBanner) el.offlineBanner.style.display = 'flex'; });
  if (!isOnline && el.offlineBanner) el.offlineBanner.style.display = 'flex';

  /* THEME CHANGE */
  if (el.themeSelect) el.themeSelect.addEventListener('change', function(e) { setTheme(e.target.value); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    var t = 'system'; try { t = localStorage.getItem('chatpareja_theme') || 'system'; } catch(e){} if (t === 'system') initTheme();
  });

  /* CHAT BACKGROUND (INDEXEDDB + STORAGE PERSISTENCE) */
  var ChatBgStorage = (function() {
    var DB_NAME = 'ChatParejaBgDB';
    var STORE_NAME = 'wallpapers';
    var KEY = 'current_bg';

    function openDB() {
      return new Promise(function(resolve, reject) {
        if (!window.indexedDB) { reject(new Error('No IndexedDB')); return; }
        var req = window.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function(e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = function(e) { resolve(e.target.result); };
        req.onerror = function(e) { reject(e.target.error); };
      });
    }

    return {
      save: function(dataUrl) {
        return openDB().then(function(db) {
          return new Promise(function(resolve, reject) {
            var tx = db.transaction(STORE_NAME, 'readwrite');
            var store = tx.objectStore(STORE_NAME);
            var req = store.put(dataUrl, KEY);
            req.onsuccess = function() { resolve(); };
            req.onerror = function(e) { reject(e.target.error); };
          });
        }).catch(function(err) {
          console.warn('IndexedDB save fallback to localStorage:', err);
          try { localStorage.setItem('chatpareja_custom_bg', dataUrl); } catch(e){}
        });
      },
      get: function() {
        return openDB().then(function(db) {
          return new Promise(function(resolve, reject) {
            var tx = db.transaction(STORE_NAME, 'readonly');
            var store = tx.objectStore(STORE_NAME);
            var req = store.get(KEY);
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
          });
        }).catch(function() {
          try { return localStorage.getItem('chatpareja_custom_bg'); } catch(e){ return null; }
        });
      },
      clear: function() {
        return openDB().then(function(db) {
          return new Promise(function(resolve, reject) {
            var tx = db.transaction(STORE_NAME, 'readwrite');
            var store = tx.objectStore(STORE_NAME);
            var req = store.delete(KEY);
            req.onsuccess = function() { resolve(); };
            req.onerror = function(e) { reject(e.target.error); };
          });
        }).catch(function() {
          try { localStorage.removeItem('chatpareja_custom_bg'); } catch(e){}
        });
      }
    };
  })();

  function applyChatBackground(base64) {
    var mc = document.getElementById('messages-container');
    if (!mc) return;
    if (base64) {
      mc.style.backgroundImage = 'url("' + base64 + '")';
      mc.classList.add('chat-bg-active');
      if (el && el.chatBgPreview) {
        el.chatBgPreview.style.backgroundImage = 'url("' + base64 + '")';
        el.chatBgPreview.classList.add('has-image');
      }
      if (el && el.chatBgClearBtn) el.chatBgClearBtn.classList.remove('hidden');
    } else {
      mc.style.backgroundImage = '';
      mc.classList.remove('chat-bg-active');
      if (el && el.chatBgPreview) {
        el.chatBgPreview.style.backgroundImage = '';
        el.chatBgPreview.classList.remove('has-image');
      }
      if (el && el.chatBgClearBtn) el.chatBgClearBtn.classList.add('hidden');
    }
  }

  function initChatBackground() {
    ChatBgStorage.get().then(function(savedBg) {
      if (savedBg) {
        applyChatBackground(savedBg);
      }
    });
    loadChatBackground();
  }

  function loadChatBackground() {
    if (!currentUser) return;
    db.collection(USERS_COLLECTION).doc(currentUser.uid).get().then(function(doc) {
      if (doc.exists && doc.data().chatBgBase64) {
        var cloudBg = doc.data().chatBgBase64;
        applyChatBackground(cloudBg);
        ChatBgStorage.save(cloudBg);
      }
    }).catch(function(e) { console.error('Chat bg load error:', e); });
  }

  function clearChatBackground() {
    applyChatBackground('');
    ChatBgStorage.clear();
    showSuccess('Fondo restablecido');
    if (!currentUser) return;
    db.collection(USERS_COLLECTION).doc(currentUser.uid).set({ chatBgBase64: firebase.firestore.FieldValue.delete() }, { merge: true }).catch(function(){});
  }

  function resizeBackgroundImage(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(ev) {
        var img = new Image();
        img.onload = function() {
          var MAX = 1200, w = img.width, h = img.height;
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
            else { w = Math.round(w * MAX / h); h = MAX; }
          }
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          var ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          var mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          var dataUrl = c.toDataURL(mime, 0.82);
          resolve(dataUrl);
        };
        img.onerror = function() { reject(new Error('Error al cargar imagen')); };
        img.src = ev.target.result;
      };
      reader.onerror = function() { reject(new Error('Error al leer archivo')); };
      reader.readAsDataURL(file);
    });
  }

  initChatBackground();
  try { window.reloadChatBackground = loadChatBackground; } catch(e){}

  if (el.chatBgInput) el.chatBgInput.addEventListener('change', function(e) {
    if (!e.target.files || !e.target.files[0]) return;
    resizeBackgroundImage(e.target.files[0]).then(function(dataUrl) {
      applyChatBackground(dataUrl);
      ChatBgStorage.save(dataUrl);
      showSuccess('Fondo actualizado');
      if (currentUser) {
        db.collection(USERS_COLLECTION).doc(currentUser.uid).set({ chatBgBase64: dataUrl }, { merge: true }).catch(function(err) {
          console.warn('Firestore bg backup warn:', err);
        });
      }
      e.target.value = '';
    }).catch(function() { showError('Error al procesar imagen'); });
  });
  if (el.chatBgClearBtn) el.chatBgClearBtn.addEventListener('click', clearChatBackground);
  }).catch(function(err) {
    console.error('Auth persistence error:', err);
    initTheme();
  });
});


