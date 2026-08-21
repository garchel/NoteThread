// NoteThread — núcleo de sincronização em tempo real (reutilizável).
// - WebSocket: broadcast de notas/threads ENTRE dispositivos DO MESMO usuário
// - Isolamento por usuário: cada cliente envia um userId (hello); dados em db[userId]
// - Persistência em arquivo (JSON) para sobreviver a reinícios
// `installSync(httpServer)` prende o WebSocket no http server fornecido, servindo
// estático + sync na MESMA porta (ideal para um único deploy com HTTPS).

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

// ---------- Persistência server-side ----------
// db[userId] = { threads:{}, folders:{}, notes:{} }
let db = {};
let wss = null; // preenchido em installSync()

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!db || typeof db !== 'object') db = {};
    }
  } catch (e) {
    console.error('Falha ao carregar data.json:', e.message);
    db = {};
  }
}
function save() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(db)); }
  catch (e) { console.error('Falha ao salvar data.json:', e.message); }
}
function userDb(userId) {
  if (!db[userId]) db[userId] = { threads: {}, folders: {}, notes: {} };
  return db[userId];
}
load();

function broadcast(userId, payload, except) {
  if (!userId || !wss) return;
  const msg = JSON.stringify(payload);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN && c.userId === userId && c !== except) c.send(msg);
  });
}

// Prende o WebSocket a um http server (mesma porta do frontend).
function installSync(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    ws.userId = null; // definido no hello
    ws._rate = { count: 0, windowStart: Date.now() };

    ws.on('message', (raw) => {
      // rate-limit: max 30 msgs/sec por conexão
      const now = Date.now();
      if (now - ws._rate.windowStart > 1000) { ws._rate.windowStart = now; ws._rate.count = 0; }
      ws._rate.count += 1;
      if (ws._rate.count > 30) return;
      if (raw.length > 1_500_000) return; // payload max 1.5MB (imagem)
      let ev;
      try { ev = JSON.parse(raw.toString()); } catch { return; }
      const type = ev.type;

      // handshake: define a conta dona desta conexão (e-mail, ou UUID anônimo)
      if (type === 'hello') {
        const userId = (ev.payload && ev.payload.userId) || 'anon';
        ws.userId = userId;
        ws.send(JSON.stringify({ type: 'snapshot', payload: userDb(userId) }));
        return;
      }

      const userId = ws.userId;
      if (!userId) return; // ignora mensagens antes do hello
      const udb = userDb(userId);
      const p = ev.payload || {};

      if (type === 'note:upsert') {
        const n = p;
        if (!n || !n.threadId || !n.clientId) return;
        if (n.text && n.text.length > 5000) n.text = n.text.slice(0, 5000);
        if (n.images && n.images.length > 5) n.images = n.images.slice(0, 5);
        udb.notes[n.threadId] = udb.notes[n.threadId] || [];
        const idx = udb.notes[n.threadId].findIndex((x) => x.clientId === n.clientId);
        if (idx >= 0) udb.notes[n.threadId][idx] = n; else udb.notes[n.threadId].push(n);
        save();
        broadcast(userId, { type: 'note:upsert', payload: n }, ws);
      }

      else if (type === 'thread:upsert') {
        const t = p; if (!t || !t.id) return;
        udb.threads[t.id] = t; save();
        broadcast(userId, { type: 'thread:upsert', payload: t }, ws);
      }

      else if (type === 'thread:delete') {
        const { id } = p; if (!id) return;
        delete udb.threads[id]; delete udb.notes[id]; save();
        broadcast(userId, { type: 'thread:delete', payload: { id } }, ws);
      }

      else if (type === 'folder:upsert') {
        const f = p; if (!f || !f.id) return;
        udb.folders[f.id] = f; save();
        broadcast(userId, { type: 'folder:upsert', payload: f }, ws);
      }

      else if (type === 'folder:delete') {
        const { id } = p; if (!id) return;
        delete udb.folders[id]; save();
        broadcast(userId, { type: 'folder:delete', payload: { id } }, ws);
      }

      else if (type === 'thread:move') {
        const { threadId, folderId, beforeId } = p; if (!threadId) return;
        const t = udb.threads[threadId]; if (!t) return;
        t.folderId = folderId || null; save();
        broadcast(userId, { type: 'thread:move', payload: { threadId, folderId: folderId || null, beforeId: beforeId || null } }, ws);
      }

      else if (type === 'note:delete') {
        const { threadId, clientId } = p; if (!threadId || !clientId) return;
        if (udb.notes[threadId]) {
          udb.notes[threadId] = udb.notes[threadId].filter((x) => x.clientId !== clientId);
          save();
        }
        broadcast(userId, { type: 'note:delete', payload: { threadId, clientId } }, ws);
      }

      else if (type === 'note:edit') {
        const { threadId, clientId, text, editedAt, rev } = p;
        if (!threadId || !clientId) return;
        const arr = udb.notes[threadId]; if (!arr) return;
        const n = arr.find((x) => x.clientId === clientId); if (!n) return;
        // last-write-wins por timestamp; desempate por rev
        const inc = editedAt || 0, loc = n.editedAt || 0;
        const incRev = rev || 0, locRev = n.rev || 0;
        if (inc < loc || (inc === loc && incRev <= locRev)) return;
        n.text = String(text || '').slice(0, 5000); n.edited = true; n.editedAt = editedAt || Date.now(); n.rev = incRev;
        if (udb.threads[threadId]) udb.threads[threadId].lastPreview = n.text.slice(0, 60);
        save();
        broadcast(userId, { type: 'note:edit', payload: { threadId, clientId, text: n.text, edited: n.edited, editedAt: n.editedAt, rev: n.rev } }, ws);
      }

      else if (type === 'note:tags') {
        const { threadId, clientId, tags } = p;
        if (!threadId || !clientId) return;
        const arr = udb.notes[threadId]; if (!arr) return;
        const n = arr.find((x) => x.clientId === clientId); if (!n) return;
        n.tags = Array.isArray(tags) ? tags.slice(0, 20) : []; save();
        broadcast(userId, { type: 'note:tags', payload: { threadId, clientId, tags: n.tags } }, ws);
      }

      else if (type === 'note:pin') {
        const { threadId, clientId } = p;
        if (!threadId || !udb.threads[threadId]) return;
        const th = udb.threads[threadId];
        th.pinnedId = (th.pinnedId === clientId) ? null : clientId; save();
        broadcast(userId, { type: 'thread:upsert', payload: th }, ws);
      }

      else if (type === 'note:reorder') {
        const { threadId, clientId, newIndex } = p;
        if (!threadId || clientId == null) return;
        const arr = udb.notes[threadId]; if (!arr) return;
        const idx = arr.findIndex((x) => x.clientId === clientId); if (idx < 0) return;
        const [n] = arr.splice(idx, 1);
        arr.splice(Math.max(0, Math.min(newIndex, arr.length)), 0, n);
        arr.forEach((x, i) => { x.sortOrder = i; }); save();
        broadcast(userId, { type: 'note:reorder', payload: { threadId, order: arr.map((x) => ({ clientId: x.clientId, sortOrder: x.sortOrder })) } }, ws);
      }
    });
  });

  return wss;
}

// Health check simples no http server.
function attachHealth(server) {
  const existing = server.listeners('request').slice();
  server.on('request', (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ts: Date.now(), users: Object.keys(db).length }));
      return;
    }
    for (const fn of existing) fn(req, res);
  });
}

// Modo standalone: sobe o sync sozinho na porta SYNC_PORT (default 3001).
function startStandalone() {
  const PORT = process.env.SYNC_PORT || 3001;
  const server = http.createServer((req, res) => { res.writeHead(404); res.end('NoteThread sync server'); });
  installSync(server);
  server.listen(PORT, () => console.log(`NoteThread sync server ouvindo em :${PORT}`));
}

module.exports = { installSync, startStandalone, attachHealth, db };