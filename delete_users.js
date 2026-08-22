const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'mensajes-31f68'
});

const db = admin.firestore();

async function deleteUsers() {
  const usersRef = db.collection('rooms').doc('general').collection('users');
  const snapshot = await usersRef.get();
  
  if (snapshot.empty) {
    console.log('No hay usuarios para eliminar');
    return;
  }
  
  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    console.log(`Eliminando usuario: ${doc.id} - ${doc.data().username}`);
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  console.log(`Eliminados ${snapshot.size} usuarios`);
}

deleteUsers().catch(console.error);
