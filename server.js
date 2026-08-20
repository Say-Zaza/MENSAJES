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

app.get('/api/cleanup-db', (req, res) => {
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
    
    const db = syncService.readLocalDB();
    if (!db.rooms[roomId]) db.rooms[roomId] = [];
    
    const messageId = id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const newMessage = { 
      id: messageId,
      ...messageData,
      uid: uid,
      timestamp: Date.now() 
    };

    if (newMessage.imageBase64) {
      const localMedia = syncService.saveMediaFileLocally(messageId, newMessage.imageBase64, newMessage.imageMimeType);
      if (localMedia) newMessage.localMediaPath = localMedia;
    }
    
    const existingIndex = db.rooms[roomId].findIndex(m => m.id === messageId);
    if (existingIndex >= 0) {
      db.rooms[roomId][existingIndex] = newMessage;
    } else {
      db.rooms[roomId].push(newMessage);
    }
    syncService.writeLocalDB(db);
    
    io.to(roomId).emit('newMessage', newMessage);
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

  socket.on('cleanupRoom', ({ roomId }) => {
    if (!roomId) return;
    io.to(roomId).emit('roomCleared');
  });

  socket.on('disconnect', () => {
    console.log('❌ Usuario desconectado:', socket.id);
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
