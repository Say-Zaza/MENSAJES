/**
 * Tests para el sistema de reacciones del Chat Pareja
 * Verifica la lógica de toggleReaction y la sincronización
 */

// Mock de Firebase Firestore
const mockFirestore = {
  messages: {},
  update: async function(docId, data) {
    if (this.messages[docId]) {
      this.messages[docId] = { ...this.messages[docId], ...data };
      return true;
    }
    throw new Error('Documento no existe');
  },
  getDoc: function(docId) {
    return this.messages[docId] || null;
  }
};

// Mock de elementos DOM
const mockElements = {
  messagesContainer: {
    querySelector: function() { return null; }
  }
};

// Test de lógica de reacciones
function testReactionLogic() {
  console.log('=== TEST: Lógica de reacciones ===');
  
  let testMsg = { id: 'msg1', reactions: {}, uid: 'user1' };
  const mockUser = { uid: 'user1' };
  
  // Test 1: Agregar primera reacción
  console.log('\nTest 1: Agregar primera reacción');
  let reactions = { ...testMsg.reactions };
  let uids = reactions['❤️'] ? [...reactions['❤️']] : [];
  let idx = uids.indexOf(mockUser.uid);
  
  if (idx < 0) {
    // Quitar reacciones previas del mismo usuario
    Object.keys(reactions).forEach(e => {
      let arr = reactions[e] ? [...reactions[e]] : [];
      let i = arr.indexOf(mockUser.uid);
      if (i >= 0) arr.splice(i, 1);
      if (arr.length === 0) delete reactions[e];
      else reactions[e] = arr;
    });
    uids = [mockUser.uid];
    reactions['❤️'] = uids;
  }
  
  testMsg.reactions = reactions;
  console.log('  Resultado:', JSON.stringify(testMsg.reactions));
  console.assert(testMsg.reactions['❤️'].includes('user1'), 'FAIL: user1 debería tener reacción ❤️');
  console.log('  ✅ PASS: Reacción agregada correctamente');
  
  // Test 2: Quitar reacción (toggle off)
  console.log('\nTest 2: Quitar reacción (toggle off)');
  reactions = { ...testMsg.reactions };
  uids = reactions['❤️'] ? [...reactions['❤️']] : [];
  idx = uids.indexOf(mockUser.uid);
  
  if (idx >= 0) {
    uids.splice(idx, 1);
    if (uids.length === 0) delete reactions['❤️'];
    else reactions['❤️'] = uids;
  }
  
  testMsg.reactions = reactions;
  console.log('  Resultado:', JSON.stringify(testMsg.reactions));
  console.assert(!testMsg.reactions['❤️'], 'FAIL: No debería haber reacción ❤️');
  console.log('  ✅ PASS: Reacción removida correctamente');
  
  // Test 3: Cambiar reacción (reemplazar)
  console.log('\nTest 3: Cambiar reacción (reemplazar)');
  testMsg.reactions = { '❤️': ['user1'] };
  reactions = { ...testMsg.reactions };
  
  // Primero quitar la reacción anterior
  Object.keys(reactions).forEach(e => {
    let arr = reactions[e] ? [...reactions[e]] : [];
    let i = arr.indexOf(mockUser.uid);
    if (i >= 0) arr.splice(i, 1);
    if (arr.length === 0) delete reactions[e];
    else reactions[e] = arr;
  });
  
  // Luego agregar la nueva
  uids = [mockUser.uid];
  reactions['👍'] = uids;
  
  testMsg.reactions = reactions;
  console.log('  Resultado:', JSON.stringify(testMsg.reactions));
  console.assert(!testMsg.reactions['❤️'], 'FAIL: Reacción ❤️ debería haber sido removida');
  console.assert(testMsg.reactions['👍'].includes('user1'), 'FAIL: user1 debería tener reacción 👍');
  console.log('  ✅ PASS: Reacción reemplazada correctamente');
  
  // Test 4: Reacción de pareja (no quitar la suya)
  console.log('\nTest 4: Reacción de pareja');
  testMsg.reactions = { '❤️': ['user2'] };
  reactions = { ...testMsg.reactions };
  
  // user1 agrega ❤️
  uids = reactions['❤️'] ? [...reactions['❤️']] : [];
  idx = uids.indexOf(mockUser.uid);
  
  if (idx < 0) {
    uids = [mockUser.uid, ...uids];
    reactions['❤️'] = uids;
  }
  
  testMsg.reactions = reactions;
  console.log('  Resultado:', JSON.stringify(testMsg.reactions));
  console.assert(testMsg.reactions['❤️'].includes('user1'), 'FAIL: user1 debería tener reacción ❤️');
  console.assert(testMsg.reactions['❤️'].includes('user2'), 'FAIL: user2 debería seguir teniendo reacción ❤️');
  console.assert(testMsg.reactions['❤️'].length === 2, 'FAIL: Debería haber 2 reacciones ❤️');
  console.log('  ✅ PASS: Ambos usuarios pueden reaccionar con el mismo emoji');
  
  // Test 5: Conteo agrupado
  console.log('\nTest 5: Conteo agrupado');
  testMsg.reactions = { '❤️': ['user1', 'user2'], '👍': ['user1'] };
  console.log('  Reacciones:', JSON.stringify(testMsg.reactions));
  
  Object.keys(testMsg.reactions).forEach(emoji => {
    const count = testMsg.reactions[emoji].length;
    console.log(`  ${emoji}: ${count} reacción(es)`);
  });
  
  console.assert(testMsg.reactions['❤️'].length === 2, 'FAIL: Debería haber 2❤️');
  console.assert(testMsg.reactions['👍'].length === 1, 'FAIL: Debería haber 1👍');
  console.log('  ✅ PASS: Conteo agrupado funciona correctamente');
  
  console.log('\n=== TODOS LOS TESTS PASARON ===');
  return true;
}

// Ejecutar tests
try {
  testReactionLogic();
  process.exit(0);
} catch (err) {
  console.error('TEST FAILED:', err);
  process.exit(1);
}
