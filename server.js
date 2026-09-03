const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const syncService = require('./sync-service.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const MEDIA_DIR = path.join(__dirname, 'media');

if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// Firebase Admin (backup opcional)
let dbFirestore = null;
let pairingCache = new Map(); // uid -> { paired: boolean, expires: timestamp }
const PAIRING_CACHE_TTL = 5 * 60 * 1000; // 5 min cache

// Presencia en tiempo real: roomId -> Map<uid, { lastActive, state, assignedKey? }>
const presenceByRoom = new Map();

function setPresence(roomId, uid, data) {
  if (!presenceByRoom.has(roomId)) presenceByRoom.set(roomId, new Map());
  const map = presenceByRoom.get(roomId);
  const prev = map.get(uid) || {};
  const next = { ...prev, ...data };
  map.set(uid, next);
  return next;
}

function buildPresencePayload(roomId) {
  const map = presenceByRoom.get(roomId) || new Map();
  const db = syncService.readLocalDB();
  const storedUsers = (db.users && db.users[roomId]) || {};
  const users = {};
  for (const [uid, p] of map.entries()) {
    const prof = storedUsers[uid] || {};
    users[uid] = {
      lastActive: p.lastActive,
      state: p.state,
      assignedKey: prof.assignedKey || p.assignedKey || '',
      username: prof.username || '',
      avatarBase64: prof.avatarBase64 || '',
      bio: prof.bio || ''
    };
  }
  return { users };
}

try {
  const admin = require('firebase-admin');
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  dbFirestore = admin.firestore();
  console.log('🔥 Firebase Admin inicializado (modo backup)');
} catch (err) {
  console.log('ℹ️ Firebase Admin SDK no configurado (usando SyncService REST API para respaldo local y purga de 5 días)');
}

// Helpers del Admin SDK para operar arrays (destacados)
function firestoreFieldArrayUnion(value) {
  return require('firebase-admin').firestore.FieldValue.arrayUnion(value);
}
function firestoreFieldArrayRemove(value) {
  return require('firebase-admin').firestore.FieldValue.arrayRemove(value);
}

// Función para verificar emparejamiento en servidor
async function validatePairing(uid) {
  // Verificar cache primero
  const cached = pairingCache.get(uid);
  if (cached && cached.expires > Date.now()) {
    return cached.paired;
  }
  
  if (!dbFirestore) {
    // Sin Admin SDK, permitir (validación la hace Firestore Rules)
    return true;
  }
  
  try {
    const pairingRef = dbFirestore.collection(`rooms/general/pairing`).doc(uid);
    const doc = await pairingRef.get();
    const paired = doc.exists;
    
    pairingCache.set(uid, { paired, expires: Date.now() + PAIRING_CACHE_TTL });
    return paired;
  } catch (e) {
    console.error('Error validando emparejamiento:', e);
    return true; // En caso de error, permitir (fallback a rules)
  }
}

// Limpiar cache periódicamente
setInterval(() => {
  const now = Date.now();
  for (const [uid, data] of pairingCache.entries()) {
    if (data.expires < now) pairingCache.delete(uid);
  }
}, 60000);

// Servir frontend y carpeta media estática
app.use(express.static(__dirname));
app.use('/media', express.static(MEDIA_DIR));

// Endpoint HTTP para consultar historial respaldado localmente
app.get('/api/history/:roomId', (req, res) => {
  const db = syncService.readLocalDB();
  const roomId = req.params.roomId || 'general';
  res.json(db.rooms[roomId] || []);
});

// Endpoint manual para forzar sincronización y purga de 5 días
app.get('/api/sync', async (req, res) => {
  const roomId = req.query.room || 'general';
  const result = await syncService.runSyncAndPrune(roomId);
  res.json(result);
});

// Health check endpoint para detección de servidor local
app.get('/api/health', (req, res) => {
  const db = syncService.readLocalDB();
  const roomId = 'general';
  const msgCount = db.rooms[roomId]?.length || 0;
  res.json({ 
    status: 'ok', 
    mode: 'local', 
    timestamp: Date.now(),
    rooms: { [roomId]: msgCount },
    uptime: process.uptime()
  });
});

// Destacados y ajustes (respaldo local; se sirven al cliente en modo socket)
app.get('/api/destacados/:room', (req, res) => {
  const db = syncService.readLocalDB();
  const roomId = req.params.room || 'general';
  res.json(db.destacados?.[roomId] || { user1: { items: [] }, user2: { items: [] } });
});

app.get('/api/settings/:room', (req, res) => {
  const db = syncService.readLocalDB();
  const roomId = req.params.room || 'general';
  res.json(db.settings?.[roomId] || { user1: { shareDestacados: false }, user2: { shareDestacados: false } });
});

// Presencia y perfiles (modo socket): quién está conectado y datos de cada uno
app.get('/api/presence/:room', (req, res) => {
  const roomId = req.params.room || 'general';
  res.json(buildPresencePayload(roomId));
});

app.get('/api/profile/:room', (req, res) => {
  const db = syncService.readLocalDB();
  const roomId = req.params.room || 'general';
  res.json({ users: db.users?.[roomId] || {} });
});

app.get('/api/cleanup-db', (req, res) => {
  const uid = req.query.uid;
  const ALLOWED_UIDS = ['Wo9mPGZOafccEETULDr2aFTzjV03', 'cGHUgMDtcnboB74AlaqgWMxs9w82'];
  if (!uid || !ALLOWED_UIDS.includes(uid)) {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const db = syncService.readLocalDB();
    const roomId = req.query.room || 'general';
    if (db.rooms[roomId]) {
      db.rooms[roomId] = [];
      syncService.writeLocalDB(db);
    }
    io.of('/').adapter.rooms.forEach((_, id) => {
      if (id === roomId) {
        io.in(id).emit('roomCleared');
      }
    });
    res.json({ success: true, message: `Cleared ${roomId} local DB` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Socket.io real-time
io.on('connection', (socket) => {
  console.log('✅ Nuevo usuario conectado:', socket.id);
  let socketUid = null;

  socket.on('joinRoom', async ({ roomId, uid }) => {
    if (!uid) {
      socket.emit('error', { code: 'NO_UID', message: 'UID requerido' });
      return;
    }
    
    // Validar emparejamiento
    const isPaired = await validatePairing(uid);
    if (!isPaired) {
      socket.emit('error', { code: 'NOT_PAIRED', message: 'Usuario no emparejado' });
      socket.disconnect();
      return;
    }
    
    socketUid = uid;
    socket.join(roomId);
    console.log(`Usuario ${uid} (${socket.id}) se unió a la sala: ${roomId}`);
    
    const db = syncService.readLocalDB();
    if (db.rooms[roomId] && db.rooms[roomId].length > 0) {
      socket.emit('chatHistory', db.rooms[roomId]);
    }
    
    // Marcar presencia online y avisar a la pareja
    setPresence(roomId, uid, { lastActive: Date.now(), state: 'online' });
    io.to(roomId).emit('presenceUpdate', buildPresencePayload(roomId));
  });

  socket.on('chatMessage', async (data) => {
    const { roomId, id, uid, ...messageData } = data;
    if (!roomId || !uid) return;
    
    // Validar que el UID coincide con el que hizo joinRoom
    if (socketUid && socketUid !== uid) {
      socket.emit('error', { code: 'UID_MISMATCH', message: 'UID no coincide' });
      return;
    }
    
    // Validar emparejamiento
    const isPaired = await validatePairing(uid);
    if (!isPaired) {
      socket.emit('error', { code: 'NOT_PAIRED', message: 'Usuario no emparejado' });
      return;
    }
    
    const messageId = id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const newMessage = { 
      id: messageId,
      ...messageData,
      uid: uid,
      timestamp: Date.now() 
    };

    // BROADCAST INMEDIATO al partner (sin esperar escrituras)
    io.to(roomId).emit('newMessage', newMessage);

    // Escrituras en background (fire-and-forget)
    (async () => {
      try {
        const db = await syncService.readLocalDBAsync();
        if (!db.rooms[roomId]) db.rooms[roomId] = [];

        if (newMessage.imageBase64) {
          const localMedia = syncService.saveMediaFileLocally(messageId, newMessage.imageBase64, newMessage.imageMimeType);
          if (localMedia) newMessage.localMediaPath = localMedia;
        }
        
        if (newMessage.audioBase64) {
          const localMedia = syncService.saveAudioFileLocally(messageId, newMessage.audioBase64, newMessage.audioMimeType);
          if (localMedia) newMessage.localAudioPath = localMedia;
        }
        
        const existingIndex = db.rooms[roomId].findIndex(m => m.id === messageId);
        if (existingIndex >= 0) {
          db.rooms[roomId][existingIndex] = newMessage;
        } else {
          db.rooms[roomId].push(newMessage);
        }
        await syncService.writeLocalDBAsync(db);
      } catch (e) {
        console.error('❌ Error guardando mensaje local:', e.message);
      }
    })();

    // Firestore write en background (fire-and-forget)
    (async () => {
      try {
        if (dbFirestore) {
          await dbFirestore.collection(`rooms/${roomId}/messages`).doc(messageId).set({
            ...messageData,
            uid,
            timestamp: new Date(newMessage.timestamp),
            localTimestamp: newMessage.timestamp
          }, { merge: true });
        } else {
          const token = await syncService.getAuthToken();
          if (token) {
            await syncService.createFirestoreMessage(roomId, newMessage, token, messageId);
          }
        }
      } catch (e) {
        console.error('❌ Error escribiendo mensaje en Firestore:', e.message);
      }
    })();
  });

  socket.on('typing', ({ roomId, uid, username, isTyping }) => {
    if (!roomId || !uid) return;
    socket.to(roomId).emit('typing', { uid, username, isTyping });
  });

  socket.on('reaction', ({ roomId, messageId, emoji, uid }) => {
    if (!roomId || !messageId || !emoji || !uid) return;
    io.to(roomId).emit('reaction', { messageId, emoji, uid });
  });

  socket.on('pinMessage', ({ roomId, messageId, texto, uid }) => {
    if (!roomId || !messageId) return;
    io.to(roomId).emit('pinMessage', { messageId, texto, uid });
  });

  socket.on('unpinMessage', ({ roomId, uid }) => {
    if (!roomId) return;
    io.to(roomId).emit('unpinMessage', { uid });
  });

  socket.on('deleteMessage', ({ roomId, messageId, uid }) => {
    if (!roomId || !messageId) return;
    io.to(roomId).emit('deleteMessage', { messageId, uid });
  });

  socket.on('editMessage', ({ roomId, messageId, texto, uid }) => {
    if (!roomId || !messageId) return;
    io.to(roomId).emit('editMessage', { messageId, texto, uid });
  });

  socket.on('destacado', async ({ roomId, slot, action, message }) => {
    if (!roomId || !slot || !message || (action !== 'add' && action !== 'remove')) return;
    const snapshot = syncService.messageToSnapshot(message);

    // Guardar en la PC (respaldo permanente)
    const db = syncService.readLocalDB();
    if (!db.destacados) db.destacados = {};
    if (!db.destacados[roomId]) db.destacados[roomId] = {};
    if (!db.destacados[roomId][slot]) db.destacados[roomId][slot] = { items: [] };
    const items = db.destacados[roomId][slot].items;
    const idx = items.findIndex(i => i.messageId === snapshot.messageId);
    if (action === 'add') {
      if (idx >= 0) items[idx] = snapshot; else items.push(snapshot);
    } else {
      if (idx >= 0) items.splice(idx, 1);
    }
    syncService.writeLocalDB(db);

    // Replicar a Firestore (no se purga: vive en rooms/{roomId}/destacados)
    try {
      if (dbFirestore) {
        const ref = dbFirestore.collection(`rooms/${roomId}/destacados`).doc(slot);
        if (action === 'add') {
          await ref.set({ items: firestoreFieldArrayUnion(snapshot) }, { merge: true });
        } else {
          await ref.set({ items: firestoreFieldArrayRemove(snapshot) }, { merge: true });
        }
      } else {
        const token = await syncService.getAuthToken();
        if (token) await syncService.setDestacadosItem(roomId, slot, action, snapshot, token);
      }
    } catch (e) {
      console.error('❌ Error replicando destacado a Firestore:', e.message);
    }

    io.to(roomId).emit('destacadoUpdated', { slot, action, message: snapshot });
  });

  socket.on('settingsShare', async ({ roomId, slot, shareDestacados }) => {
    if (!roomId || !slot) return;
    const db = syncService.readLocalDB();
    if (!db.settings) db.settings = {};
    if (!db.settings[roomId]) db.settings[roomId] = {};
    db.settings[roomId][slot] = { shareDestacados: !!shareDestacados };
    syncService.writeLocalDB(db);

    try {
      if (dbFirestore) {
        await dbFirestore.collection(`rooms/${roomId}/settings`).doc(slot).set(
          { shareDestacados: !!shareDestacados },
          { merge: true }
        );
      } else {
        const token = await syncService.getAuthToken();
        if (token) await syncService.setSettingsDoc(roomId, slot, !!shareDestacados, token);
      }
    } catch (e) {
      console.error('❌ Error replicando settings a Firestore:', e.message);
    }

    io.to(roomId).emit('settingsUpdated', { slot, shareDestacados: !!shareDestacados });
  });

  // Presencia: latido periódico del cliente
  socket.on('presenceBeat', ({ roomId, uid, state, assignedKey, username }) => {
    if (!roomId || !uid) return;
    setPresence(roomId, uid, { lastActive: Date.now(), state: state || 'online', assignedKey: assignedKey || '' });
    if (assignedKey) {
      const db = syncService.readLocalDB();
      if (!db.users) db.users = {};
      if (!db.users[roomId]) db.users[roomId] = {};
      const existing = db.users[roomId][uid] || {};
      if (existing.assignedKey !== assignedKey || (username && existing.username !== username)) {
        db.users[roomId][uid] = { ...existing, assignedKey, username: username || existing.username || '' };
        syncService.writeLocalDB(db);
      }
    }
    io.to(roomId).emit('presenceUpdate', buildPresencePayload(roomId));
  });

  // Perfil: guardar en la PC, replicar a Firestore y avisar a la pareja
  socket.on('profileUpdate', async ({ roomId, uid, assignedKey, profile }) => {
    if (!roomId || !uid || !profile) return;
    const db = syncService.readLocalDB();
    if (!db.users) db.users = {};
    if (!db.users[roomId]) db.users[roomId] = {};
    db.users[roomId][uid] = {
      username: (profile.username || '').trim(),
      avatarBase64: profile.avatarBase64 || '',
      bio: (profile.bio || '').trim(),
      assignedKey: assignedKey || (db.users[roomId][uid] || {}).assignedKey || '',
      updatedAt: Date.now()
    };
    syncService.writeLocalDB(db);

    try {
      if (dbFirestore) {
        await dbFirestore.collection(`rooms/${roomId}/users`).doc(uid).set({
          username: db.users[roomId][uid].username,
          avatarBase64: db.users[roomId][uid].avatarBase64 || null,
          bio: db.users[roomId][uid].bio
        }, { merge: true });
      } else {
        const token = await syncService.getAuthToken();
        if (token) await syncService.setProfileDoc(roomId, uid, db.users[roomId][uid], token);
      }
    } catch (e) {
      console.error('❌ Error replicando perfil a Firestore:', e.message);
    }

    setPresence(roomId, uid, { lastActive: Date.now(), state: 'online', assignedKey: db.users[roomId][uid].assignedKey });
    io.to(roomId).emit('profileUpdated', { uid, profile: db.users[roomId][uid] });
    io.to(roomId).emit('presenceUpdate', buildPresencePayload(roomId));
  });

  socket.on('cleanupRoom', ({ roomId, uid }) => {
    if (!roomId || !uid) return;
    const ALLOWED_UIDS = ['Wo9mPGZOafccEETULDr2aFTzjV03', 'cGHUgMDtcnboB74AlaqgWMxs9w82'];
    if (!ALLOWED_UIDS.includes(uid)) return;
    if (socketUid && socketUid !== uid) return;
    io.to(roomId).emit('roomCleared');
  });

  socket.on('disconnect', () => {
    console.log('❌ Usuario desconectado:', socket.id);
    if (socketUid) {
      setPresence('general', socketUid, { lastActive: Date.now(), state: 'offline' });
      io.to('general').emit('presenceUpdate', buildPresencePayload('general'));
    }
  });
});

// Iniciar servidor local 24/7 y bucle de sincronización automática (cada 15 min)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Servidor backend local iniciado con éxito.`);
  console.log(`🌐 Aplicación disponible en http://localhost:${PORT}`);
  console.log(`📁 Base de datos guardando en ${DB_FILE}`);
  console.log(`🖼️ Archivos multimedia guardando en ${MEDIA_DIR}`);
  
  // Iniciar Sync & Cleanup Loop (auto-descarga a la PC + purga de Firebase >5 días)
  syncService.startSyncLoop(15, 'general');
});
