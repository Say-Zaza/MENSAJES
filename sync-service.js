const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyALVjHZtbEJGAx2pswt4l4h654ieGJw_tk",
  projectId: "mensajes-31f68"
};

const DB_FILE = path.join(__dirname, "database.json");
const MEDIA_DIR = path.join(__dirname, "media");
const CONFIG_FILE = path.join(__dirname, "sync-config.json");
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

// UIDs fijos de las 2 cuentas de la pareja (para respaldar perfiles/presencia)
const FIXED_ACCOUNTS = [
  { uid: "fNTZvGYfOHQ5ldkwqLLFee8RYJ73", assignedKey: "user1" },
  { uid: "Jc0lOW6eSyeEHmXkr1ZRGQVhEGS2", assignedKey: "user2" }
];

if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

function getConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (err) {
    console.error("❌ [SyncService] Error leyendo sync-config.json:", err.message);
    return null;
  }
}

// Token de la cuenta fija de la pareja (usuario1) para leer/borrar en Firestore
async function getAuthToken() {
  const cfg = getConfig();
  if (!cfg) {
    console.error("❌ [SyncService] No se encontró sync-config.json con las credenciales de la cuenta.");
    return null;
  }
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cfg.user1Email, password: cfg.user1Password, returnSecureToken: true })
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
// In-memory cache to avoid repeated fs.readFileSync calls
let _dbCache = null;
let _dbCacheMtime = 0;


function readLocalDB() {
  try {
    const stat = fs.statSync(DB_FILE);
    const mtime = stat.mtimeMs;
    if (_dbCache && _dbCacheMtime === mtime) return _dbCache;
    if (!fs.existsSync(DB_FILE)) {
      _dbCache = { rooms: {} };
      _dbCacheMtime = 0;
      return _dbCache;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.rooms) parsed.rooms = {};
    _dbCache = parsed;
    _dbCacheMtime = mtime;
    return parsed;
  } catch (err) {
    console.error('❌ [SyncService] Error leyendo database.json:', err.message);
    _dbCache = null;
    return { rooms: {} };
  }
}

function writeLocalDB(data) {
  try {
    const tempPath = DB_FILE + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, DB_FILE);
    _dbCache = null; // Invalidate cache
    _dbCacheMtime = 0;
    return true;
  } catch (err) {
    console.error('❌ [SyncService] Error escribiendo database.json:', err.message);
    return false;
  }
}

async function readLocalDBAsync() {
  try {
    const raw = await fsp.readFile(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.rooms) parsed.rooms = {};
    return parsed;
  } catch (err) {
    return { rooms: {} };
  }
}

async function writeLocalDBAsync(data) {
  try {
    const tempPath = DB_FILE + ".tmp";
    await fsp.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
    await fsp.rename(tempPath, DB_FILE);
    return true;
  } catch (err) {
    console.error("❌ [SyncService] Error escribiendo database.json async:", err.message);
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

function saveAudioFileLocally(messageId, base64Str, mimeType) {
  try {
    if (!base64Str || typeof base64Str !== "string") return null;
    
    let ext = "wav";
    if (mimeType && mimeType.includes("webm")) ext = "webm";
    else if (mimeType && mimeType.includes("mp4")) ext = "mp4";
    else if (mimeType && mimeType.includes("ogg")) ext = "ogg";
    else if (base64Str.startsWith("data:audio/webm")) ext = "webm";
    else if (base64Str.startsWith("data:audio/mp4")) ext = "mp4";
    
    const cleanBase64 = base64Str.replace(/^data:audio\/[\w+;]+base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    
    const fileName = `audio_${messageId}.${ext}`;
    const filePath = path.join(MEDIA_DIR, fileName);
    
    fs.writeFileSync(filePath, buffer);
    return `/media/${fileName}`;
  } catch (err) {
    console.error(`❌ [SyncService] Error guardando audio local para ${messageId}:`, err.message);
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
      if (fields.audioBase64?.stringValue !== undefined) msg.audioBase64 = fields.audioBase64.stringValue;
      if (fields.audioMimeType?.stringValue !== undefined) msg.audioMimeType = fields.audioMimeType.stringValue;
      if (fields.viewOnce !== undefined) msg.viewOnce = !!fields.viewOnce.booleanValue;
      if (fields.viewOnceViewed !== undefined) msg.viewOnceViewed = !!fields.viewOnceViewed.booleanValue;

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

async function createFirestoreMessage(roomId, messageData, token, docId) {
  try {
    let url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/rooms/${roomId}/messages`;
    if (docId) url += `?documentId=${encodeURIComponent(docId)}`;

    const ts = messageData.timestamp instanceof Date
      ? messageData.timestamp
      : new Date(messageData.timestamp || Date.now());

    const fields = {
      texto: { stringValue: messageData.texto || "" },
      autor: { stringValue: messageData.autor || "Anonimo" },
      uid: { stringValue: messageData.uid || "anon" },
      localTimestamp: { integerValue: String(messageData.localTimestamp || messageData.timestamp || Date.now()) },
      timestamp: { timestampValue: ts.toISOString() }
    };

    if (messageData.imageBase64) fields.imageBase64 = { stringValue: messageData.imageBase64 };
    if (messageData.imageMimeType) fields.imageMimeType = { stringValue: messageData.imageMimeType };
    if (messageData.imageBlur) fields.imageBlur = { stringValue: messageData.imageBlur };
    if (messageData.imageUrl) fields.imageUrl = { stringValue: messageData.imageUrl };
    if (messageData.imageWidth) fields.imageWidth = { integerValue: String(messageData.imageWidth) };
    if (messageData.imageHeight) fields.imageHeight = { integerValue: String(messageData.imageHeight) };
    if (messageData.imageName) fields.imageName = { stringValue: messageData.imageName };
    if (messageData.audioBase64) fields.audioBase64 = { stringValue: messageData.audioBase64 };
    if (messageData.audioMimeType) fields.audioMimeType = { stringValue: messageData.audioMimeType };
    if (messageData.viewOnce !== undefined) fields.viewOnce = { booleanValue: messageData.viewOnce };
    if (messageData.viewOnceViewed !== undefined) fields.viewOnceViewed = { booleanValue: messageData.viewOnceViewed };
    if (messageData.status) fields.status = { stringValue: messageData.status };
    if (messageData.editedAt) fields.editedAt = { stringValue: messageData.editedAt };
    if (messageData.reactions) {
      fields.reactions = {
        mapValue: {
          fields: Object.fromEntries(
            Object.entries(messageData.reactions).map(([emoji, uids]) => [
              emoji,
              { arrayValue: { values: uids.map(u => ({ stringValue: u })) } }
            ])
          )
        }
      };
    }
    if (messageData.replyTo) {
      fields.replyTo = {
        mapValue: {
          fields: {
            id: { stringValue: messageData.replyTo.id || "" },
            autor: { stringValue: messageData.replyTo.autor || "" },
            texto: { stringValue: messageData.replyTo.texto || "" },
            imageSrc: { stringValue: messageData.replyTo.imageSrc || "" }
          }
        }
      };
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

// ============================================
// DESTACADOS (mensajes favoritos) y AJUSTES por cuenta
// ============================================

// Forma canónica de una copia de mensaje destacado (se usa en app, socket y Firestore)
function messageToSnapshot(msg) {
  const snap = {
    messageId: msg.messageId || msg.id || "",
    texto: msg.texto || "",
    autor: msg.autor || "Anonimo",
    uid: msg.uid || "",
    timestamp: parseInt(msg.localTimestamp || msg.timestamp || Date.now(), 10),
    destacadoAt: parseInt(msg.destacadoAt || msg.localTimestamp || msg.timestamp || Date.now(), 10)
  };
  if (msg.imageBase64) snap.imageBase64 = msg.imageBase64;
  if (msg.imageBlur) snap.imageBlur = msg.imageBlur;
  if (msg.imageWidth) snap.imageWidth = parseInt(msg.imageWidth, 10);
  if (msg.imageHeight) snap.imageHeight = parseInt(msg.imageHeight, 10);
  if (msg.imageName) snap.imageName = msg.imageName;
  if (msg.audioBase64) snap.audioBase64 = msg.audioBase64;
  return snap;
}

function snapshotToRESTFields(snap) {
  const fields = {
    messageId: { stringValue: snap.messageId || "" },
    texto: { stringValue: snap.texto || "" },
    autor: { stringValue: snap.autor || "" },
    uid: { stringValue: snap.uid || "" },
    timestamp: { integerValue: String(snap.timestamp || 0) },
    destacadoAt: { integerValue: String(snap.destacadoAt || snap.timestamp || 0) }
  };
  if (snap.imageBase64) fields.imageBase64 = { stringValue: snap.imageBase64 };
  if (snap.imageBlur) fields.imageBlur = { stringValue: snap.imageBlur };
  if (snap.imageWidth) fields.imageWidth = { integerValue: String(snap.imageWidth) };
  if (snap.imageHeight) fields.imageHeight = { integerValue: String(snap.imageHeight) };
  if (snap.imageName) fields.imageName = { stringValue: snap.imageName };
  if (snap.audioBase64) fields.audioBase64 = { stringValue: snap.audioBase64 };
  return fields;
}

function restFieldsToSnapshot(fields) {
  const snap = {
    messageId: fields.messageId?.stringValue || "",
    texto: fields.texto?.stringValue || "",
    autor: fields.autor?.stringValue || "",
    uid: fields.uid?.stringValue || "",
    timestamp: parseInt(fields.timestamp?.integerValue || "0", 10),
    destacadoAt: parseInt(fields.destacadoAt?.integerValue || fields.timestamp?.integerValue || "0", 10)
  };
  if (fields.imageBase64?.stringValue) snap.imageBase64 = fields.imageBase64.stringValue;
  if (fields.imageBlur?.stringValue) snap.imageBlur = fields.imageBlur.stringValue;
  if (fields.imageWidth?.integerValue) snap.imageWidth = parseInt(fields.imageWidth.integerValue, 10);
  if (fields.imageHeight?.integerValue) snap.imageHeight = parseInt(fields.imageHeight.integerValue, 10);
  if (fields.imageName?.stringValue) snap.imageName = fields.imageName.stringValue;
  if (fields.audioBase64?.stringValue) snap.audioBase64 = fields.audioBase64.stringValue;
  return snap;
}

function destacadosUrl(roomId, slot) {
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/rooms/${roomId}/destacados/${slot}`;
}
function settingsUrl(roomId, slot) {
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/rooms/${roomId}/settings/${slot}`;
}
function roomUrl(roomId) {
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/rooms/${roomId}`;
}
function cartasUrl(roomId) {
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/rooms/${roomId}/cartas?pageSize=200`;
}

async function getCartasDoc(roomId, token) {
  try {
    const response = await fetch(cartasUrl(roomId), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const docs = data.documents || [];
    return docs.map(d => {
      const snap = restFieldsToSnapshot(d.fields || {});
      return { ...snap, id: d.name ? d.name.split("/").pop() : snap.id };
    });
  } catch (err) {
    console.error(`❌ [SyncService] Error leyendo cartas de ${roomId}:`, err.message);
    return [];
  }
}

async function getRoomDoc(roomId, token) {
  try {
    const response = await fetch(roomUrl(roomId), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 404) return { pinnedMessages: [] };
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const values = data.fields?.pinnedMessages?.arrayValue?.values || [];
    return { pinnedMessages: values.map(v => restFieldsToSnapshot(v.mapValue?.fields || {})) };
  } catch (err) {
    console.error(`❌ [SyncService] Error leyendo doc de sala ${roomId}:`, err.message);
    return { pinnedMessages: [] };
  }
}

async function getDestacadosDoc(roomId, slot, token) {
  try {
    const response = await fetch(destacadosUrl(roomId, slot), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 404) return { items: [] };
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const values = data.fields?.items?.arrayValue?.values || [];
    return { items: values.map(v => restFieldsToSnapshot(v.mapValue?.fields || {})) };
  } catch (err) {
    console.error(`❌ [SyncService] Error leyendo destacados de ${slot}:`, err.message);
    return { items: [] };
  }
}

async function setDestacadosItem(roomId, slot, action, snapshot, token) {
  try {
    const current = await getDestacadosDoc(roomId, slot, token);
    let items = current.items || [];

    if (action === "add") {
      const idx = items.findIndex(i => i.messageId === snapshot.messageId);
      if (idx >= 0) items[idx] = { ...snapshot };
      else items.push({ ...snapshot });
    } else {
      items = items.filter(i => i.messageId !== snapshot.messageId);
    }

    const encoded = items.map(i => ({ mapValue: { fields: snapshotToRESTFields(i) } }));
    const patchRes = await fetch(destacadosUrl(roomId, slot) + "?updateMask.fieldPaths=items", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { items: { arrayValue: { values: encoded } } } })
    });
    if (!patchRes.ok) throw new Error(`HTTP ${patchRes.status}: ${await patchRes.text()}`);
    return true;
  } catch (err) {
    console.error(`❌ [SyncService] Error actualizando destacados de ${slot} (${action}):`, err.message);
    return false;
  }
}

async function getSettingsDoc(roomId, slot, token) {
  try {
    const response = await fetch(settingsUrl(roomId, slot), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 404) return { shareDestacados: false };
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return { shareDestacados: !!data.fields?.shareDestacados?.booleanValue };
  } catch (err) {
    console.error(`❌ [SyncService] Error leyendo settings de ${slot}:`, err.message);
    return { shareDestacados: false };
  }
}

async function setSettingsDoc(roomId, slot, shareDestacados, token) {
  try {
    const patchRes = await fetch(settingsUrl(roomId, slot) + "?updateMask.fieldPaths=shareDestacados", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { shareDestacados: { booleanValue: !!shareDestacados } } })
    });
    if (!patchRes.ok) throw new Error(`HTTP ${patchRes.status}: ${await patchRes.text()}`);
    return true;
  } catch (err) {
    console.error(`❌ [SyncService] Error actualizando settings de ${slot}:`, err.message);
    return false;
  }
}

function usersUrl(roomId, uid) {
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/rooms/${roomId}/users/${uid}`;
}

async function getProfileDoc(roomId, uid, token) {
  try {
    const response = await fetch(usersUrl(roomId, uid), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 404) return { username: "", avatarBase64: "", bio: "", color: "", assignedKey: "", lastActive: 0 };
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const f = data.fields || {};
    return {
      username: f.username?.stringValue || "",
      avatarBase64: f.avatarBase64?.stringValue || "",
      bio: f.bio?.stringValue || "",
      color: f.color?.stringValue || "",
      assignedKey: f.assignedKey?.stringValue || "",
      lastActive: f.lastActive?.timestampValue ? new Date(f.lastActive.timestampValue).getTime() : 0
    };
  } catch (err) {
    console.error(`❌ [SyncService] Error leyendo perfil de ${uid}:`, err.message);
    return { username: "", avatarBase64: "", bio: "", color: "", assignedKey: "", lastActive: 0 };
  }
}

async function setProfileDoc(roomId, uid, profile, token) {
  try {
    const fields = {
      username: { stringValue: profile.username || "" },
      bio: { stringValue: profile.bio || "" },
      lastActive: { timestampValue: new Date().toISOString() },
      avatarBase64: profile.avatarBase64 ? { stringValue: profile.avatarBase64 } : { nullValue: null }
    };
    const mask = "updateMask.fieldPaths=username&updateMask.fieldPaths=bio&updateMask.fieldPaths=lastActive&updateMask.fieldPaths=avatarBase64";
    const patchRes = await fetch(usersUrl(roomId, uid) + "?" + mask, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields })
    });
    if (!patchRes.ok) throw new Error(`HTTP ${patchRes.status}: ${await patchRes.text()}`);
    return true;
  } catch (err) {
    console.error(`❌ [SyncService] Error actualizando perfil de ${uid}:`, err.message);
    return false;
  }
}

async function runSyncAndPrune(roomId = "general") {
  console.log(`🔄 [SyncService] Iniciando ciclo de sincronización y purga (Sala: ${roomId})...`);
  
  const token = await getAuthToken();
  if (!token) {
    console.warn("⚠️ [SyncService] Sin conexión a internet o credenciales inválidas. Reintentará más tarde.");
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

    if (remoteMsg.audioBase64 && !localMsg.localAudioPath) {
      const audioPath = saveAudioFileLocally(msgId, remoteMsg.audioBase64, remoteMsg.audioMimeType);
      if (audioPath) {
        localMsg.localAudioPath = audioPath;
        mediaSavedCount++;
      }
    }

    if (localMsgIndex >= 0) {
      localDB.rooms[roomId][localMsgIndex] = localMsg;
    } else {
      localDB.rooms[roomId].push(localMsg);
    }
  }

  localDB.rooms[roomId].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // Respaldo permanente de destacados y ajustes en la PC (no se purgan)
  for (const slot of ["user1", "user2"]) {
    if (!localDB.destacados) localDB.destacados = {};
    if (!localDB.destacados[roomId]) localDB.destacados[roomId] = {};
    const remoteDest = await getDestacadosDoc(roomId, slot, token);
    localDB.destacados[roomId][slot] = remoteDest;

    if (!localDB.settings) localDB.settings = {};
    if (!localDB.settings[roomId]) localDB.settings[roomId] = {};
    const remoteSet = await getSettingsDoc(roomId, slot, token);
    const prev = localDB.settings[roomId][slot] || { shareDestacados: false };
    localDB.settings[roomId][slot] = { ...prev, shareDestacados: remoteSet.shareDestacados };
  }

  // Respaldo permanente del buzón de cartas (sistema independiente; NUNCA se purga)
  try {
    const cartas = await getCartasDoc(roomId, token);
    if (!localDB.cartas) localDB.cartas = {};
    localDB.cartas[roomId] = cartas;
  } catch (e) {
    console.error("❌ [SyncService] Error respaldando cartas:", e.message);
  }

  // Respaldo de perfiles/presencia de las 2 cuentas fijas
  if (!localDB.users) localDB.users = {};
  if (!localDB.users[roomId]) localDB.users[roomId] = {};
  for (const acc of FIXED_ACCOUNTS) {
    const remote = await getProfileDoc(roomId, acc.uid, token);
    localDB.users[roomId][acc.uid] = {
      ...remote,
      assignedKey: remote.assignedKey || acc.assignedKey
    };
  }

  // Escribir en base de datos local primero para asegurar persistencia
  const savedSuccessfully = writeLocalDB(localDB);
  if (!savedSuccessfully) {
    console.error("❌ [SyncService] Fallo al escribir database.json. Se aborta la purga para evitar pérdida de datos.");
    return { success: false, reason: "db_write_error" };
  }

  // SOLO DESPUÉS de guardar con éxito en disco, purgar de Firebase
  // Los mensajes FIJADOS no se purgan (evita referencias huérfanas en pinnedMessages)
  const roomDoc = await getRoomDoc(roomId, token);
  const pinnedIds = new Set((roomDoc.pinnedMessages || []).map(p => p.id).filter(Boolean));
  let skippedPinnedCount = 0;

  for (const remoteMsg of firestoreMessages) {
    const msgId = remoteMsg.id;
    if (pinnedIds.has(msgId)) { skippedPinnedCount++; continue; }
    const msgAgeMs = now - (remoteMsg.timestamp || now);
    if (msgAgeMs > FIVE_DAYS_MS) {
      console.log(`🗑️ [SyncService] Mensaje ${msgId} (Antigüedad: ${(msgAgeMs / (1000 * 3600 * 24)).toFixed(1)} días) -> Eliminando de Firebase...`);
      const deleted = await deleteFirestoreMessage(roomId, msgId, token);
      if (deleted) {
        deletedFromFirebaseCount++;
      }
    }
  }

  console.log(`✅ [SyncService] Sincronización completada con éxito:
     - Mensajes nuevos guardados localmente: ${downloadedCount}
     - Imágenes/archivos guardados en disco (${MEDIA_DIR}): ${mediaSavedCount}
     - Mensajes antiguos (>5 días) eliminados de Firebase: ${deletedFromFirebaseCount}
     - Mensajes fijados protegidos de la purga: ${skippedPinnedCount}`);

  return {
    success: true,
    downloadedCount,
    mediaSavedCount,
    deletedFromFirebaseCount,
    skippedPinnedCount,
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
  getAuthToken,
  readLocalDB,  writeLocalDB,
  readLocalDBAsync,
  writeLocalDBAsync,
  saveMediaFileLocally,
  saveAudioFileLocally,
  fetchFirestoreMessages,
  deleteFirestoreMessage,
  createFirestoreMessage,
  messageToSnapshot,
  getDestacadosDoc,
  setDestacadosItem,
  getSettingsDoc,
  setSettingsDoc,
  getProfileDoc,
  setProfileDoc,
  FIXED_ACCOUNTS,
  runSyncAndPrune,
  startSyncLoop,
  FIVE_DAYS_MS,
  MEDIA_DIR,
  DB_FILE
};