// NoteThread — servidor de sincronização (modo standalone, porta 3001).
// Para o app completo (frontend + sync na MESMA porta) use: node server/www.js
require('./sync').startStandalone();