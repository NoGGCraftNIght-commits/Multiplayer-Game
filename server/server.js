// Grand Tor Auto – Multiplayer-Server (Node.js + Socket.io): liefert das Spiel aus; die Spiel-Logik steckt in
// client/js/game-server.js (läuft auch im Browser, wenn ohne Server gespielt wird).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { MAX_PLAYERS } from '../client/js/shared.js';
import { startGame, rooms } from '../client/js/game-server.js';

const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client');

// ---------- statische Dateien (damit "npm start" lokal sofort spielbar ist) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const httpServer = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (p === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (p === '/rooms') { // offene Räume mit Ersteller für die Liste im Menü
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': CORS_ORIGIN });
    return res.end(JSON.stringify([...rooms.values()].filter(r => r.players.size && r.players.size < MAX_PLAYERS).map(r => ({ code: r.code, host: r.host, n: r.players.size }))));
  }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(CLIENT_DIR, '.' + p);
  if (!file.startsWith(CLIENT_DIR + path.sep)) { res.writeHead(403); return res.end(); } // Path-Traversal-Schutz
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

const io = new Server(httpServer, { cors: { origin: CORS_ORIGIN }, pingInterval: 10000, pingTimeout: 8000, maxHttpBufferSize: 1e5 });
startGame(io);

httpServer.listen(PORT, () => {
  console.log(`Grand-Tor-Auto-Server läuft auf Port ${PORT}`);
  console.log(`Lokal spielen: http://localhost:${PORT}/`);
});

export { httpServer, io, rooms }; // für Tests
