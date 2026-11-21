import { XY, MILLS, init, apply, board, phase, removable, moves } from './rules.js';

const $ = (id) => document.getElementById(id);
const PFX = 'muehle-v1-';
// shortcut: öffentlicher PeerJS-Vermittler + Gratis-TURN (Open Relay), können ausfallen; dann eigene Server eintragen
const OPTS = { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }] } };
const PEER = new URLSearchParams(location.search).get('peer'); // ?peer=host:port = eigener Vermittler (lokale Tests)
if (PEER) Object.assign(OPTS, { host: PEER.split(':')[0], port: +PEER.split(':')[1] || 9000, path: '/', secure: false });
const loadPeer = () => import('https://cdn.jsdelivr.net/npm/peerjs@1.5.5/+esm');

let mode = null, me = 0, S = null, prev = null, sel = null, room = '';
let peer = null, conn = null, heard = 0, gen = 0, retries = 0, ticker = null, guestTok = null;
const myTok = (() => { try { return sessionStorage.muehleTok ||= crypto.randomUUID(); } catch { return crypto.randomUUID(); } })();

// ---------- Brett aufbauen ----------
const stage = $('stage'), pos = (p) => [5 + XY[p][0] * 15, 20 + XY[p][1] * 15];
const place = (el, x, y) => { el.style.left = x + '%'; el.style.top = y / 1.3 + '%'; };
MILLS.forEach((m, i) => {
  const [a, b] = [pos(m[0]), pos(m[2])], l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  Object.entries({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'ln' }).forEach(([k, v]) => l.setAttribute(k, v));
  l.style.animationDelay = i * 0.06 + 's'; $('grid').append(l);
});
const pts = XY.map((_, p) => { const d = document.createElement('div'); d.className = 'pt'; place(d, ...pos(p)); d.onclick = () => clickPt(p); stage.append(d); return d; });
const pcs = Array.from({ length: 18 }, (_, i) => { const d = document.createElement('div'); d.className = 'pc ' + (i < 9 ? 'w' : 'b'); d.innerHTML = '<i></i>'; stage.append(d); return d; });

// ---------- Klang ----------
let ac;
function tone(f, d = 0.12, type = 'sine', v = 0.12, to = 0, delay = 0) {
  try {
    ac ??= new AudioContext(); const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d);
  } catch { /* kein Ton möglich */ }
}
const arp = (fs, type = 'triangle') => fs.forEach((f, i) => tone(f, 0.25, type, 0.1, 0, i * 0.09));

// ---------- Effekte ----------
function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function burst(x, y, colors, n = 16) {
  const w = stage.clientWidth;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div'), a = Math.random() * 6.283, r = w * (0.06 + Math.random() * 0.12);
    s.className = 'spark'; place(s, x, y);
    s.style.background = colors[i % colors.length]; s.style.boxShadow = `0 0 6px ${colors[i % colors.length]}`;
    s.style.setProperty('--dx', Math.cos(a) * r + 'px'); s.style.setProperty('--dy', Math.sin(a) * r + 'px');
    stage.append(s); setTimeout(() => s.remove(), 850);
  }
}
function ripple(x, y) { const r = document.createElement('div'); r.className = 'ripple'; place(r, x, y); stage.append(r); setTimeout(() => r.remove(), 650); }
function confetti() {
  const cols = ['#ffcf5c', '#ff4d8d', '#3ee8ff', '#7a6bff', '#fff'];
  for (let i = 0; i < 120; i++) {
    const c = document.createElement('div'); c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
    c.style.setProperty('--dx', (Math.random() - 0.5) * 300 + 'px'); c.style.setProperty('--r', Math.random() * 1440 + 'deg');
    c.style.animationDuration = 2 + Math.random() * 2.5 + 's'; c.style.animationDelay = Math.random() * 0.8 + 's';
    document.body.append(c); setTimeout(() => c.remove(), 5500);
  }
}
let toastT;
function toast(msg) { $('toast')?.remove(); clearTimeout(toastT); const t = document.createElement('div'); t.id = 'toast'; t.textContent = msg; document.body.append(t); toastT = setTimeout(() => t.remove(), 3500); }

// ---------- Darstellung ----------
const online = () => mode === 'local' || (conn?.open && Date.now() - heard < 20000);
const myTurn = () => S && !S.winner && (mode === 'local' || S.turn === me);
const colorName = (pl) => (pl === 1 ? 'Weiß' : 'Schwarz');

function render() {
  const b = board(S), bottom = mode === 'local' ? 1 : me;
  S.pieces.forEach((k, i) => {
    const el = pcs[i], old = prev?.pieces[i].p;
    el.classList.remove('can', 'sel', 'kill');
    if (k.p === -2) {
      if (old >= 0) {
        const [x, y] = pos(old); restart(el, 'dead'); burst(x, y, ['#ff4d8d', '#ffcf5c', '#fff', k.o === 1 ? '#fffaf0' : '#8a81b0'], 22);
        tone(500, 0.35, 'sawtooth', 0.08, 50); setTimeout(() => S.pieces[i].p === -2 && el.classList.add('gone'), 560);
      } else if (!el.classList.contains('dead')) el.classList.add('gone');
      return;
    }
    el.classList.remove('dead', 'gone');
    const [x, y] = k.p >= 0 ? pos(k.p) : [24 + (i % 9) * 8.8, k.o === bottom ? 123 : 7];
    el.classList.toggle('hand', k.p < 0);
    if (prev && old !== k.p) {
      restart(el, 'fly'); el.classList.remove('land');
      if (k.p >= 0) setTimeout(() => { if (S.pieces[i].p !== k.p) return; el.classList.remove('fly'); restart(el, 'land'); ripple(x, y); tone(180, 0.1, 'triangle', 0.2); tone(90, 0.08, 'sine', 0.2); }, 600);
    }
    place(el, x, y);
  });

  // Mühle
  const millNew = S.remove && !prev?.remove;
  if (!S.remove) $('millfx').innerHTML = '';
  if (millNew) setTimeout(() => {
    if (!S.remove) return;
    const [a, c] = [pos(S.mill[0]), pos(S.mill[2])];
    $('millfx').innerHTML = `<line class="millline" x1="${a[0]}" y1="${a[1]}" x2="${c[0]}" y2="${c[1]}"/>`;
    S.mill.forEach(p => { const k = S.pieces.findIndex(q => q.p === p); restart(pcs[k], 'inmill'); burst(...pos(p), ['#ff4d8d', '#ffcf5c'], 8); });
    restart(stage, 'shake'); $('banner').classList.remove('hidden');
    clearTimeout(render.bt); render.bt = setTimeout(() => $('banner').classList.add('hidden'), 1150);
    arp([523, 659, 784, 1047]); render();
  }, prev ? 620 : 0);

  // Hinweise für den Spieler am Zug
  pts.forEach(d => d.classList.remove('target'));
  const t = S.turn, can = myTurn() && online() && !(millNew && prev);
  if (can && S.remove) removable(S, t).forEach(p => pcs[S.pieces.findIndex(k => k.p === p)].classList.add('kill'));
  else if (can && phase(S, t) !== 'place') {
    const ms = moves(S, t);
    if (sel !== null && b[sel] !== t) sel = null;
    new Set(ms.map(m => m[0])).forEach(p => pcs[S.pieces.findIndex(k => k.p === p)].classList.add(p === sel ? 'sel' : 'can'));
    ms.filter(m => m[0] === sel).forEach(m => pts[m[1]].classList.add('target'));
  }

  // Texte
  const who = mode === 'local' ? colorName(t) : 'Du', st = $('status');
  let txt;
  if (S.winner) txt = mode === 'local' ? `${colorName(S.winner)} gewinnt!` : S.winner === me ? 'Du hast gewonnen!' : 'Du hast verloren';
  else if (!online()) txt = mode === 'host' ? 'Warte auf Gegner…' : 'Verbindung weg…';
  else if (!myTurn()) txt = S.remove ? 'Gegner hat eine Mühle!' : 'Gegner ist am Zug…';
  else if (S.remove) txt = `Mühle! ${who === 'Du' ? 'Schlag' : who + ', schlag'} einen Stein`;
  else if (phase(S, t) === 'place') txt = `${who === 'Du' ? 'Setze' : who + ': setze'} einen Stein (${9 - S.placed[t]} übrig)`;
  else if (phase(S, t) === 'fly') txt = `${who === 'Du' ? 'Du darfst' : who + ' darf'} springen!`;
  else txt = sel !== null ? 'Wohin ziehen?' : `${who === 'Du' ? 'Ziehe' : who + ': ziehe'} einen Stein`;
  st.textContent = txt; st.classList.toggle('me', myTurn() && online());
  $('nameBot').textContent = mode === 'local' ? 'Weiß' : 'Du'; $('nameTop').textContent = mode === 'local' ? 'Schwarz' : 'Gegner';
  $('nameBot').classList.toggle('on', !S.winner && t === bottom); $('nameTop').classList.toggle('on', !S.winner && t !== bottom);
  $('roomtag').textContent = mode === 'local' ? 'Lokal' : `Raum ${room} · ${colorName(me)}`;

  if (S.winner && !prev?.winner) setTimeout(() => {
    if (!S.winner) return;
    const win = mode === 'local' || S.winner === me;
    $('overtxt').textContent = txt; $('overnote').textContent = '';
    $('over').classList.remove('hidden');
    if (win) { confetti(); arp([523, 659, 784, 1047, 1319]); } else arp([392, 330, 262, 196], 'sine');
  }, 900);
  if (!S.winner) $('over').classList.add('hidden');
  prev = structuredClone(S);
}

// ---------- Eingabe ----------
function clickPt(p) {
  if (!myTurn() || !online()) return;
  const t = S.turn, b = board(S);
  let a;
  if (S.remove) a = { t: 'remove', p };
  else if (phase(S, t) === 'place') a = { t: 'place', p };
  else if (b[p] === t) { sel = sel === p ? null : p; tone(700, 0.06, 'sine', 0.08); return render(); }
  else if (sel !== null) a = { t: 'move', from: sel, to: p };
  else return;
  if (!apply(S, a, t)) { tone(120, 0.15, 'square', 0.05); if (a.t === 'move') { sel = null; render(); } return; }
  sel = null;
  act(a, t);
}
function act(a, pl) {
  if (mode === 'guest') return conn?.open && conn.send(['act', a]);
  doAct(a, pl);
}
function doAct(a, pl) {
  if (a?.t === 'reset') { if (!S.winner) return; S = init(3 - S.start); }
  else { const n = apply(S, a, pl); if (!n) return; S = n; }
  sel = null; render(); sendState();
}
const sendState = () => mode === 'host' && conn?.open && conn.send(['state', S]);

// ---------- Bildschirme ----------
function show(id) { ['menu', 'wait', 'game'].forEach(s => $(s).classList.toggle('hidden', s !== id)); }
function startGame() { show('game'); prev = null; sel = null; render(); }
function leave(msg) {
  gen++; clearInterval(ticker); conn?.close(); peer?.destroy(); peer = conn = S = null; mode = null; retries = 0;
  $('over').classList.add('hidden'); history.replaceState(null, '', location.pathname);
  show('menu'); $('err').textContent = msg || '';
}

// ---------- Netzwerk ----------
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (v) => ALPHA[v % ALPHA.length]).join('');

function attach(c, g) {
  conn = c; heard = Date.now();
  c.on('data', (m) => { if (g !== gen || c !== conn) return; heard = Date.now(); onData(m); });
  c.on('close', () => { if (g === gen && c === conn) lost(); });
}
function startTicker(g) {
  clearInterval(ticker);
  ticker = setInterval(() => {
    if (g !== gen) return clearInterval(ticker);
    if (conn?.open) conn.send(['ping']);
    if (mode === 'host' && peer?.disconnected && !peer.destroyed) try { peer.reconnect(); } catch { /* nächster Versuch */ }
    if (conn && Date.now() - heard > 20000) lost();
  }, 2000);
}
function lost() {
  const c = conn; conn = null; c?.close();
  if (mode === 'host') { toast('Gegner getrennt – er kann mit dem Code wieder beitreten'); render(); }
  else if (mode === 'guest') { toast('Verbindung verloren – verbinde neu…'); if (S) render(); join(room, true); }
}
function onData(m) {
  if (!Array.isArray(m)) return;
  if (mode === 'host' && m[0] === 'act' && m[1] && typeof m[1] === 'object') doAct(m[1], 2);
  if (mode === 'guest' && m[0] === 'state' && m[1]?.pieces) { const first = !S; S = m[1]; retries = 0; if (first || $('game').classList.contains('hidden')) startGame(); else { sel = null; render(); } }
  if (mode === 'guest' && m[0] === 'full') leave('Raum ist schon voll');
}

async function host() {
  const g = ++gen; mode = 'host'; me = 1; show('wait'); $('mycode').textContent = '·····'; $('waittxt').textContent = 'Erstelle Raum';
  let Peer; try { ({ Peer } = await loadPeer()); } catch { return leave('Netzwerk-Bibliothek konnte nicht geladen werden'); }
  if (g !== gen) return;
  room = newCode(); peer?.destroy();
  const pr = peer = new Peer(PFX + room.toLowerCase(), OPTS);
  let opened = false; guestTok = null; startTicker(g);
  pr.on('open', () => {
    if (g !== gen) return;
    opened = true;
    $('mycode').textContent = room; $('waittxt').textContent = 'Warte auf Mitspieler';
    history.replaceState(null, '', '?room=' + room + (PEER ? '&peer=' + PEER : ''));
  });
  pr.on('error', (e) => {
    if (g !== gen) return;
    if (e.type === 'unavailable-id') return host(); // Code schon vergeben: neuen würfeln
    if (!opened) leave('Verbindungsfehler: ' + e.type); else console.warn('P2P', e.type); // danach verbindet der Ticker neu
  });
  pr.on('connection', (c) => {
    c.on('open', () => {
      if (g !== gen) return c.close();
      const tok = c.metadata?.tok;
      if (online() && tok !== guestTok) { c.send(['full']); return setTimeout(() => c.close(), 500); }
      guestTok = tok; conn?.close(); attach(c, g);
      if (!S) { S = init(1); startGame(); } else { toast('Gegner ist da!'); render(); }
      sendState();
    });
  });
}

async function join(code, retry = false) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) return void ($('err').textContent = 'Der Code hat 5 Zeichen');
  const g = ++gen; mode = 'guest'; me = 2; room = code;
  if (!retry) { show('wait'); $('mycode').textContent = code; $('waittxt').textContent = 'Verbinde'; }
  let Peer; try { ({ Peer } = await loadPeer()); } catch { return leave('Netzwerk-Bibliothek konnte nicht geladen werden'); }
  if (g !== gen) return;
  peer?.destroy();
  const pr = peer = new Peer(OPTS);
  const fail = (msg) => {
    if (g !== gen) return; clearTimeout(to); pr.destroy();
    if (S && ++retries <= 10) return setTimeout(() => g === gen && join(code, true), 3000);
    leave(msg);
  };
  const to = setTimeout(() => fail('Keine Antwort vom Raum'), 15000);
  pr.on('open', () => {
    if (g !== gen) return;
    const c = pr.connect(PFX + code.toLowerCase(), { reliable: true, metadata: { tok: myTok } });
    c.on('open', () => { if (g !== gen) return; clearTimeout(to); attach(c, g); startTicker(g); history.replaceState(null, '', '?room=' + code + (PEER ? '&peer=' + PEER : '')); c.send(['hello']); });
  });
  pr.on('error', (e) => fail(e.type === 'peer-unavailable' ? 'Raum nicht gefunden' : 'Verbindungsfehler: ' + e.type));
}

// ---------- Knöpfe ----------
$('create').onclick = () => { tone(440, 0.08); host(); };
$('join').onclick = () => { tone(440, 0.08); join($('codein').value); };
$('codein').onkeydown = (e) => e.key === 'Enter' && join($('codein').value);
$('local').onclick = () => { gen++; mode = 'local'; me = 0; S = init(1); startGame(); };
$('cancel').onclick = () => leave();
$('leave').onclick = $('leave2').onclick = () => leave();
$('copy').onclick = async () => {
  const link = location.origin + location.pathname + '?room=' + room;
  try { await navigator.clipboard.writeText(link); toast('Link kopiert!'); } catch { prompt('Link kopieren:', link); }
};
$('again').onclick = () => {
  if (mode === 'guest') { conn?.open && conn.send(['act', { t: 'reset' }]); $('overnote').textContent = 'Revanche angefragt…'; }
  else doAct({ t: 'reset' }, 0);
};
const q = new URLSearchParams(location.search).get('room');
if (q) { $('codein').value = q; join(q); }
