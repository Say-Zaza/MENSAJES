const fs = require("fs");
const path = require("path");
const syncService = require("../sync-service.js");

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
      const token = await syncService.getAnonymousToken();
      if (!token) throw new Error("Fallo al obtener token anónimo de Firebase");
      console.log("  [1/5] ✅ Token de Firebase Auth obtenido correctamente.");

      // Step 2: Crear mensaje simulación de >5 días en Firebase
      const oldTimestamp = Date.now() - (6 * 24 * 60 * 60 * 1000); // 6 días en el pasado
      const mockOldMessage = {
        texto: `Mensaje de prueba antiguo #${i} (6 días atrás)`,
        autor: "TesterAuto",
        uid: "test_bot_loop",
        timestamp: oldTimestamp,
        imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
      };

      const createdMsgId = await syncService.createFirestoreMessage("general", mockOldMessage, token);
      if (!createdMsgId) throw new Error("Fallo creando mensaje de prueba en Firebase");
      console.log(`  [2/5] ✅ Mensaje simulado >5 días creado en Firebase con ID: ${createdMsgId}`);

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
        throw new Error(`El mensaje ${createdMsgId} >5 días NO fue purgado de Firebase`);
      }
      console.log(`  [5/5] ✅ Confirmado: El mensaje >5 días fue ELIMINADO de Firebase después de guardarse en esta computadora.`);

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

// Ejecutar 3 bucles de verificación
runLoopingTest(3);
