const fs = require("fs");
const path = require("path");
const syncService = require("../sync-service.js");

function testPairingSystemIntegrity() {
  console.log("\n🔒 VERIFICACIÓN DE INTEGRIDAD DEL SISTEMA DE EMPAREJAMIENTO");
  console.log("-------------------------------------------------");
  let passed = 0;
  let failed = 0;

  // Test 1: app.js contiene funciones de emparejamiento
  const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const requiredFunctions = [
    "generatePairingCode",
    "savePairingCodeLocal",
    "loadPairingCodeLocal",
    "clearPairingCodeLocal",
    "checkPairingStatus",
    "getPairedUsersCount",
    "createPairingAsOwner",
    "joinPairingAsPartner",
    "showPairingModal",
    "hidePairingModal"
  ];
  for (const fn of requiredFunctions) {
    if (appJs.includes("function " + fn)) {
      console.log(`  ✅ ${fn} existe en app.js`);
      passed++;
    } else {
      console.error(`  ❌ ${fn} NO existe en app.js`);
      failed++;
    }
  }

  // Test 2: app.js contiene constantes de emparejamiento
  const requiredVars = ["PAIRING_COLLECTION", "PAIRING_CODE_KEY", "PAIRING_CODE_TTL"];
  for (const v of requiredVars) {
    if (appJs.includes(v)) {
      console.log(`  ✅ ${v} definido en app.js`);
      passed++;
    } else {
      console.error(`  ❌ ${v} NO definido en app.js`);
      failed++;
    }
  }

  // Test 3: app.js contiene estado de emparejamiento
  if (appJs.includes("pairingState")) {
    console.log("  ✅ pairingState definido en app.js");
    passed++;
  } else {
    console.error("  ❌ pairingState NO definido en app.js");
    failed++;
  }

  // Test 4: firestore.rules contiene isPairedUser
  const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");
  if (rules.includes("isPairedUser")) {
    console.log("  ✅ firestore.rules contiene isPairedUser");
    passed++;
  } else {
    console.error("  ❌ firestore.rules NO contiene isPairedUser");
    failed++;
  }

  // Test 5: firestore.rules contiene isAllowedAccount (limita a 2 cuentas fijas)
  if (rules.includes("isAllowedAccount")) {
    console.log("  ✅ firestore.rules limita a 2 cuentas fijas via isAllowedAccount");
    passed++;
  } else {
    console.error("  ❌ firestore.rules NO limita a cuentas fijas");
    failed++;
  }

  // Test 6: firestore.rules requiere isPairedUser para mensajes
  if (rules.includes("isPairedUser(roomId, request.auth.uid)") && rules.includes("match /rooms/{roomId}/messages")) {
    console.log("  ✅ firestore.rules requiere emparejamiento para mensajes");
    passed++;
  } else {
    console.error("  ❌ firestore.rules NO requiere emparejamiento para mensajes");
    failed++;
  }

  // Test 7: UIDs correctos en sync-service.js
  const syncContent = fs.readFileSync(path.join(__dirname, "..", "sync-service.js"), "utf8");
  if (syncContent.includes("Wo9mPGZOafccEETULDr2aFTzjV03") && syncContent.includes("cGHUgMDtcnboB74AlaqgWMxs9w82")) {
    console.log("  ✅ sync-service.js usa UIDs correctos de Firebase Auth");
    passed++;
  } else {
    console.error("  ❌ sync-service.js tiene UIDs incorrectos");
    failed++;
  }

  // Test 8: index.html contiene pairing-modal
  const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  if (indexHtml.includes("pairing-modal") && indexHtml.includes("pairing-step-generate") && indexHtml.includes("pairing-step-enter") && indexHtml.includes("pairing-step-full") && indexHtml.includes("pairing-step-success")) {
    console.log("  ✅ index.html contiene modal de emparejamiento completo");
    passed++;
  } else {
    console.error("  ❌ index.html NO contiene modal de emparejamiento completo");
    failed++;
  }

  // Test 9: style.css contiene estilos de pairing
  const styleCss = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
  if (styleCss.includes(".pairing-modal") && styleCss.includes(".pairing-code-display") && styleCss.includes(".pairing-code-input")) {
    console.log("  ✅ style.css contiene estilos de emparejamiento");
    passed++;
  } else {
    console.error("  ❌ style.css NO contiene estilos de emparejamiento");
    failed++;
  }

  // Test 11: Sistema de audio en app.js
  const audioFns = [
    "startVoiceRecording",
    "stopVoiceRecording",
    "cancelVoiceRecording",
    "showAudioPreviewModal",
    "sendPendingAudio",
    "getSupportedAudioMimeType"
  ];
  for (const fn of audioFns) {
    if (appJs.includes("function " + fn)) {
      console.log(`  ✅ Audio: ${fn} existe en app.js`);
      passed++;
    } else {
      console.error(`  ❌ Audio: ${fn} NO existe en app.js`);
      failed++;
    }
  }

  // Test 12: index.html contiene elementos de audio
  if (indexHtml.includes("audio-preview-modal") && indexHtml.includes("voice-btn") && indexHtml.includes("voice-rec-stop-btn")) {
    console.log("  ✅ index.html contiene modal de vista previa y botones de audio");
    passed++;
  } else {
    console.error("  ❌ index.html NO contiene elementos de audio necesarios");
    failed++;
  }

  // Test 14: Gestión y persistencia del fondo del chat
  const bgFns = ["ChatBgStorage", "applyChatBackground", "initChatBackground", "clearChatBackground"];
  for (const fn of bgFns) {
    if (appJs.includes(fn)) {
      console.log(`  ✅ Fondo: ${fn} existe en app.js`);
      passed++;
    } else {
      console.error(`  ❌ Fondo: ${fn} NO existe en app.js`);
      failed++;
    }
  }
  if (styleCss.includes(".chat-messages.chat-bg-active") && !styleCss.includes("body.dark-mode .chat-messages.chat-bg-active { background-image: none !important; }")) {
    console.log("  ✅ style.css permite renderizar background-image en .chat-messages.chat-bg-active");
    passed++;
  } else {
    console.error("  ❌ style.css bloquea el fondo de chat con background-image: none !important");
    failed++;
  }

  // Test 15: Compresión y manejo de imágenes pesadas
  const imgFns = ["compressImageToBase64", "sendPendingImages", "sendToFirestoreOrQueue", "retrySendMessage"];
  for (const fn of imgFns) {
    if (appJs.includes(fn)) {
      console.log(`  ✅ Imagen: ${fn} existe en app.js`);
      passed++;
    } else {
      console.error(`  ❌ Imagen: ${fn} NO existe en app.js`);
      failed++;
    }
  }
  // Verificar compresión limita a MAX 1600px (no 4096px antiguo)
  if (appJs.includes("var MAX = 1600") && !appJs.includes("var MAX = 4096")) {
    console.log("  ✅ Imagen: compressImageToBase64 usa MAX=1600px (correcto)");
    passed++;
  } else {
    console.error("  ❌ Imagen: compressImageToBase64 sigue usando MAX=4096px (bug)");
    failed++;
  }
  // Verificar que existe el estado 'error' y retrySendMessage
  if (appJs.includes("status = 'error'") && appJs.includes("retrySendMessage")) {
    console.log("  ✅ Imagen: manejo de estado 'error' y reintentar están implementados");
    passed++;
  } else {
    console.error("  ❌ Imagen: faltan estado 'error' o función retrySendMessage");
    failed++;
  }
  // Verificar límite server.js
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  if (serverJs.includes("limit: '20mb'")) {
    console.log("  ✅ server.js: límite de payload Express es 20mb (correcto)");
    passed++;
  } else {
    console.error("  ❌ server.js: límite de payload Express no está configurado a 20mb");
    failed++;
  }

  console.log(`\n  RESULTADO: ${passed} pasados, ${failed} fallados`);
  return { passed, failed };
}

async function runLoopingTest(iterations = 3) {
  console.log("=================================================");
  console.log(`🧪 INICIANDO VERIFICACIÓN EN BUCLE (${iterations} CICLOS)`);
  console.log("=================================================");

  let passCount = 0;
  let failCount = 0;

  for (let i = 1; i <= iterations; i++) {
    console.log(`\n--- 🔄 CICLO DE PRUEBA #${i} DE ${iterations} ---`);

    try {
      // Step 1: Verificar Token de Auth
      const token = await syncService.getAuthToken();
      if (!token) throw new Error("Fallo al obtener token de la cuenta de Firebase");
      console.log("  [1/5] ✅ Token de Firebase Auth obtenido correctamente.");

      // Step 2: Crear mensaje simulación de >3 días en Firebase
      const oldTimestamp = Date.now() - (4 * 24 * 60 * 60 * 1000); // 4 días en el pasado
      const mockOldMessage = {
        texto: `Mensaje de prueba antiguo #${i} (4 días atrás)`,
        autor: "TesterAuto",
        uid: "test_bot_loop",
        timestamp: oldTimestamp,
        imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
      };

      const createdMsgId = await syncService.createFirestoreMessage("general", mockOldMessage, token);
      if (!createdMsgId) throw new Error("Fallo creando mensaje de prueba en Firebase");
      console.log(`  [2/5] ✅ Mensaje simulado >3 días creado en Firebase con ID: ${createdMsgId}`);

      // Step 3: Ejecutar Sincronización y Purga
      const syncRes = await syncService.runSyncAndPrune("general");
      if (!syncRes.success) throw new Error("runSyncAndPrune devolvió error");
      console.log("  [3/5] ✅ Ciclo de Sincronización y Purga ejecutado.");

      // Step 4: Verificar respaldo local en database.json y en carpeta media/
      const dbData = syncService.readLocalDB();
      const localRoomMsgs = dbData.rooms["general"] || [];
      const savedLocalMsg = localRoomMsgs.find(m => m.id === createdMsgId);

      if (!savedLocalMsg) throw new Error(`El mensaje ${createdMsgId} NO fue encontrado en database.json local`);
      console.log(`  [4/5] ✅ Mensaje respaldado con éxito en esta computadora (database.json).`);

      if (savedLocalMsg.localMediaPath) {
        const fullMediaPath = path.join(__dirname, "..", savedLocalMsg.localMediaPath);
        if (fs.existsSync(fullMediaPath)) {
          console.log(`         📸 Imagen guardada en disco local: ${savedLocalMsg.localMediaPath}`);
        }
      }

      // Step 5: Verificar que el mensaje antiguo fue ELIMINADO de Firebase
      const currentRemoteMsgs = await syncService.fetchFirestoreMessages("general", token);
      const isStillInFirebase = currentRemoteMsgs.some(m => m.id === createdMsgId);

      if (isStillInFirebase) {
        throw new Error(`El mensaje ${createdMsgId} >3 días NO fue purgado de Firebase`);
      }
      console.log(`  [5/5] ✅ Confirmado: El mensaje >3 días fue ELIMINADO de Firebase después de guardarse en esta computadora.`);

      passCount++;
      console.log(`✨ CICLO #${i} FINALIZADO CON ÉXITO.`);
    } catch (err) {
      failCount++;
      console.error(`❌ ERROR EN CICLO #${i}:`, err.message);
    }

    // Esperar brevemente entre ciclos
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log("\n=================================================");
  console.log(`RESUMEN FINAL DE PRUEBAS EN BUCLE:`);
  console.log(`  PASADOS: ${passCount} / ${iterations}`);
  console.log(`  FALLADOS: ${failCount} / ${iterations}`);
  console.log("=================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

// Ejecutar verificación de integridad del sistema de emparejamiento
const pairingResult = testPairingSystemIntegrity();

// Ejecutar 3 bucles de verificación
runLoopingTest(3).then(() => {
  if (pairingResult.failed > 0) {
    console.error("\n❌ PRUEBAS DE EMPAREJAMIENTO FALLARON");
    process.exit(1);
  }
});
