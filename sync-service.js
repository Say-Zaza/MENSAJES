const fs = require("fs");
const path = require("path");

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyALVjHZtbEJGAx2pswt4l4h654ieGJw_tk",
  projectId: "mensajes-31f68"
};

const DB_FILE = path.join(__dirname, "database.json");
const MEDIA_DIR = path.join(__dirname, "media");
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

async function getAnonymousToken() {
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnSecureToken: true })
      }
    );
    if (!response.ok) {
      throw new Error(`Error Auth Firebase REST (${response.status}): ${await response.text()}`);
    }
    const data = await response.json();
    return data.idToken;
  } catch (err) {
    console.error("❌ [SyncService] Error obteniendo token de Firebase:", err.message);
    return null;
  }
}

function readLocalDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return { rooms: {} };
    }
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.rooms) parsed.rooms = {};
    return parsed;
  } catch (err) {
    console.error("❌ [SyncService] Error leyendo database.json:", err.message);
    return { rooms: {} };
  }
}

function writeLocalDB(data) {
  try {
    const tempPath = DB_FILE + ".tmp";
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tempPath, DB_FILE);
    return true;
  } catch (err) {
    console.error("❌ [SyncService] Error escribiendo database.json:", err.message);
    return false;
  }
}

function saveMediaFileLocally(messageId, base64Str, mimeType) {
  try {
    if (!base64Str || typeof base64Str !== "string") return null;
    
    let ext = "jpg";
    if (mimeType && mimeType.includes("webp")) ext = "webp";
    else if (mimeType && mimeType.includes("png")) ext = "png";
    else if (mimeType && mimeType.includes("jpeg")) ext = "jpg";
    else if (base64Str.startsWith("data:image/webp")) ext = "webp";
    else if (base64Str.startsWith("data:image/png")) ext = "png";
    
    const cleanBase64 = base64Str.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    
    const fileName = `img_${messageId}.${ext}`;
    const filePath = path.join(MEDIA_DIR, fileName);
    
    fs.writeFileSync(filePath, buffer);
    return `/media/${fileName}`;
  } catch (err) {
    console.error(`❌ [SyncService] Error guardando medio local para ${messageId}:`, err.message);
    return null;
  }
}

/**
 * Obtener TODOS los mensajes de Firestore soportando paginación completa (nextPageToken)
 */
async function fetchFirestoreMessages(roomId, token) {
  try {
    let allDocs = [];
    let pageToken = null;

    do {
      let url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/rooms/${roomId}/messages?pageSize=300`;
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const response = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (response.status === 404) break;
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      if (data.documents && data.documents.length > 0) {
        allDocs.push(...data.documents);
      }
      pageToken = data.nextPageToken || null;
    } while (pageToken);

    return allDocs.map(doc => {
      const parts = doc.name.split("/");
      const docId = parts[parts.length - 1];
      const fields = doc.fields || {};

      const msg = { id: docId };

      if (fields.texto?.stringValue !== undefined) msg.texto = fields.texto.stringValue;
      if (fields.autor?.stringValue !== undefined) msg.autor = fields.autor.stringValue;
      if (fields.uid?.stringValue !== undefined) msg.uid = fields.uid.stringValue;
      if (fields.imageBase64?.stringValue !== undefined) msg.imageBase64 = fields.imageBase64.stringValue;
      if (fields.imageUrl?.stringValue !== undefined) msg.imageUrl = fields.imageUrl.stringValue;
      if (fields.imageMimeType?.stringValue !== undefined) msg.imageMimeType = fields.imageMimeType.stringValue;
      if (fields.imageBlur?.stringValue !== undefined) msg.imageBlur = fields.imageBlur.stringValue;
      if (fields.imageWidth?.integerValue !== undefined) msg.imageWidth = parseInt(fields.imageWidth.integerValue, 10);
      if (fields.imageHeight?.integerValue !== undefined) msg.imageHeight = parseInt(fields.imageHeight.integerValue, 10);
      if (fields.imageName?.stringValue !== undefined) msg.imageName = fields.imageName.stringValue;

      if (fields.localTimestamp?.integerValue) {
        msg.timestamp = parseInt(fields.localTimestamp.integerValue, 10);
      } else if (fields.timestamp?.timestampValue) {
        msg.timestamp = new Date(fields.timestamp.timestampValue).getTime();
      } else if (fields.timestamp?.integerValue) {
        msg.timestamp = parseInt(fields.timestamp.integerValue, 10);
      } else {
        msg.timestamp = new Date(doc.createTime).getTime();
      }

      return msg;
    });
  } catch (err) {
    console.error(`❌ [SyncService] Error consultando Firestore para sala ${roomId}:`, err.message);
    return [];
  }
}

async function deleteFirestoreMessage(roomId, messageId, token) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/rooms/${roomId}/messages/${messageId}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return true;
  } catch (err) {
    console.error(`❌ [SyncService] Error eliminando mensaje ${messageId} de Firebase:`, err.message);
    return false;
  }
}

async function createFirestoreMessage(roomId, messageData, token) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/rooms/${roomId}/messages`;
    const fields = {
      texto: { stringValue: messageData.texto || "" },
      autor: { stringValue: messageData.autor || "Anonimo" },
      uid: { stringValue: messageData.uid || "anon" },
      localTimestamp: { integerValue: String(messageData.timestamp || Date.now()) }
    };

    if (messageData.imageBase64) {
      fields.imageBase64 = { stringValue: messageData.imageBase64 };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const resData = await response.json();
    const parts = resData.name.split("/");
    return parts[parts.length - 1];
  } catch (err) {
    console.error("❌ [SyncService] Error creando mensaje en Firestore:", err.message);
    return null;
  }
}

async function runSyncAndPrune(roomId = "general") {
  console.log(`🔄 [SyncService] Iniciando ciclo de sincronización y purga (Sala: ${roomId})...`);
  
  const token = await getAnonymousToken();
  if (!token) {
    console.warn("⚠️ [SyncService] Sin conexión a internet o token inválido. Reintentará más tarde.");
    return { success: false, reason: "no_auth" };
  }

  const firestoreMessages = await fetchFirestoreMessages(roomId, token);
  console.log(`📥 [SyncService] ${firestoreMessages.length} mensajes totales obtenidos de Firebase.`);

  const localDB = readLocalDB();
  if (!localDB.rooms[roomId]) {
    localDB.rooms[roomId] = [];
  }

  const now = Date.now();
  let downloadedCount = 0;
  let mediaSavedCount = 0;
  let deletedFromFirebaseCount = 0;

  for (const remoteMsg of firestoreMessages) {
    const msgId = remoteMsg.id;
    let localMsgIndex = localDB.rooms[roomId].findIndex(m => m.id === msgId);
    let localMsg = localMsgIndex >= 0 ? localDB.rooms[roomId][localMsgIndex] : null;

    if (!localMsg) {
      localMsg = { ...remoteMsg };
      downloadedCount++;
    }

    if ((remoteMsg.imageBase64 || remoteMsg.imageUrl) && !localMsg.localMediaPath) {
      const base64Data = remoteMsg.imageBase64 || remoteMsg.imageUrl;
      const mediaPath = saveMediaFileLocally(msgId, base64Data, remoteMsg.imageMimeType);
      if (mediaPath) {
        localMsg.localMediaPath = mediaPath;
        mediaSavedCount++;
      }
    }

    if (localMsgIndex >= 0) {
      localDB.rooms[roomId][localMsgIndex] = localMsg;
    } else {
      localDB.rooms[roomId].push(localMsg);
    }

    // VERIFICACIÓN DE PURGA (5 DÍAS)
    const msgAgeMs = now - (remoteMsg.timestamp || now);
    if (msgAgeMs > FIVE_DAYS_MS) {
      console.log(`🗑️ [SyncService] Mensaje ${msgId} (Antigüedad: ${(msgAgeMs / (1000 * 3600 * 24)).toFixed(1)} días) -> Eliminando de Firebase...`);
      const deleted = await deleteFirestoreMessage(roomId, msgId, token);
      if (deleted) {
        deletedFromFirebaseCount++;
      }
    }
  }

  localDB.rooms[roomId].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  writeLocalDB(localDB);

  console.log(`✅ [SyncService] Sincronización completada con éxito:
     - Mensajes nuevos guardados localmente: ${downloadedCount}
     - Imágenes/archivos guardados en disco (${MEDIA_DIR}): ${mediaSavedCount}
     - Mensajes antiguos (>5 días) eliminados de Firebase: ${deletedFromFirebaseCount}`);

  return {
    success: true,
    downloadedCount,
    mediaSavedCount,
    deletedFromFirebaseCount,
    totalLocalMessages: localDB.rooms[roomId].length
  };
}

function startSyncLoop(intervalMinutes = 15, roomId = "general") {
  console.log(`🚀 [SyncService] Bucle de sincronización iniciado (Cada ${intervalMinutes} minutos).`);
  
  runSyncAndPrune(roomId).catch(err => {
    console.error("❌ [SyncService] Error en primera ejecución de sync:", err.message);
  });

  const intervalMs = intervalMinutes * 60 * 1000;
  return setInterval(() => {
    runSyncAndPrune(roomId).catch(err => {
      console.error("❌ [SyncService] Error en ejecución periódica de sync:", err.message);
    });
  }, intervalMs);
}

module.exports = {
  getAnonymousToken,
  readLocalDB,
  writeLocalDB,
  saveMediaFileLocally,
  fetchFirestoreMessages,
  deleteFirestoreMessage,
  createFirestoreMessage,
  runSyncAndPrune,
  startSyncLoop,
  FIVE_DAYS_MS,
  MEDIA_DIR,
  DB_FILE
};
