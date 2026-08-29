const firebase = require('firebase/app');
require('firebase/firestore');

const oldConfig = {
  apiKey: "AIzaSyALVjHZtbEJGAx2pswt4l4h654ieGJw_tk",
  authDomain: "mensajes-31f68.firebaseapp.com",
  projectId: "mensajes-31f68",
  storageBucket: "mensajes-31f68.firebasestorage.app",
  messagingSenderId: "832362257221",
  appId: "1:832362257221:web:7a0115d52319375c743c2c"
};

const newConfig = {
  apiKey: "AIzaSyDiawpwZcAucYTqWDbqm04ydGqOJOzdY9M",
  authDomain: "race-master-3d-ee76f.firebaseapp.com",
  projectId: "race-master-3d-ee76f",
  storageBucket: "race-master-3d-ee76f.firebasestorage.app",
  messagingSenderId: "357557800287",
  appId: "1:357557800287:web:c4ef1b0b3a5854a55abaea"
};

const oldApp = firebase.initializeApp(oldConfig, 'old');
const newApp = firebase.initializeApp(newConfig, 'new');

const oldDb = firebase.firestore(oldApp);
const newDb = firebase.firestore(newApp);

async function migrate() {
  // 1. Migrate messages with photos/audios
  console.log('Leyendo mensajes del proyecto viejo...');
  const msgsSnap = await oldDb.collection('rooms/general/messages').get();
  let photoCount = 0, audioCount = 0;
  const batch1 = newDb.batch();
  for (const doc of msgsSnap.docs) {
    const d = doc.data();
    if (d.imageBase64 || d.audioBase64) {
      const ref = newDb.collection('rooms/general/messages').doc(doc.id);
      batch1.set(ref, d);
      if (d.imageBase64) photoCount++;
      if (d.audioBase64) audioCount++;
    }
  }
  console.log('Fotos:', photoCount, '| Audios:', audioCount);
  await batch1.commit();
  console.log('Mensajes migrados OK');

  // 2. Migrate cartas
  console.log('Leyendo cartas...');
  const cartasSnap = await oldDb.collection('rooms/general/cartas').get();
  const batch2 = newDb.batch();
  cartasSnap.docs.forEach(doc => {
    batch2.set(newDb.collection('rooms/general/cartas').doc(doc.id), doc.data());
  });
  console.log('Cartas:', cartasSnap.size);
  await batch2.commit();
  console.log('Cartas migradas OK');

  // 3. Migrate settings
  console.log('Leyendo ajustes...');
  for (const slot of ['user1', 'user2']) {
    const sDoc = await oldDb.collection('rooms/general/settings').doc(slot).get();
    if (sDoc.exists) {
      await newDb.collection('rooms/general/settings').doc(slot).set(sDoc.data());
      console.log('Settings', slot, 'migrado');
    }
  }

  console.log('MIGRACION COMPLETA');
}

migrate().then(() => process.exit(0)).catch(e => { console.error('Error:', e.message); process.exit(1); });
