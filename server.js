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

// Socket.io real-time
io.on('connection', (socket) => {
  console.log('✅ Nuevo usuario conectado:', socket.id);

  socket.on('joinRoom', async (roomId) => {
    socket.join(roomId);
    console.log(`Usuario ${socket.id} se unió a la sala: ${roomId}`);
    
    const db = syncService.readLocalDB();
    if (db.rooms[roomId] && db.rooms[roomId].length > 0) {
      socket.emit('chatHistory', db.rooms[roomId]);
    }
  });

  socket.on('chatMessage', (data) => {
    const { roomId, id, ...messageData } = data;
    if (!roomId) return;
    
    const db = syncService.readLocalDB();
    if (!db.rooms[roomId]) db.rooms[roomId] = [];
    
    const messageId = id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const newMessage = { 
      id: messageId,
      ...messageData,
      timestamp: Date.now() 
    };

    if (newMessage.imageBase64) {
      const localMedia = syncService.saveMediaFileLocally(messageId, newMessage.imageBase64, newMessage.imageMimeType);
      if (localMedia) newMessage.localMediaPath = localMedia;
    }
    
    db.rooms[roomId].push(newMessage);
    syncService.writeLocalDB(db);
    
    io.to(roomId).emit('newMessage', newMessage);
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
