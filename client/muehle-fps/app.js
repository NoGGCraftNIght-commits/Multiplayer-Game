import { XY, MILLS, init, apply, spare, board, phase, removable, moves } from '../muehle/rules.js';

const $ = (id) => document.getElementById(id);
const PFX = 'muehle-fps-v1-';
// shortcut: öffentlicher PeerJS-Vermittler + Gratis-TURN (Open Relay), können ausfallen; dann eigene Server eintragen
const OPTS = { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }] } };
const PEER = new URLSearchParams(location.search).get('peer'); // ?peer=host:port = eigener Vermittler (lokale Tests)
if (PEER) Object.assign(OPTS, { host: PEER.split(':')[0], port: +PEER.split(':')[1] || 9000, path: '/', secure: false });
const loadPeer = () => import('https://cdn.jsdelivr.net/npm/peerjs@1.5.5/+esm');

let mode = null, me = 0, S = null, prev = null, sel = null, room = '';
let duel = null, duelId = 0, duelSeq = 0, trainRole = 'att';
const AUTO = new URLSearchParams(location.search).has('autobot'); // Testhilfe: Bot steuert die eigene Figur im Duell
const loadDuel = () => import('./duel.js');
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
    el.classList.remove('can', 'sel', 'kill', ...(S.duel ? [] : ['target']));
    if (k.p === -2) {
      if (old >= 0) {
        const [x, y] = pos(old); restart(el, 'dead'); burst(x, y, ['#ff4d8d', '#ffcf5c', '#fff', k.o === 1 ? '#fffaf0' : '#8a81b0'], 22);
        tone(500, 0.35, 'sawtooth', 0.08, 50); setTimeout(() => S?.pieces[i].p === -2 && el.classList.add('gone'), 560);
      } else if (!el.classList.contains('dead')) el.classList.add('gone');
      return;
    }
    el.classList.remove('dead', 'gone');
    const [x, y] = k.p >= 0 ? pos(k.p) : [24 + (i % 9) * 8.8, k.o === bottom ? 123 : 7];
    el.classList.toggle('hand', k.p < 0);
    if (prev && old !== k.p) {
      restart(el, 'fly'); el.classList.remove('land');
      if (k.p >= 0) setTimeout(() => { if (S?.pieces[i].p !== k.p) return; el.classList.remove('fly'); restart(el, 'land'); ripple(x, y); tone(180, 0.1, 'triangle', 0.2); tone(90, 0.08, 'sine', 0.2); }, 600);
    }
    place(el, x, y);
  });

  // Duell starten/beenden
  if (S.duel && duelId !== S.duel.id) {
    duelId = S.duel.id; stopDuel();
    const id = S.duel.id;
    $('banner').firstElementChild.textContent = 'DUELL!'; $('banner').classList.remove('hidden'); restart(stage, 'shake'); arp([392, 523, 659, 880], 'sawtooth');
    const k = S.pieces.findIndex(q => q.p === S.duel.p); if (k >= 0) restart(pcs[k], 'target');
    clearTimeout(render.bt); render.bt = setTimeout(() => $('banner').classList.add('hidden'), 1150);
    Promise.all([loadDuel(), new Promise(r => setTimeout(r, 1100))]).then(([D]) => {
      if (!S?.duel || S.duel.id !== id || duel) return;
      const att = S.duel.att, g = gen;
      duel = D.startDuel({ role: att === me ? 'att' : 'def', color: me, host: mode === 'host', auto: AUTO,
        send: (m) => conn?.open && conn.send(['d', m]),
        onEnd: (win) => g === gen && S?.duel?.id === id && resolveDuel(win) });
    }, () => { toast('3D-Modul konnte nicht geladen werden'); if (mode === 'host') resolveDuel('att'); });
  }
  if (!S.duel && duel) { stopDuel(); duelId = 0; }
  if (!S.duel) duelId = 0;
  if (prev?.duel && !S.duel) {
    const p = prev.duel.p, k = S.pieces.findIndex(q => q.p === p);
    if (k >= 0) { restart(pcs[k], 'saved'); burst(...pos(p), ['#3ee8ff', '#fff'], 18); toast('Stein verteidigt!'); arp([659, 784, 988], 'sine'); }
  }

  // Mühle
  const millNew = S.remove && !prev?.remove;
  $('banner').firstElementChild.textContent = S.duel ? 'DUELL!' : 'MÜHLE!';
  if (!S.remove) $('millfx').innerHTML = '';
  if (millNew) setTimeout(() => {
    if (!S?.remove) return;
    const [a, c] = [pos(S.mill[0]), pos(S.mill[2])];
    $('millfx').innerHTML = `<line class="millline" x1="${a[0]}" y1="${a[1]}" x2="${c[0]}" y2="${c[1]}"/>`;
    S.mill.forEach(p => { const k = S.pieces.findIndex(q => q.p === p); restart(pcs[k], 'inmill'); burst(...pos(p), ['#ff4d8d', '#ffcf5c'], 8); });
    restart(stage, 'shake'); $('banner').firstElementChild.textContent = 'MÜHLE!'; $('banner').classList.remove('hidden');
    clearTimeout(render.bt); render.bt = setTimeout(() => $('banner').classList.add('hidden'), 1150);
    arp([523, 659, 784, 1047]); render();
  }, prev ? 620 : 0);

  // Hinweise für den Spieler am Zug
  pts.forEach(d => d.classList.remove('target'));
  const t = S.turn, can = myTurn() && online() && !(millNew && prev) && !S.duel;
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
  else if (S.duel) txt = 'Duell um den Stein!';
  else if (!myTurn()) txt = S.remove ? 'Gegner hat eine Mühle – wähle gleich deine Waffe!' : 'Gegner ist am Zug…';
  else if (S.remove) txt = 'Mühle! Wähle den Stein, um den du kämpfst';
  else if (phase(S, t) === 'place') txt = `${who === 'Du' ? 'Setze' : who + ': setze'} einen Stein (${9 - S.placed[t]} übrig)`;
  else if (phase(S, t) === 'fly') txt = `${who === 'Du' ? 'Du darfst' : who + ' darf'} springen!`;
  else txt = sel !== null ? 'Wohin ziehen?' : `${who === 'Du' ? 'Ziehe' : who + ': ziehe'} einen Stein`;
  st.textContent = txt; st.classList.toggle('me', myTurn() && online());
  $('nameBot').textContent = mode === 'local' ? 'Weiß' : 'Du'; $('nameTop').textContent = mode === 'local' ? 'Schwarz' : 'Gegner';
  $('nameBot').classList.toggle('on', !S.winner && t === bottom); $('nameTop').classList.toggle('on', !S.winner && t !== bottom);
  $('roomtag').textContent = mode === 'local' ? 'Lokal' : `Raum ${room} · ${colorName(me)}`;

  if (S.winner && !prev?.winner) setTimeout(() => {
    if (!S?.winner) return;
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
  if (S.remove) a = { t: 'duel', p };
  else if (phase(S, t) === 'place') a = { t: 'place', p };
  else if (b[p] === t) { sel = sel === p ? null : p; tone(700, 0.06, 'sine', 0.08); return render(); }
  else if (sel !== null) a = { t: 'move', from: sel, to: p };
  else return;
  if (!apply(S, a.t === 'duel' ? { t: 'remove', p } : a, t)) { tone(120, 0.15, 'square', 0.05); if (a.t === 'move') { sel = null; render(); } return; }
  sel = null;
  act(a, t);
}
function act(a, pl) {
  if (mode === 'guest') return conn?.open && conn.send(['act', a]);
  doAct(a, pl);
}
function doAct(a, pl) {
  if (a?.t === 'reset') { if (!S.winner) return; S = init(3 - S.start); }
  else if (a?.t === 'duel') { if (S.duel || !apply(S, { t: 'remove', p: a.p }, pl)) return; S = { ...S, duel: { p: a.p, att: pl, id: ++duelSeq } }; }
  else if (a?.t === 'remove' || S.duel) return; // geschlagen wird nur über ein Duell
  else { const n = apply(S, a, pl); if (!n) return; S = n; }
  sel = null; render(); sendState();
}
function resolveDuel(win) { // nur Gastgeber
  if (!S?.duel) return;
  const { p, att } = S.duel, base = { ...S, duel: null };
  const n = win === 'att' ? apply(base, { t: 'remove', p }, att) : spare(base);
  S = n || base; S.duel = null; stopDuel(); render(); sendState();
}
function stopDuel() { const d = duel; duel = null; d?.stop(); }
const sendState = () => mode === 'host' && conn?.open && conn.send(['state', S]);

// ---------- Bildschirme ----------
function show(id) { ['menu', 'wait', 'game'].forEach(s => $(s).classList.toggle('hidden', s !== id)); }
function startGame() { show('game'); prev = null; sel = null; render(); }
function drop() { // alle Verbindungen der alten Sitzung schließen
  gen++; clearInterval(ticker); const c = conn; conn = null; c?.close(); peer?.destroy(); peer = null;
  clients.forEach(cl => cl.end(true)); clients = [];
}
function leave(msg) {
  drop(); stopDuel(); duelId = 0; S = null; mode = null; retries = 0;
  $('over').classList.add('hidden'); history.replaceState(null, '', location.pathname);
  show('menu'); $('err').textContent = msg || '';
}

// ---------- Netzwerk ----------
// Zwei Wege, beide laufen beim Gastgeber gleichzeitig:
// 1. WebRTC direkt (PeerJS), 2. Relay über öffentliche MQTT-Broker per WebSocket – für Browser ohne WebRTC.
// shortcut: öffentliche Gratis-Broker, können ausfallen oder mitlesen (nur Spielzüge); dann eigenen Broker eintragen
const MQTT = new URLSearchParams(location.search).get('mqtt'); // ?mqtt=ws://host:port = eigener Broker (lokale Tests)
const BROKERS = MQTT ? [MQTT] : ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const loadMqtt = () => import('https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.esm.js').then(m => m.default);
const hasRTC = typeof RTCPeerConnection !== 'undefined';
const TOPIC = (code) => 'muehle-fps-v1/' + code;
let clients = [];
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (v) => ALPHA[v % ALPHA.length]).join('');
const roomUrl = (code) => '?room=' + code + (PEER ? '&peer=' + PEER : '') + (MQTT ? '&mqtt=' + encodeURIComponent(MQTT) : '');

// Relay-Verbindung mit derselben Schnittstelle wie eine PeerJS-Verbindung
function relayConn(cl, topic, tok, ownTok) {
  const h = {};
  return { relay: cl, open: true, metadata: { tok }, on: (ev, f) => { h[ev] = f; }, recv: (m) => h.data?.(m),
    send(m) { if (this.open && cl.connected) cl.publish(topic, JSON.stringify({ tok: ownTok, m })); }, close() { this.open = false; } };
}
function connectBrokers(mqtt, g, onConnect, onMsg) {
  for (const url of BROKERS) {
    const cl = mqtt.connect(url, { reconnectPeriod: 3000, connectTimeout: 8000, clean: true });
    clients.push(cl);
    cl.on('connect', () => g === gen && onConnect(cl));
    cl.on('message', (_, buf) => { if (g !== gen) return; let d; try { d = JSON.parse(buf); } catch { return; } if (d && typeof d.tok === 'string') onMsg(cl, d); });
    cl.on('error', (e) => console.warn('Relay', url, e?.message));
  }
}

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
  if (m[0] === 'd') return duel?.recv(m[1]);
  if (mode === 'host' && m[0] === 'act' && m[1] && typeof m[1] === 'object') doAct(m[1], 2);
  if (mode === 'host' && m[0] === 'hello') sendState();
  if (mode === 'guest' && m[0] === 'state' && m[1]?.pieces) { const first = !S; S = m[1]; retries = 0; if (first || $('game').classList.contains('hidden')) startGame(); else { sel = null; render(); } }
  if (mode === 'guest' && m[0] === 'full') leave('Raum ist schon voll');
}

// Gastgeber: neuen Mitspieler annehmen (oder ablehnen, wenn schon jemand da ist)
function accept(c, g) {
  if (g !== gen) { c.close(); return false; }
  const tok = c.metadata?.tok;
  if (online() && tok !== guestTok) { c.send(['full']); setTimeout(() => c.close(), 500); return false; }
  if (S?.duel) S.duel = { ...S.duel, id: ++duelSeq }; // Wiederkehr mitten im Duell: Duell neu starten
  guestTok = tok; const old = conn; conn = null; if (old !== c) old?.close(); attach(c, g);
  if (!S) { S = init(1); startGame(); } else { toast('Gegner ist da!'); render(); }
  sendState(); return true;
}

async function host() {
  drop(); const g = gen; mode = 'host'; me = 1; guestTok = null; room = newCode();
  show('wait'); $('mycode').textContent = '·····'; $('waittxt').textContent = 'Erstelle Raum';
  let ready = false;
  const up = () => {
    if (g !== gen || ready) return; ready = true;
    $('mycode').textContent = room; $('waittxt').textContent = 'Warte auf Mitspieler';
    history.replaceState(null, '', roomUrl(room));
  };
  setTimeout(() => g === gen && !ready && leave('Keine Verbindung zum Server – Internet prüfen'), 15000);
  startTicker(g);
  loadMqtt().then((mqtt) => {
    if (g !== gen) return;
    connectBrokers(mqtt, g, (cl) => { cl.subscribe(TOPIC(room) + '/h', (err) => !err && up()); }, (cl, d) => {
      if (conn?.relay === cl && conn.metadata.tok === d.tok) return conn.recv(d.m);
      const c = relayConn(cl, TOPIC(room) + '/g/' + d.tok, d.tok, 'host');
      if (accept(c, g)) c.recv(d.m);
    });
  }, () => console.warn('MQTT nicht ladbar'));
  if (!hasRTC) return;
  let Peer; try { ({ Peer } = await loadPeer()); } catch { return; }
  if (g !== gen) return;
  const pr = peer = new Peer(PFX + room.toLowerCase(), OPTS);
  pr.on('open', up);
  pr.on('error', (e) => {
    if (g !== gen) return;
    if (e.type === 'unavailable-id' && !ready) return host(); // Code schon vergeben: neuen würfeln
    console.warn('P2P', e.type); // danach verbindet der Ticker neu
  });
  pr.on('connection', (c) => c.on('open', () => accept(c, g)));
}

async function join(code, retry = false) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) return void ($('err').textContent = 'Der Code hat 5 Zeichen');
  drop(); const g = gen; mode = 'guest'; me = 2; room = code;
  if (!retry) { show('wait'); $('mycode').textContent = code; $('waittxt').textContent = 'Verbinde'; }
  let to, failed = false, broker = false;
  const fail = (msg) => {
    if (g !== gen || failed) return; failed = true; clearTimeout(to);
    if (S && ++retries <= 10) return setTimeout(() => g === gen && join(code, true), 3000);
    leave(msg);
  };
  const done = (c) => { if (g !== gen) return; clearTimeout(to); attach(c, g); startTicker(g); history.replaceState(null, '', roomUrl(code)); c.send(['hello']); };

  const viaRelay = async () => {
    let mqtt; try { mqtt = await loadMqtt(); } catch { return fail('Keine Verbindung möglich'); }
    if (g !== gen) return;
    peer?.destroy(); peer = null;
    to = setTimeout(() => fail(broker ? 'Raum nicht gefunden' : 'Keine Verbindung zum Server – Internet prüfen'), 12000);
    connectBrokers(mqtt, g, (cl) => {
      if (broker) return; // nur über den ersten erreichbaren Broker reden, der Gastgeber hört auf allen
      broker = true; clients.filter(x => x !== cl).forEach(x => x.end(true)); clients = [cl];
      cl.subscribe(TOPIC(code) + '/g/' + myTok, (err) => !err && cl.publish(TOPIC(code) + '/h', JSON.stringify({ tok: myTok, m: ['hello'] })));
    }, (cl, d) => {
      if (!conn) done(relayConn(cl, TOPIC(code) + '/h', 'host', myTok));
      if (conn?.relay === cl) conn.recv(d.m);
    });
  };
  if (!hasRTC) return viaRelay();

  let Peer; try { ({ Peer } = await loadPeer()); } catch { return viaRelay(); }
  if (g !== gen) return;
  const pr = peer = new Peer(OPTS);
  let switched = false;
  const toRelay = () => { if (g !== gen || switched || conn) return; switched = true; clearTimeout(to); viaRelay(); };
  to = setTimeout(toRelay, 10000);
  pr.on('open', () => {
    if (g !== gen) return;
    const c = pr.connect(PFX + code.toLowerCase(), { reliable: true, metadata: { tok: myTok } });
    c.on('open', () => !switched && done(c));
  });
  pr.on('error', toRelay); // auch „Raum nicht gefunden“: Gastgeber hat evtl. nur das Relay
}

// ---------- Knöpfe ----------
$('create').onclick = () => { tone(440, 0.08); host(); };
$('join').onclick = () => { tone(440, 0.08); join($('codein').value); };
$('codein').onkeydown = (e) => e.key === 'Enter' && join($('codein').value);
$('local').onclick = async () => {
  leave(); mode = 'training'; const g = gen;
  let D; try { D = await loadDuel(); } catch { return leave('3D-Modul konnte nicht geladen werden'); }
  if (g !== gen) return;
  const role = trainRole; trainRole = role === 'att' ? 'def' : 'att';
  duel = D.startDuel({ role, color: role === 'att' ? 1 : 2, host: true, training: true, auto: AUTO, onEnd: () => g === gen && leave() });
};
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
