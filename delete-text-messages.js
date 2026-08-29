// Ejecutar en la consola del navegador (F12) mientras estás en la app
// Solo borra mensajes de TEXTO, mantiene imágenes y audios
(async function() {
  var db = firebase.firestore();
  var snap = await db.collection('rooms/general/messages').get();
  var toDelete = [];
  snap.forEach(function(doc) {
    var d = doc.data();
    var hasImage = !!d.imageBase64;
    var hasAudio = !!d.audioBase64;
    var hasText = !!d.texto;
    if (hasText && !hasImage && !hasAudio) {
      toDelete.push(doc.id);
    }
  });
  console.log('Mensajes de texto a borrar:', toDelete.length);
  if (toDelete.length === 0) { console.log('No hay mensajes de texto para borrar.'); return; }
  for (var i = 0; i < toDelete.length; i += 500) {
    var batch = db.batch();
    var chunk = toDelete.slice(i, i + 500);
    chunk.forEach(function(id) {
      batch.delete(db.collection('rooms/general/messages').doc(id));
    });
    await batch.commit();
    console.log('Borrados', Math.min(i + 500, toDelete.length), '/', toDelete.length);
  }
  console.log('LISTO. Total borrados:', toDelete.length);
})();
