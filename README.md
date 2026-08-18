# 💬 Chat Efímero en Tiempo Real con Respaldo Local & Purga de 5 Días en Firebase

Aplicación web de mensajería en tiempo real optimizada con sincronización automática en la computadora local y política de retención de 5 días en Firebase.

---

## 🚀 Características y Optimizaciones Implementadas

1. **Sincronización Automática Local (sync-service.js)**:
   - Cada vez que la computadora está encendida y tiene conexión a internet, el servidor local descarga automáticamente todos los mensajes, textos, usuarios e imágenes de Firebase.
   - Las imágenes se decodifican y se guardan como archivos físicos en la carpeta local ./media/ (img_<id>.webp/jpg/png).
   - El historial estructurado se guarda en el archivo local database.json.

2. **Purga Automática de Firebase (Regla de 5 Días)**:
   - Todo mensaje o imagen en Firebase que supere los 5 días de antigüedad (120 horas) es verificado localmente en la computadora y luego eliminado automáticamente de Firebase Firestore.
   - Esto mantiene la cuota de Firebase 100% gratuita y ligera, mientras que esta computadora conserva el archivo permanente completo.

3. **Verificación Continua en Bucle (Looping Test Suite)**:
   - Se incluye el ejecutor de pruebas en bucle node tests/looping-test.js que valida iterativamente:
     - Autenticación anónima REST.
     - Paginación completa de documentos en Firebase (hasta 300+ mensajes por página).
     - Guardado correcto de archivos multimedia en el disco duro.
     - Eliminación efectiva de mensajes antiguos en Firebase.

4. **Resiliencia Offline y Desempeño**:
   - Cola de mensajes offline (chat_offline_queue) en localStorage si falla la red.
   - Soporte para fallback directo al backend local Node.js / Socket.io.

---

## 💻 Instrucciones de Uso y Ejecución

### 1. Iniciar el Servidor Backend con Sync y Purga Automática
node server.js

### 2. Sincronización y Purga Manual Inmediata
npm run sync

### 3. Ejecutar Pruebas en Bucle (Looping Verification)
node tests/looping-test.js
