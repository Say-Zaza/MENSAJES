# 💬 Chat Efímero en Tiempo Real con Respaldo Local & Purga de 5 Días en Firebase

Aplicación web de mensajería en tiempo real con **2 cuentas fijas de pareja** (sin usuarios anónimos), sincronización automática en la computadora local y política de retención de 5 días en Firebase.

---

## 🚀 Características y Optimizaciones Implementadas

1. **2 Cuentas Fijas (Sin anónimos)**:
   - El chat solo funciona entre las 2 cuentas email/contraseña de la pareja.
   - Se emparejan automáticamente la primera vez que inician sesión (1ª cuenta = owner, 2ª = partner) y quedan emparejadas de forma permanente.
   - **Login por clave**: pantalla única "Ingresa tu clave". Según la clave (la contraseña de cada cuenta) entras como "Tú" o como "Mi Amor". Las dos cuentas deben tener **contraseñas distintas** para poder distinguir quién es quién.

2. **Sincronización Automática Local (sync-service.js)**:
   - Cada vez que la computadora está encendida y tiene conexión a internet, el servidor local descarga automáticamente todos los mensajes, textos, usuarios e imágenes de Firebase.
   - Las imágenes se decodifican y se guardan como archivos físicos en la carpeta local ./media/ (img_<id>.webp/jpg/png).
   - El historial estructurado se guarda en el archivo local database.json.

3. **Purga Automática de Firebase (Regla de 5 Días)**:
   - Todo mensaje o imagen en Firebase que supere los 5 días de antigüedad (120 horas) es verificado localmente en la computadora y luego eliminado automáticamente de Firebase Firestore.
   - Esto mantiene la cuota de Firebase 100% gratuita y ligera, mientras que esta computadora conserva el archivo permanente completo.

4. **Verificación Continua en Bucle (Looping Test Suite)**:
   - Se incluye el ejecutor de pruebas en bucle node tests/looping-test.js que valida iterativamente:
     - Autenticación con cuenta real (no anónima).
     - Paginación completa de documentos en Firebase (hasta 300+ mensajes por página).
     - Guardado correcto de archivos multimedia en el disco duro.
     - Eliminación efectiva de mensajes antiguos en Firebase.

5. **Resiliencia Offline y Desempeño**:
   - Cola de mensajes offline (chat_offline_queue) en localStorage si falla la red.
   - Soporte para fallback al backend local Node.js / Socket.io (solo si el servidor local está activo).
   - Sin listeners por mensaje (ahorro de cuota de Firestore).

---

## ⚙️ Configuración inicial (UNA SOLA VEZ)

### 1. Habilitar Email/Password en Firebase Console
1. Ve a https://console.firebase.google.com → proyecto **race-master-3d-ee76f**.
2. **Authentication → Sign-in method → Email/Password → Habilitar** y guardar.

### 2. Crear las 2 cuentas
1. Edita `sync-config.json` con los emails y contraseñas reales de la pareja (NO subas este archivo a git ni lo despliegues).
2. Ejecuta una vez: `node create-accounts.js` (crea las cuentas en Firebase Auth y muestra sus UIDs).

### 3. Actualizar los emails en la web
En `app.js`, edita la constante `ACCOUNTS` para que los emails coincidan con los de `sync-config.json`.

### 4. Desplegar
```bash
npm run deploy
```

---

## 💻 Instrucciones de Uso y Ejecución

### 1. Iniciar el Servidor Backend con Sync y Purga Automática
node server.js

### 2. Sincronización y Purga Manual Inmediata
npm run sync

### 3. Ejecutar Pruebas en Bucle (Looping Verification)
node tests/looping-test.js

> ⚠️ Nota: las pruebas de Cypress leen las credenciales desde `sync-config.json` para iniciar sesión. Debe existir y tener las cuentas reales creadas.
