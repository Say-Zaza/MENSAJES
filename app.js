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

// ============================================
// INICIALIZACIÓN FIREBASE
// ============================================
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Configuración Firestore para persistencia offline
db.enablePersistence({ synchronizeTabs: true })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.log('Persistencia offline: múltiples pestañas abiertas');
    } else if (err.code === 'unimplemented') {
      console.log('Persistencia offline: navegador no compatible');
    }
  });

// Sala fija
const ROOM_ID = 'general';
const MESSAGES_COLLECTION = `rooms/${ROOM_ID}/messages`;
const USERS_COLLECTION = `rooms/${ROOM_ID}/users`;

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

// Welcome modal elements
const welcomeModal = document.getElementById('welcome-modal');
const usernameInput = document.getElementById('username-input');
const usernameSubmit = document.getElementById('username-submit');
const changeNameBtn = document.getElementById('change-name-btn');

let isFirstMessage = true;
let currentUser = null;
let username = null;
let unsubscribe = null;

// ============================================
// TYPING INDICATOR
// ============================================
const TYPING_COLLECTION = `rooms/${ROOM_ID}/typing`;
let typingUnsubscribe = null;
let typingTimeout = null;
const TYPING_DEBOUNCE_MS = 800;
const TYPING_EXPIRY_MS = 3000;

// DOM element for typing indicator
const typingIndicator = document.createElement('div');
typingIndicator.id = 'typing-indicator';
typingIndicator.className = 'typing-indicator hidden';
typingIndicator.innerHTML = '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
const roomInfo = document.querySelector('.room-info');
roomInfo.appendChild(typingIndicator);

// ============================================
// ERROR BOUNDARY - UI graceful para errores
// ============================================
function showError(message, isRetryable = false, onRetry = null) {
  const errorEl = document.createElement('div');
  errorEl.className = 'error-toast';
  errorEl.innerHTML = `
    <span class="error-icon">⚠️</span>
    <span class="error-message">${escapeHtml(message)}</span>
    ${isRetryable && onRetry ? '<button class="error-retry">Reintentar</button>' : ''}
  `;
  
  if (onRetry) {
    errorEl.querySelector('.error-retry').addEventListener('click', () => {
      errorEl.remove();
      onRetry();
    });
  }
  
  document.body.appendChild(errorEl);
  
  // Auto-dismiss after 5s for non-retryable
  if (!isRetryable) {
    setTimeout(() => errorEl.remove(), 5000);
  }
  
  return errorEl;
}

function showConnectionError() {
  return showError(
    'Error de conexión. Verifica tu internet.',
    true,
    () => location.reload()
  );
}

function showGenericError(err) {
  const msg = err?.message || 'Error inesperado';
  const isNetwork = err?.code === 'unavailable' || err?.code === 'deadline-exceeded';
  return showError(msg, isNetwork, isNetwork ? () => location.reload() : null);
}

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
  if (e.reason?.code === 'unavailable') {
    showConnectionError();
  } else {
    showGenericError(e.reason);
  }
  e.preventDefault(); // Prevent default browser behavior
});

// Global error handler for uncaught errors
window.addEventListener('error', (e) => {
  console.error('Uncaught error:', e.error);
  showGenericError(e.error);
});

// ============================================
// HELPERS LOCALSTORAGE SEGURO (fallback si bloqueado)
// ============================================
function safeGetLocalStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSetLocalStorage(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

// ============================================
// COLA OFFLINE - Encolar mensajes sin conexión
// ============================================
const OFFLINE_QUEUE_KEY = 'chat_offline_queue';
let isOnline = navigator.onLine;
let pendingCount = 0;

function getOfflineQueue() {
  try {
    const data = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch {
    return false;
  }
}

function addToOfflineQueue(messageData) {
  const queue = getOfflineQueue();
  queue.push({
    ...messageData,
    queuedAt: Date.now(),
    tempId: 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  });
  saveOfflineQueue(queue);
  updatePendingIndicator();
}

function updatePendingIndicator() {
  const queue = getOfflineQueue();
  pendingCount = queue.length;
  const indicator = document.getElementById('pending-indicator');
  if (indicator) {
    if (pendingCount > 0) {
      indicator.textContent = `${pendingCount} pendiente${pendingCount > 1 ? 's' : ''}`;
      indicator.classList.remove('hidden');
    } else {
      indicator.classList.add('hidden');
    }
  }
}

async function flushOfflineQueue() {
  if (!isOnline || !currentUser) return;
  
  const queue = getOfflineQueue();
  if (queue.length === 0) return;
  
  console.log(`📤 Flushing ${queue.length} mensajes offline...`);
  
  const remaining = [];
  for (const item of queue) {
    try {
      await firebase.firestore().collection(MESSAGES_COLLECTION).add(item);
      console.log('✅ Mensaje offline enviado:', item.tempId);
    } catch (err) {
      console.error('❌ Error enviando mensaje offline:', err);
      remaining.push(item); // Re-encolar si falla
    }
  }
  
  saveOfflineQueue(remaining);
  updatePendingIndicator();
  
  if (remaining.length > 0) {
    console.log(`⚠️ ${remaining.length} mensajes siguen pendientes`);
  }
}

// Event listeners online/offline
window.addEventListener('online', () => {
  isOnline = true;
  console.log('🌐 Conexión restaurada - sincronizando...');
  flushOfflineQueue();
});

window.addEventListener('offline', () => {
  isOnline = false;
  console.log('📴 Sin conexión - mensajes se encolarán');
  updatePendingIndicator();
});

// Inicializar indicador al cargar
updatePendingIndicator();

// ============================================
// TYPING INDICATOR FUNCTIONS
// ============================================
function startTypingListener() {
  if (typingUnsubscribe) typingUnsubscribe();
  
  const q = firebase.firestore().collection(TYPING_COLLECTION);
  typingUnsubscribe = q.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added' || change.type === 'modified') {
        const data = change.doc.data();
        if (data.uid !== currentUser?.uid && data.isTyping) {
          showTypingIndicator(data.username);
        } else if (data.uid !== currentUser?.uid && !data.isTyping) {
          hideTypingIndicator(data.username);
        }
      }
      if (change.type === 'removed') {
        // Documento expirado/eliminado
        const data = change.doc.data();
        if (data?.username) hideTypingIndicator(data.username);
      }
    });
  });
}

function stopTypingListener() {
  if (typingUnsubscribe) {
    typingUnsubscribe();
    typingUnsubscribe = null;
  }
  typingIndicator.classList.add('hidden');
  typingIndicator.textContent = '';
}

function setTypingStatus(isTyping) {
  if (!currentUser || !username) return;
  
  const typingRef = firebase.firestore().collection(TYPING_COLLECTION).doc(currentUser.uid);
  
  if (isTyping) {
    typingRef.set({
      uid: currentUser.uid,
      username: username,
      isTyping: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Auto-expire después de TYPING_EXPIRY_MS
    setTimeout(() => {
      typingRef.update({ isTyping: false }).catch(() => {});
    }, TYPING_EXPIRY_MS);
  } else {
    typingRef.update({ isTyping: false }).catch(() => {});
  }
}

function handleTypingInput() {
  if (!currentUser) return;
  
  setTypingStatus(true);
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    setTypingStatus(false);
  }, TYPING_DEBOUNCE_MS);
}

function showTypingIndicator(user) {
  typingIndicator.innerHTML = `<span>${escapeHtml(user)} está escribiendo</span><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>`;
  typingIndicator.classList.remove('hidden');
}

function hideTypingIndicator(user) {
  typingIndicator.classList.add('hidden');
  typingIndicator.innerHTML = '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
}

// ============================================
// MODAL DE NOMBRE DE USUARIO
// ============================================
function showUsernameModal() {
  welcomeModal.classList.remove('hidden');
  usernameInput.focus();
}

function hideUsernameModal() {
  welcomeModal.classList.add('hidden');
}

function validateUsernameInput() {
  const val = usernameInput.value.trim();
  usernameSubmit.disabled = val.length === 0 || val.length > 20;
}

function setUsername(val) {
  const trimmedVal = val.trim();
  if (!trimmedVal || !currentUser) return;
  
  usernameSubmit.disabled = true;
  usernameSubmit.innerHTML = 'Registrando...';
  
  const usersRef = db.collection(USERS_COLLECTION);
  
  usersRef.get().then((snapshot) => {
    const registeredUsers = [];
    snapshot.forEach(doc => {
      registeredUsers.push({ uid: doc.id, ...doc.data() });
    });
    
    const isAlreadyRegistered = registeredUsers.some(u => u.uid === currentUser.uid);
    
    if (!isAlreadyRegistered && registeredUsers.length >= 3) {
      alert('La sala se ha llenado (máximo 3 usuarios registrados).');
      showLimitReachedUI(registeredUsers.map(u => u.username));
      return;
    }
    
    usersRef.doc(currentUser.uid).set({
      username: trimmedVal,
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).then(() => {
      username = trimmedVal;
      safeSetLocalStorage('chat_username', username);
      userBadge.textContent = `Tú: ${username}`;
      hideUsernameModal();
      
      messageInput.disabled = false;
      sendBtn.disabled = false;
      messageInput.focus();
      
      startMessagesListener();
      startTypingListener();
      if (isOnline) flushOfflineQueue();
    }).catch(err => {
      console.error('Error registrando usuario:', err);
      username = trimmedVal;
      safeSetLocalStorage('chat_username', username);
      userBadge.textContent = `Tú: ${username}`;
      hideUsernameModal();
      messageInput.disabled = false;
      sendBtn.disabled = false;
      messageInput.focus();
      startMessagesListener();
    });
  }).catch(err => {
    console.error('Error al consultar lista de usuarios:', err);
    username = trimmedVal;
    safeSetLocalStorage('chat_username', username);
    userBadge.textContent = `Tú: ${username}`;
    hideUsernameModal();
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
    startMessagesListener();
  }).finally(() => {
    usernameSubmit.disabled = false;
    usernameSubmit.innerHTML = 'Entrar al chat';
  });
}

function checkUserAccess(user) {
  if (!user) {
    userBadge.textContent = 'Desconectado (sin auth)';
    messageInput.disabled = true;
    sendBtn.disabled = true;
    stopTypingListener();
    return;
  }

  const usersRef = db.collection(USERS_COLLECTION);
  
  usersRef.get().then((snapshot) => {
    const registeredUsers = [];
    snapshot.forEach(doc => {
      registeredUsers.push({ uid: doc.id, ...doc.data() });
    });
    
    const currentUserDoc = registeredUsers.find(u => u.uid === user.uid);
    
    if (!currentUserDoc && registeredUsers.length >= 3) {
      userBadge.textContent = 'Sala Llena (Máx 3)';
      showLimitReachedUI(registeredUsers.map(u => u.username));
      messageInput.disabled = true;
      sendBtn.disabled = true;
      return;
    }
    
    currentUser = user;
    username = safeGetLocalStorage('chat_username');
    
    if (currentUserDoc && (!username || username !== currentUserDoc.username)) {
      username = currentUserDoc.username;
      safeSetLocalStorage('chat_username', username);
    }
    
    if (username && username.trim()) {
      usersRef.doc(user.uid).set({
        username: username,
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      userBadge.textContent = `Tú: ${username}`;
      messageInput.disabled = false;
      sendBtn.disabled = false;
      messageInput.focus();
      startMessagesListener();
      startTypingListener();
      if (isOnline) flushOfflineQueue();
    } else {
      userBadge.textContent = 'Elige tu nombre';
      showUsernameModal();
    }
  }).catch(err => {
    console.error('Error al verificar límite de usuarios:', err);
    currentUser = user;
    username = safeGetLocalStorage('chat_username');
    if (username && username.trim()) {
      userBadge.textContent = `Tú: ${username} (offline)`;
      messageInput.disabled = false;
      sendBtn.disabled = false;
      messageInput.focus();
      startMessagesListener();
    } else {
      showUsernameModal();
    }
  });
}

function showLimitReachedUI(userNames) {
  welcomeModal.classList.remove('hidden');
  const modalContent = welcomeModal.querySelector('.welcome-modal-content');
  modalContent.innerHTML = `
    <h2 style="color: #ff4d4d; margin-bottom: 12px;">🚫 Sala Llena</h2>
    <p style="margin-bottom: 20px; font-size: 15px; line-height: 1.5;">
      El acceso a este chat privado está restringido a un máximo de <strong>3 usuarios</strong>.
    </p>
    <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 12px; margin-bottom: 20px; text-align: left;">
      <span style="font-weight: 600; font-size: 13px; display: block; margin-bottom: 8px; color: #888;">USUARIOS REGISTRADOS:</span>
      <ul style="list-style: none; padding: 0; margin: 0;">
        ${userNames.map(name => `
          <li style="display: flex; align-items: center; gap: 8px; font-size: 14px; margin-bottom: 6px;">
            <span style="color: #4caf50;">●</span> ${escapeHtml(name || 'Usuario Anónimo')}
          </li>
        `).join('')}
      </ul>
    </div>
    <p style="font-size: 12px; color: #888;">
      Pide a uno de los participantes que libere su espacio si necesitas entrar.
    </p>
  `;
}

// Event listeners para modal
usernameInput.addEventListener('input', validateUsernameInput);

usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !usernameSubmit.disabled) {
    usernameSubmit.click();
  }
});

usernameSubmit.addEventListener('click', () => {
  const val = usernameInput.value.trim();
  if (val.length === 0 || val.length > 20) return;
  setUsername(val);
});

// Botón cambiar nombre en header
changeNameBtn.addEventListener('click', () => {
  usernameInput.value = username || '';
  validateUsernameInput();
  showUsernameModal();
});

// ============================================
// REPLY STATE
// ============================================
let replyToMessage = null; // { id, autor, texto, imageSrc }

// DOM Elements for reply preview
const replyPreview = document.createElement('div');
replyPreview.className = 'reply-preview hidden';
replyPreview.innerHTML = `
  <button class="reply-preview-close" aria-label="Cancelar respuesta">&times;</button>
  <div class="reply-preview-content"></div>
`;
const chatInputArea = document.querySelector('.chat-input-area');
chatInputArea.parentNode.insertBefore(replyPreview, chatInputArea);

const replyPreviewContent = replyPreview.querySelector('.reply-preview-content');
const replyPreviewClose = replyPreview.querySelector('.reply-preview-close');

replyPreviewClose.addEventListener('click', clearReplyPreview);

function setReplyPreview(msg) {
  replyToMessage = {
    id: msg.id,
    autor: msg.autor,
    texto: msg.texto || '',
    imageSrc: msg.imageBase64 || msg.imageUrl || null
  };
  
  let previewHTML = `<span class="reply-preview-author">${escapeHtml(msg.autor)}</span>`;
  if (replyToMessage.imageSrc) {
    previewHTML += `<span class="reply-preview-text">📷 Imagen</span>`;
  } else if (replyToMessage.texto) {
    const textPreview = escapeHtml(replyToMessage.texto).substring(0, 50);
    previewHTML += `<span class="reply-preview-text">${textPreview}${replyToMessage.texto.length > 50 ? '...' : ''}</span>`;
  }
  
  replyPreviewContent.innerHTML = previewHTML;
  replyPreview.classList.remove('hidden');
  messageInput.focus();
}

function clearReplyPreview() {
  replyToMessage = null;
  replyPreview.classList.add('hidden');
  replyPreviewContent.innerHTML = '';
  messageInput.focus();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// SWIPE TO REPLY (WhatsApp style)
// ============================================
let activeSwipeMessage = null; // { wrapper, bubble, msg, startX, isSwiping, isSelf, pressTimer }

// Función global para resetear el swipe
function resetSwipe(wrapper) {
  if (!wrapper) return;
  wrapper.classList.remove('swiping', 'swipe-revealed');
  const bubble = wrapper.querySelector('.message-bubble');
  if (bubble) {
    bubble.style.transform = '';
    bubble.style.transition = 'transform 0.2s ease';
  }
}

// Función global para cerrar swipe activo
function closeActiveSwipe() {
  if (activeSwipeMessage) {
    // Clear any pending long-press timer
    if (activeSwipeMessage.pressTimer) {
      clearTimeout(activeSwipeMessage.pressTimer);
      activeSwipeMessage.pressTimer = null;
    }
    resetSwipe(activeSwipeMessage.wrapper);
    activeSwipeMessage = null;
  }
}

function attachSwipeHandlers(wrapper, bubble, msg, isSelf) {
  const isMobile = 'ontouchstart' in window;
  const swipeThreshold = 60; // px para activar reply
  const maxSwipe = 100; // máximo desplazamiento visual
  
  // Crear botón de reply (siempre existe, CSS controla visibilidad)
  const replyBtn = document.createElement('button');
  replyBtn.className = 'swipe-reply-btn';
  replyBtn.innerHTML = '↩️';
  replyBtn.setAttribute('aria-label', 'Responder');
  replyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    setReplyPreview(msg);
    closeActiveSwipe();
  });
  wrapper.appendChild(replyBtn);

  // Botón de reacción visible dentro de la burbuja — tap directo
  const reactionBtn = document.createElement('button');
  reactionBtn.className = 'reaction-trigger-btn';
  reactionBtn.innerHTML = '😊';
  reactionBtn.setAttribute('aria-label', 'Reaccionar');
  reactionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    openReactionPicker(bubble, { ...msg, id: msg.id, element: bubble });
  });
  bubble.appendChild(reactionBtn);

  if (!isMobile) return; // Solo móvil necesita swipe handlers
  
  let startX = 0;
  let isSwiping = false;
  let pressTimer = null;
  
  const handleTouchStart = (e) => {
    // Si ya hay otro swipe activo en otro mensaje, cerrarlo
    if (activeSwipeMessage && activeSwipeMessage.wrapper !== wrapper) {
      closeActiveSwipe();
    }
    
    startX = e.touches[0].clientX;
    activeSwipeMessage = { wrapper, bubble, msg, startX, isSwiping: false, isSelf, pressTimer: null };
    
    // Long press para reacciones (en wrapper)
    pressTimer = setTimeout(() => {
      // Solo activar long-press si NO estamos swiping
      if (activeSwipeMessage && activeSwipeMessage.wrapper === wrapper && !activeSwipeMessage.isSwiping) {
        e.preventDefault();
        openReactionPicker(bubble, { ...msg, id: msg.id, element: bubble });
      }
    }, 500);
    activeSwipeMessage.pressTimer = pressTimer;
  };
  
  const handleTouchMove = (e) => {
    if (!activeSwipeMessage || activeSwipeMessage.wrapper !== wrapper) return;
    
    const currentX = e.touches[0].clientX;
    activeSwipeMessage.currentX = currentX;
    const deltaX = currentX - startX;
    
    // Determinar dirección según si es mensaje propio o ajeno
    // Propio (self): swipe izquierda (deltaX < 0)
    // Ajeno (other): swipe derecha (deltaX > 0)
    const isCorrectDirection = isSelf ? deltaX < -10 : deltaX > 10;
    
    if (!isCorrectDirection) {
      // Movimiento en dirección incorrecta - cancelar long-press
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
        activeSwipeMessage.pressTimer = null;
      }
      return;
    }
    
    // Movimiento en dirección correcta - cancelar long-press
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
      activeSwipeMessage.pressTimer = null;
    }
    
    if (!activeSwipeMessage.isSwiping) {
      activeSwipeMessage.isSwiping = true;
      wrapper.classList.add('swiping');
    }
    
    const absDelta = Math.min(Math.abs(deltaX), maxSwipe);
    const translateX = isSelf ? -absDelta : absDelta;
    
    // Mover SOLO la burbuja con transform (CSS maneja el botón via clases)
    bubble.style.transform = `translateX(${translateX}px)`;
    bubble.style.transition = 'none';
  };
  
  const handleTouchEnd = () => {
    if (!activeSwipeMessage || activeSwipeMessage.wrapper !== wrapper) return;
    
    const deltaX = (activeSwipeMessage.currentX !== undefined ? activeSwipeMessage.currentX : startX) - startX;
    const isCorrectDirection = isSelf ? deltaX < -swipeThreshold : deltaX > swipeThreshold;
    
    // Limpiar timer de long-press si existe
    if (activeSwipeMessage.pressTimer) {
      clearTimeout(activeSwipeMessage.pressTimer);
      activeSwipeMessage.pressTimer = null;
    }
    
    if (activeSwipeMessage.isSwiping) {
      if (isCorrectDirection) {
        // Activar reply - mantener revelado con clase CSS
        wrapper.classList.remove('swiping');
        wrapper.classList.add('swipe-revealed');
        const finalTranslateX = isSelf ? -80 : 80;
        bubble.style.transform = `translateX(${finalTranslateX}px)`;
        bubble.style.transition = 'transform 0.2s ease';
      } else {
        // Cancelar - volver a posición
        resetSwipe(wrapper);
      }
    } else {
      // No hubo swipe (tap simple), resetear
      resetSwipe(wrapper);
    }
    
    activeSwipeMessage = null;
  };
  
  const handleTouchCancel = () => {
    if (activeSwipeMessage && activeSwipeMessage.wrapper === wrapper) {
      if (activeSwipeMessage.pressTimer) {
        clearTimeout(activeSwipeMessage.pressTimer);
      }
      resetSwipe(wrapper);
      activeSwipeMessage = null;
    }
  };
  
  // Click en el wrapper para cerrar swipe revelado (pero no en burbuja ni botón)
  wrapper.addEventListener('click', (e) => {
    if (wrapper.classList.contains('swipe-revealed')) {
      const replyBtn = wrapper.querySelector('.swipe-reply-btn');
      const bubble = wrapper.querySelector('.message-bubble');
      if (replyBtn && !replyBtn.contains(e.target) && bubble && !bubble.contains(e.target)) {
        closeActiveSwipe();
      }
    }
  });
  
  // Click en la burbuja para cerrar swipe revelado (comportamiento WhatsApp)
  bubble.addEventListener('click', (e) => {
    if (wrapper.classList.contains('swipe-revealed')) {
      closeActiveSwipe();
    }
  });
  
  bubble.addEventListener('touchstart', handleTouchStart, { passive: true });
  bubble.addEventListener('touchmove', handleTouchMove, { passive: true });
  bubble.addEventListener('touchend', handleTouchEnd, { passive: true });
  bubble.addEventListener('touchcancel', handleTouchCancel, { passive: true });
  
  // Context menu desktop personalizado (Responder + Reacciones)
  let contextMenu = null;
  
  function showContextMenu(e, msgData) {
    e.preventDefault();
    closeActiveSwipe();
    
    // Remover menú anterior
    if (contextMenu) contextMenu.remove();
    
    contextMenu = document.createElement('div');
    contextMenu.className = 'custom-context-menu';
    contextMenu.innerHTML = `
      <button class="context-menu-item" data-action="reply">↩️ Responder</button>
      <button class="context-menu-item" data-action="reaction">😀 Reacciones</button>
    `;
    
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    document.body.appendChild(contextMenu);
    
    // Ajustar si se sale de pantalla
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
    
    contextMenu.addEventListener('click', (ev) => {
      const action = ev.target.closest('.context-menu-item')?.dataset.action;
      if (action === 'reply') {
        setReplyPreview(msgData);
      } else if (action === 'reaction') {
        openReactionPicker(msgData.element || wrapper, msgData);
      }
      contextMenu.remove();
      contextMenu = null;
    });
    
    // Cerrar al hacer click fuera
    setTimeout(() => {
      document.addEventListener('click', function closeMenu() {
        if (contextMenu) {
          contextMenu.remove();
          contextMenu = null;
        }
        document.removeEventListener('click', closeMenu);
      });
    }, 0);
  }
  
  wrapper.addEventListener('contextmenu', (e) => {
    showContextMenu(e, { ...msg, id: msg.id, element: bubble });
  });
}

// ============================================
// AUTENTICACIÓN ANÓNIMA
// ============================================
console.log('🔥 Iniciando auth anónima...', firebaseConfig.authDomain);

auth.signInAnonymously()
  .then((cred) => {
    console.log('✅ Auth anónima exitosa:', cred.user?.uid);
  })
  .catch((err) => {
    console.error('❌ Error auth anónima:', err.code, err.message);
    userBadge.textContent = `Error: ${err.code}`;
  });

auth.onAuthStateChanged((user) => {
  console.log('🔄 Auth state changed:', user ? user.uid : 'null');
  checkUserAccess(user);
});

// ============================================
// LISTENER TIEMPO REAL FIRESTORE
// ============================================
function startMessagesListener() {
  // Unsubscribe previous listener if exists
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  
  const q = firebase.firestore().collection(MESSAGES_COLLECTION).orderBy('timestamp', 'asc');
  
  unsubscribe = q.onSnapshot(
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const msg = { ...change.doc.data(), id: change.doc.id };
          if (isFirstMessage) {
            if (welcomeMessage) welcomeMessage.remove();
            isFirstMessage = false;
          }
          renderMessage(msg, msg.uid === currentUser?.uid);
        }
      });
    },
    (err) => {
      console.error('❌ Error listener Firestore:', err);
      userBadge.textContent = 'Error de sincronización';
    }
  );
}

// ============================================
// ENVIAR MENSAJE
// ============================================
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const text = messageInput.value.trim();
  if (!text || !currentUser) return;
  
  // Limpiar input inmediatamente para un flujo de escritura ultra-fluido (sin bloquear el input)
  messageInput.value = '';
  const currentReply = replyToMessage;
  clearReplyPreview();
  messageInput.focus();
  
  const localTimestamp = Date.now();
  
  const messageData = {
    texto: text,
    autor: username,
    uid: currentUser.uid,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    localTimestamp: localTimestamp,
    reactions: {}
  };
  
  if (currentReply) {
    messageData.replyTo = {
      id: currentReply.id,
      autor: currentReply.autor,
      texto: currentReply.texto,
      imageSrc: currentReply.imageSrc
    };
  }
  
  try {
    if (isOnline) {
      await firebase.firestore().collection(MESSAGES_COLLECTION).add(messageData);
    } else {
      addToOfflineQueue(messageData);
      console.log('📥 Mensaje encolado (offline)');
    }
  } catch (err) {
    console.error('❌ Error enviando mensaje:', err);
    if (!isOnline || err.code === 'unavailable' || err.code === 'deadline-exceeded') {
      addToOfflineQueue(messageData);
      console.log('📥 Mensaje encolado tras error de red');
    } else {
      showError('Error al enviar mensaje. Guardado localmente.');
      addToOfflineQueue(messageData);
    }
  }
});

// ============================================
// RENDERIZAR MENSAJE
// ============================================
function formatTime(timestamp) {
  if (!timestamp) return '--:--';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
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
  '😖','😫','😩','🥺','😢','😭','😤','😠',
  '😡','🤬','🤯','😳','🥵','🥶','😱','😨',
  '😰','😥','😓','🤗','🤔','🤭','🤫','🤥',
  '😶','😐','😑','😬','🙄','😯','😦','😧',
  '😮','😲','😴','🤤','😪','😵','🤐','🥴',
  '🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠',
  '👍','👎','👌','✌️','🤞','🤟','🤘','🤙',
  '👈','👉','👆','👇','☝️','👋','🤚','🖐️',
  '✋','🖖','👏','🙌','👐','🤲','🤝','🙏',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍',
  '🤎','💔','❣️','💕','💞','💓','💗','💖',
  '💘','💝','💟','☮️','✝️','☪️','🕉️','☸️',
  '✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈',
  '♉','♊','♋','♌','♍','♎','♏','♐',
  '♑','♒','♓','⛔','🚫','💯','🔥','💦',
  '💨','🕳️','💣','💬','💭','🗯️','💤','💥',
  '💫','💨','🕳️','💣','💬','💭','🗯️','💤',
  '👻','💩','🤡','👽','👾','🤖','🎃','😺',
  '😸','😹','😻','😼','😽','🙀','😿','😾'
];

function initEmojiPicker() {
  EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-item';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      messageInput.value += emoji;
      messageInput.focus();
      emojiPicker.classList.add('hidden');
    });
    emojiPicker.appendChild(btn);
  });

  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
      emojiPicker.classList.add('hidden');
    }
  });
}

// Inicializar emoji picker al cargar
initEmojiPicker();

// Typing indicator input listener
messageInput.addEventListener('input', handleTypingInput);

// ============================================
// REACCIONES A MENSAJES
// ============================================
const REACTION_EMOJIS = [
  '👍','❤️','😂','😮','😢','😡',
  '👎','🔥','🤯','🤣','🥰','🙏',
  '🎉','✨','💯','🤝','🤔','😴',
  '🤢','🤮','🤧','😷','🤒','🤕',
  '🤑','🤠','👻','💩','🤡','👽',
  '👾','🤖','🎃','😺','😸','😹',
  '😻','😼','😽','🙀','😿','😾'
];

const reactionPicker = document.getElementById('reaction-picker');
const reactionPickerContent = reactionPicker?.querySelector('.reaction-picker-content');
let currentMessageForReaction = null;
let reactionUnsubscribes = new Map();

function initReactionPicker() {
  if (!reactionPickerContent) return;
  
  REACTION_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'reaction-item';
    btn.textContent = emoji;
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('tabindex', '0');
    btn.addEventListener('click', () => {
      if (currentMessageForReaction) {
        toggleReaction(currentMessageForReaction.id, emoji);
      }
      closeReactionPicker();
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
    reactionPickerContent.appendChild(btn);
  });

  document.addEventListener('click', (e) => {
    if (reactionPicker && !reactionPicker.contains(e.target) && 
        !e.target.closest('.message-bubble')) {
      closeReactionPicker();
    }
  });
}

function openReactionPicker(messageEl, msgData) {
  if (!reactionPicker || !reactionPickerContent) return;
  
  currentMessageForReaction = { id: msgData.id, element: messageEl };
  
  const rect = messageEl.getBoundingClientRect();
  const pickerRect = reactionPickerContent.getBoundingClientRect();
  
  let left = rect.left + rect.width / 2 - pickerRect.width / 2;
  let top = rect.top - pickerRect.height - 8;
  
  if (left < 8) left = 8;
  if (left + pickerRect.width > window.innerWidth - 8) {
    left = window.innerWidth - pickerRect.width - 8;
  }
  if (top < 8) {
    top = rect.bottom + 8;
  }
  
  reactionPickerContent.style.left = `${left}px`;
  reactionPickerContent.style.top = `${top}px`;
  reactionPicker.classList.remove('hidden');
  
  updateReactionPickerUI(msgData);
}

function closeReactionPicker() {
  if (reactionPicker) {
    reactionPicker.classList.add('hidden');
    currentMessageForReaction = null;
  }
}

function updateReactionPickerUI(msgData) {
  const reactions = msgData.reactions || {};
  const userReactions = new Set(Object.keys(reactions).filter(emoji => 
    reactions[emoji]?.includes(currentUser?.uid)
  ));
  
  reactionPickerContent.querySelectorAll('.reaction-item').forEach(btn => {
    const emoji = btn.textContent;
    const count = reactions[emoji]?.length || 0;
    const hasUser = userReactions.has(emoji);
    
    btn.textContent = `${emoji}${count > 0 ? ` ${count}` : ''}`;
    btn.classList.toggle('has-user', hasUser);
    btn.setAttribute('aria-label', `${emoji} ${count} ${hasUser ? '(tuya)' : ''}`);
  });
}

async function toggleReaction(messageId, emoji) {
  if (!currentUser || !messageId) return;
  
  const msgRef = firebase.firestore().collection(MESSAGES_COLLECTION).doc(messageId);
  
  try {
    await firebase.firestore().runTransaction(async (transaction) => {
      const msgDoc = await transaction.get(msgRef);
      if (!msgDoc.exists) return;
      
      const msgData = msgDoc.data();
      const reactions = msgData.reactions || {};
      const userReactions = reactions[emoji] || [];
      const userIndex = userReactions.indexOf(currentUser.uid);
      
      if (userIndex >= 0) {
        userReactions.splice(userIndex, 1);
      } else {
        userReactions.push(currentUser.uid);
      }
      
      if (userReactions.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = userReactions;
      }
      
      transaction.update(msgRef, { reactions });
    });
  } catch (err) {
    console.error('❌ Error toggling reaction:', err);
  }
}

function attachReactionListener(messageId, messageEl, initialReactions) {
  if (reactionUnsubscribes.has(messageId)) return;
  
  const msgRef = firebase.firestore().collection(MESSAGES_COLLECTION).doc(messageId);
  
  const unsubscribe = msgRef.onSnapshot((doc) => {
    if (doc.exists) {
      const msgData = doc.data();
      updateMessageReactions(messageEl, msgData);
      if (currentMessageForReaction?.id === messageId) {
        updateReactionPickerUI({ ...msgData, id: messageId });
      }
    }
  }, (err) => {
    console.error('❌ Error reaction listener:', err);
  });
  
  reactionUnsubscribes.set(messageId, unsubscribe);
}

function updateMessageReactions(messageEl, msgData) {
  const reactions = msgData.reactions || {};
  let reactionsContainer = messageEl.querySelector('.message-reactions');
  
  if (!reactionsContainer) {
    reactionsContainer = document.createElement('div');
    reactionsContainer.className = 'message-reactions';
    const bubble = messageEl.querySelector('.message-bubble');
    if (bubble) {
      bubble.appendChild(reactionsContainer);
    }
  }
  
  reactionsContainer.innerHTML = '';
  
  Object.entries(reactions).forEach(([emoji, uids]) => {
    if (!uids || uids.length === 0) return;
    
    const reactionBtn = document.createElement('button');
    reactionBtn.type = 'button';
    reactionBtn.className = 'reaction-bubble';
    reactionBtn.textContent = `${emoji} ${uids.length}`;
    reactionBtn.setAttribute('aria-label', `${emoji} ${uids.length} reacciones`);
    
    if (uids.includes(currentUser?.uid)) {
      reactionBtn.classList.add('user-reacted');
    }
    
    reactionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleReaction(msgData.id || messageEl.dataset.messageId, emoji);
    });
    
    reactionsContainer.appendChild(reactionBtn);
  });
}

function renderMessage(msg, isSelf = false) {
  const { autor, texto, timestamp, imageUrl, imageBase64, reactions, id, replyTo, imageBlur, imageWidth, imageHeight } = msg;
  const displayTime = msg.localTimestamp || timestamp;
  const imageSrc = imageBase64 || imageUrl; // Compatibilidad con mensajes antiguos
  
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${isSelf ? 'self' : 'other'}`;
  wrapper.dataset.messageId = id;
  
  if (!isSelf) {
    const authorEl = document.createElement('span');
    authorEl.className = 'message-meta-author';
    authorEl.textContent = autor;
    wrapper.appendChild(authorEl);
  }
  
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  if (imageSrc) bubble.classList.add('has-image');
  
  // REPLY PREVIEW (si el mensaje es una respuesta)
  if (replyTo) {
    const replyEl = document.createElement('div');
    replyEl.className = 'message-reply';
    
    let replyHTML = `<span class="reply-author">${escapeHtml(replyTo.autor)}</span>`;
    if (replyTo.imageSrc) {
      replyHTML += `<span class="reply-text">📷 Imagen</span>`;
    } else if (replyTo.texto) {
      const textPreview = escapeHtml(replyTo.texto).substring(0, 60);
      replyHTML += `<span class="reply-text">${textPreview}${replyTo.texto.length > 60 ? '...' : ''}</span>`;
    }
    replyEl.innerHTML = replyHTML;
    bubble.appendChild(replyEl);
  }
  
  // Imagen (si existe) - Carga progresiva con blur placeholder
  if (imageSrc) {
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'message-image-wrapper';
    imgWrapper.style.position = 'relative';
    imgWrapper.style.width = '100%';
    if (imageWidth && imageHeight) {
      imgWrapper.style.aspectRatio = `${imageWidth} / ${imageHeight}`;
    }
    
    // Placeholder blur (carga inmediata)
    if (imageBlur) {
      const blurImg = document.createElement('img');
      blurImg.src = imageBlur;
      blurImg.alt = '';
      blurImg.className = 'message-image-blur';
      blurImg.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: blur(20px);
        transform: scale(1.1);
        z-index: 0;
        pointer-events: none;
      `;
      imgWrapper.appendChild(blurImg);
    }
    
    // Imagen real (carga diferida)
    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = msg.imageName || 'Imagen';
    img.className = 'message-image';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.style.cssText = `
      position: relative;
      z-index: 1;
      opacity: 0;
      transition: opacity 0.3s ease;
      width: 100%;
      height: auto;
      max-height: 280px;
      object-fit: cover;
      border-radius: 10px;
    `;
    
    img.onload = () => {
      img.style.opacity = '1';
    };
    
    img.addEventListener('click', () => openLightbox(imageSrc));
    imgWrapper.appendChild(img);
    bubble.appendChild(imgWrapper);
  }
  
  // Texto (si existe)
  if (texto) {
    const textEl = document.createElement('span');
    textEl.textContent = texto;
    bubble.appendChild(textEl);
  }
  
const timeEl = document.createElement('span');
  timeEl.className = 'message-time';
  timeEl.textContent = formatTime(displayTime);
  bubble.appendChild(timeEl);

  // Botón visible de reacciones (😊) - funciona en móvil y desktop
  const reactionToggleBtn = document.createElement('button');
  reactionToggleBtn.type = 'button';
  reactionToggleBtn.className = 'reaction-toggle-btn';
  reactionToggleBtn.innerHTML = '😊';
  reactionToggleBtn.setAttribute('aria-label', 'Añadir reacción');
  reactionToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openReactionPicker(bubble, { ...msg, id });
  });
  bubble.appendChild(reactionToggleBtn);

  // Reacciones
  if (reactions && Object.keys(reactions).length > 0) {
    const reactionsContainer = document.createElement('div');
    reactionsContainer.className = 'message-reactions';
    
    Object.entries(reactions).forEach(([emoji, uids]) => {
      if (!uids || uids.length === 0) return;
      
      const reactionBtn = document.createElement('button');
      reactionBtn.type = 'button';
      reactionBtn.className = 'reaction-bubble';
      reactionBtn.textContent = `${emoji} ${uids.length}`;
      reactionBtn.setAttribute('aria-label', `${emoji} ${uids.length} reacciones`);
      
      if (uids.includes(currentUser?.uid)) {
        reactionBtn.classList.add('user-reacted');
      }
      
      reactionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReaction(id, emoji);
      });
      
      reactionsContainer.appendChild(reactionBtn);
    });
    
    bubble.appendChild(reactionsContainer);
  }
  
  // Attach swipe-to-reply handlers (mobile) + long press for reactions
  attachSwipeHandlers(wrapper, bubble, { ...msg, id }, isSelf);
  
  wrapper.appendChild(bubble);
  messagesContainer.appendChild(wrapper);
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  // Attach real-time reaction listener
  if (id) {
    attachReactionListener(id, wrapper, reactions);
  }
}

// Inicializar reaction picker al cargar
initReactionPicker();

// ============================================
// SUBIDA DE IMÁGENES (Base64 en Firestore - Sin Storage)
// ============================================
// COMPRESIÓN DE IMÁGENES (WebP + JPEG fallback, carga progresiva)
// ============================================
imageBtn.addEventListener('click', () => imageInput.click());

// Generar placeholder blur (base64 tiny) para carga progresiva
function generateBlurPlaceholder(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 20;
        canvas.height = 20;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 20, 20);
        // JPEG muy baja calidad para placeholder tiny
        resolve(canvas.toDataURL('image/jpeg', 0.1));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Comprimir imagen a base64 (WebP preferido, JPEG fallback)
async function compressImageToBase64(file, maxWidth = 800, quality = 0.7) {
  // Generar placeholder blur primero
  const blurPlaceholder = await generateBlurPlaceholder(file);
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Intentar WebP primero (mejor compresión)
        let base64 = canvas.toDataURL('image/webp', quality);
        let mimeType = 'image/webp';
        let sizeKB = Math.round((base64.length * 3) / 4 / 1024);
        
        // Fallback a JPEG si WebP no soportado o muy grande
        const isWebPSupported = base64.startsWith('data:image/webp');
        if (!isWebPSupported || sizeKB > 900) {
          base64 = canvas.toDataURL('image/jpeg', quality);
          mimeType = 'image/jpeg';
          sizeKB = Math.round((base64.length * 3) / 4 / 1024);
        }
        
        // Recomprimir si aún muy grande
        if (sizeKB > 900) {
          base64 = canvas.toDataURL(mimeType, 0.5);
          sizeKB = Math.round((base64.length * 3) / 4 / 1024);
        }
        
        resolve({ base64, sizeKB, mimeType, blurPlaceholder, width, height });
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
  
  // Validar tipo
  if (!file.type.startsWith('image/')) {
    alert('Solo se permiten imágenes');
    return;
  }
  
  // Deshabilitar solo botones de envío/imagen, NO el campo de texto principal
  sendBtn.disabled = true;
  imageBtn.disabled = true;
  imageBtn.innerHTML = '<span class="spinner"></span>';
  
  const localTimestamp = Date.now();
  let imageMessageData = null;
  
  try {
    // Comprimir a base64 (con WebP, blur placeholder, dimensiones)
    const { base64, sizeKB, mimeType, blurPlaceholder, width, height } = await compressImageToBase64(file);
    console.log(`Imagen comprimida: ${sizeKB} KB (${mimeType})`);
    
    if (sizeKB > 900) {
      throw new Error('La imagen es muy grande incluso comprimida');
    }
    
    imageMessageData = {
      texto: messageInput.value.trim() || '',
      autor: username,
      uid: currentUser.uid,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      localTimestamp: localTimestamp,
      imageBase64: base64,
      imageMimeType: mimeType,
      imageBlur: blurPlaceholder,
      imageWidth: width,
      imageHeight: height,
      imageName: file.name,
      reactions: {}
    };
    
    if (isOnline) {
      // Guardar mensaje con imagen base64 en Firestore
      await firebase.firestore().collection(MESSAGES_COLLECTION).add(imageMessageData);
    } else {
      // Offline: encolar localmente
      addToOfflineQueue(imageMessageData);
      console.log('📥 Imagen encolada (offline)');
    }
    
    messageInput.value = '';
    imageInput.value = '';
  } catch (err) {
    console.error('❌ Error procesando imagen:', err);
    // Si falla por red y los datos están listos, encolar para reintento
    if (imageMessageData && (!isOnline || err.code === 'unavailable' || err.code === 'deadline-exceeded')) {
      addToOfflineQueue(imageMessageData);
      console.log('📥 Imagen encolada tras error de red');
    } else {
      alert('Error: ' + err.message);
    }
  } finally {
    sendBtn.disabled = false;
    imageBtn.disabled = false;
    imageBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <circle cx="8.5" cy="8.5" r="1.5"></circle>
      <polyline points="21 15 16 10 5 21"></polyline>
    </svg>`;
    messageInput.focus();
  }
});

// ============================================
// LIGHTBOX PARA VER IMÁN GRANDE
// ============================================
const lightbox = document.createElement('div');
lightbox.className = 'image-lightbox hidden';
lightbox.innerHTML = `
  <button class="close-lightbox" aria-label="Cerrar">&times;</button>
  <img src="" alt="Imagen ampliada" />
`;
document.body.appendChild(lightbox);

const lightboxImg = lightbox.querySelector('img');
lightbox.querySelector('.close-lightbox').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

function openLightbox(url) {
  lightboxImg.src = url;
  lightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxImg.src = '';
  document.body.style.overflow = '';
}

// ============================================
// LIMPIEZA AL CERRAR
// ============================================
window.addEventListener('beforeunload', () => {
  if (unsubscribe) unsubscribe();
});

// ============================================
// DRAG & DROP + BÚSQUEDA DE MENSAJES (OPTIMIZACIONES)
// ============================================
const chatContainer = document.getElementById('chat-container');
const dragDropOverlay = document.getElementById('drag-drop-overlay');

if (chatContainer && dragDropOverlay) {
  ['dragenter', 'dragover'].forEach(eventName => {
    chatContainer.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragDropOverlay.classList.remove('hidden');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    chatContainer.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragDropOverlay.classList.add('hidden');
    }, false);
  });

  chatContainer.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0 && files[0].type.startsWith('image/')) {
      const dt = new DataTransfer();
      dt.items.add(files[0]);
      imageInput.files = dt.files;
      imageInput.dispatchEvent(new Event('change'));
    }
  });
}

const searchToggleBtn = document.getElementById('search-toggle-btn');
const searchBar = document.getElementById('search-bar');
const searchInput = document.getElementById('search-input');
const searchCloseBtn = document.getElementById('search-close-btn');

if (searchToggleBtn && searchBar && searchInput && searchCloseBtn) {
  searchToggleBtn.addEventListener('click', () => {
    searchBar.classList.toggle('hidden');
    if (!searchBar.classList.contains('hidden')) {
      searchInput.focus();
    } else {
      searchInput.value = '';
      filterMessages('');
    }
  });

  searchCloseBtn.addEventListener('click', () => {
    searchBar.classList.add('hidden');
    searchInput.value = '';
    filterMessages('');
  });

  searchInput.addEventListener('input', (e) => {
    filterMessages(e.target.value.toLowerCase().trim());
  });
}

function filterMessages(query) {
  const wrappers = document.querySelectorAll('.message-wrapper');
  wrappers.forEach(w => {
    if (!query) {
      w.style.display = '';
      return;
    }
    const text = w.textContent.toLowerCase();
    w.style.display = text.includes(query) ? '' : 'none';
  });
}
