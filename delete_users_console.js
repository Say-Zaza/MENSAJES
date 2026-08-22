// Ejecuta esto en la consola del navegador (F12) estando en https://mensajes-31f68.web.app
// SOLO funciona si estás autenticado (usuario anónimo)

const db = firebase.firestore();
const usersRef = db.collection('rooms/general/users');

usersRef.get().then(snapshot => {
  if (snapshot.empty) {
    console.log('No hay usuarios para eliminar');
    return;
  }
  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    console.log('Eliminando:', doc.id, doc.data().username);
    batch.delete(doc.ref);
  });
  return batch.commit();
}).then(() => {
  console.log('✅ Usuarios eliminados');
  location.reload();
}).catch(console.error);
