// ManaPool online game server: rooms with a 4-letter code, up to 4 people, empty seats played by bots.
// The server runs the real rules engine; each player is sent only what they may see (viewFor).
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { apply, botAction, createGame, getDef, PRECON_DEFS, preconCards, validateDeck, viewFor, whoMustAct } from '../../engine/src/index.ts';
import type { Action, GameState, PlayerId } from '../../engine/src/index.ts';
import { PROTOCOL } from './protocol.ts';
import type { ClientMsg, Loadout, SeatInfo, ServerMsg } from './protocol.ts';

const PORT = Number(process.env.PORT ?? 10000);
const SEATS = 4;
const BOT_NAMES = ['Ben', 'Cat', 'Dev', 'Eli'];
const GRACE_MS = 45_000; // a player who drops gets this long to come back before a bot plays for them
const EMPTY_ROOM_MS = 10 * 60_000;

interface Seat {
  kind: 'human' | 'bot' | 'open';
  name: string;
  deck: string[];
  deckName: string;
  field: string | null;
  token: string;
  ws: WebSocket | null;
  leftAt: number | null;
}

interface Room {
  code: string;
  seats: Seat[];
  host: number;
  game: GameState | null;
  gameNo: number;
  timer: ReturnType<typeof setTimeout> | null;
  emptySince: number | null;
}

const rooms = new Map<string, Room>();
const where = new Map<WebSocket, { room: Room; seat: number }>();

const openSeat = (): Seat => ({ kind: 'open', name: '', deck: [], deckName: '', field: null, token: '', ws: null, leftAt: null });
const send = (ws: WebSocket | null, m: ServerMsg) => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
};

function newCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
  for (;;) {
    const c = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    if (!rooms.has(c)) return c;
  }
}

function cleanName(n: unknown): string {
  const s = String(n ?? '').replace(/[^\p{L}\p{N} _'-]/gu, '').trim().slice(0, 16);
  return s || 'Player';
}

function checkLoadout(m: Loadout): string | null {
  if (!Array.isArray(m.deck)) return 'No deck sent.';
  const problems = validateDeck(m.deck);
  if (problems.length) return `Deck not legal: ${problems[0]}`;
  try {
    if (getDef(m.field).type !== 'Field') return 'Choose a Field.';
  } catch {
    return 'Choose a Field.';
  }
  return null;
}

function seatsInfo(r: Room): SeatInfo[] {
  return r.seats.map((s) => ({ name: s.name, kind: s.kind, deckName: s.deckName || undefined, connected: s.kind === 'human' ? !!s.ws : undefined }));
}

function sendRoom(r: Room) {
  r.seats.forEach((s, i) => send(s.ws, { t: 'room', code: r.code, seat: i, token: s.token, host: r.host === i, hostSeat: r.host, seats: seatsInfo(r), playing: !!r.game && r.game.phase !== 'over' }));
}

function sendState(r: Room) {
  if (!r.game) return;
  r.seats.forEach((s, i) => send(s.ws, { t: 'state', state: viewFor(r.game!, i), game: r.gameNo }));
}

/** Seats a bot plays: real bots, and players who dropped and didn't come back in time. */
function botPlays(r: Room, seat: number): boolean {
  const s = r.seats[seat];
  return s.kind === 'bot' || (s.kind === 'human' && !s.ws && s.leftAt !== null && Date.now() - s.leftAt > GRACE_MS);
}

function drive(r: Room) {
  if (r.timer) clearTimeout(r.timer);
  r.timer = null;
  const g = r.game;
  if (!g || g.phase === 'over') return;
  const who = whoMustAct(g);
  if (who === null) return;
  if (!botPlays(r, who)) {
    // A dropped player still inside their grace time: check again when it runs out.
    const s = r.seats[who];
    if (s.kind === 'human' && !s.ws && s.leftAt !== null) r.timer = setTimeout(() => drive(r), GRACE_MS - (Date.now() - s.leftAt) + 50);
    return;
  }
  let action: Action;
  try {
    action = botAction(g);
  } catch {
    action = { type: 'pass', player: who };
  }
  r.timer = setTimeout(
    () => {
      r.timer = null;
      if (r.game !== g) return;
      try {
        r.game = apply(g, action);
      } catch {
        try {
          r.game = apply(g, { type: 'pass', player: who });
        } catch {
          return;
        }
      }
      sendState(r);
      if (r.game.phase === 'over') sendRoom(r);
      drive(r);
    },
    action.type === 'pass' ? 120 : 900,
  );
}

function startGame(r: Room) {
  // Players who left don't keep their seat for the next game.
  r.seats = r.seats.map((s) => (s.kind === 'human' && !s.ws ? openSeat() : s));
  const used = new Set(r.seats.filter((s) => s.kind === 'human').map((s) => s.deckName));
  const pool = PRECON_DEFS.filter((p) => !used.has(p.name));
  const names = new Set(r.seats.filter((s) => s.kind === 'human').map((s) => s.name));
  r.seats.forEach((s, i) => {
    if (s.kind === 'human') return;
    const p = (pool.length ? pool : PRECON_DEFS)[Math.floor(Math.random() * (pool.length || PRECON_DEFS.length))];
    const k = pool.indexOf(p);
    if (k >= 0) pool.splice(k, 1);
    const name = BOT_NAMES.find((n) => !names.has(n)) ?? `Bot ${i + 1}`;
    names.add(name);
    r.seats[i] = { ...openSeat(), kind: 'bot', name, deck: preconCards(p), deckName: p.name, field: p.field };
  });
  r.gameNo++;
  r.game = createGame({
    seed: Math.floor(Math.random() * 1e9),
    startingPlayer: Math.floor(Math.random() * SEATS) as PlayerId,
    players: r.seats.map((s) => ({ name: s.name, deck: s.deck, field: s.field })),
  });
  sendRoom(r);
  sendState(r);
  drive(r);
}

function uniqueName(r: Room, name: string): string {
  const taken = new Set(r.seats.filter((s) => s.kind !== 'open').map((s) => s.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) if (!taken.has(`${name} ${n}`.toLowerCase())) return `${name} ${n}`;
}

function seatHuman(r: Room, i: number, m: Loadout, ws: WebSocket) {
  r.seats[i] = { kind: 'human', name: uniqueName(r, cleanName(m.name)), deck: m.deck, deckName: String(m.deckName ?? '').slice(0, 40), field: m.field, token: randomBytes(12).toString('hex'), ws, leftAt: null };
  where.set(ws, { room: r, seat: i });
  r.emptySince = null;
}

function leave(ws: WebSocket, closing: boolean) {
  const at = where.get(ws);
  if (!at) return;
  where.delete(ws);
  const { room: r, seat } = at;
  const s = r.seats[seat];
  if (s.ws !== ws) return;
  if (r.game && r.game.phase !== 'over') {
    // Mid-game: keep the seat for a while so they can come back; a bot takes over after the grace time.
    s.ws = null;
    s.leftAt = Date.now();
    if (!closing) s.leftAt -= GRACE_MS; // left on purpose: the bot takes over now
    drive(r);
  } else {
    r.seats[seat] = openSeat();
  }
  if (r.host === seat) {
    const next = r.seats.findIndex((x) => x.kind === 'human' && x.ws);
    if (next >= 0) r.host = next;
  }
  if (!r.seats.some((x) => x.kind === 'human' && x.ws)) r.emptySince = Date.now();
  sendRoom(r);
}

function handle(ws: WebSocket, m: ClientMsg) {
  const at = where.get(ws);
  switch (m.t) {
    case 'create': {
      if (m.v !== PROTOCOL) return send(ws, { t: 'error', msg: 'Your ManaPool version is different from the server. Please update the game.' });
      const bad = checkLoadout(m);
      if (bad) return send(ws, { t: 'error', msg: bad });
      if (at) leave(ws, false);
      const r: Room = { code: newCode(), seats: Array.from({ length: SEATS }, openSeat), host: 0, game: null, gameNo: 0, timer: null, emptySince: null };
      rooms.set(r.code, r);
      seatHuman(r, 0, m, ws);
      return sendRoom(r);
    }
    case 'join': {
      if (m.v !== PROTOCOL) return send(ws, { t: 'error', msg: 'Your ManaPool version is different from the server. Please update the game.' });
      const r = rooms.get(String(m.code ?? '').toUpperCase().trim());
      if (!r) return send(ws, { t: 'error', msg: 'No room with that code.' });
      if (r.game && r.game.phase !== 'over') return send(ws, { t: 'error', msg: 'That game has already started.' });
      const bad = checkLoadout(m);
      if (bad) return send(ws, { t: 'error', msg: bad });
      const i = r.seats.findIndex((s) => s.kind === 'open' || s.kind === 'bot');
      if (i < 0) return send(ws, { t: 'error', msg: 'That room is full.' });
      if (at) leave(ws, false);
      seatHuman(r, i, m, ws);
      return sendRoom(r);
    }
    case 'rejoin': {
      const r = rooms.get(String(m.code ?? '').toUpperCase());
      const i = r ? r.seats.findIndex((s) => s.kind === 'human' && s.token && s.token === m.token) : -1;
      if (!r || i < 0) return send(ws, { t: 'closed', msg: 'That game is no longer available.' });
      const s = r.seats[i];
      if (s.ws && s.ws !== ws) s.ws.close();
      s.ws = ws;
      s.leftAt = null;
      where.set(ws, { room: r, seat: i });
      r.emptySince = null;
      sendRoom(r);
      sendState(r);
      return drive(r);
    }
    case 'start': {
      if (!at) return;
      if (at.room.host !== at.seat) return send(ws, { t: 'error', msg: 'Only the host can start the game.' });
      if (at.room.game && at.room.game.phase !== 'over') return;
      // Seats that became bots last game open up again for this one.
      return startGame(at.room);
    }
    case 'act': {
      if (!at || !at.room.game) return;
      const a = m.action;
      if (!a || typeof a !== 'object' || (a as { player?: number }).player !== at.seat) return send(ws, { t: 'error', msg: 'You can only act for your own seat.' });
      try {
        at.room.game = apply(at.room.game, a);
      } catch (e) {
        return send(ws, { t: 'error', msg: e instanceof Error ? e.message : 'That move is not allowed.' });
      }
      sendState(at.room);
      if (at.room.game.phase === 'over') sendRoom(at.room);
      return drive(at.room);
    }
    case 'ping': {
      if (!at || !at.room.game) return;
      const kinds: Record<string, string> = { look: 'Look', careful: 'Careful', attack: 'Attack this', help: 'Help?' };
      if (!kinds[m.kind] || typeof m.sel !== 'string' || m.sel.length > 80) return;
      const g = at.room.game;
      g.log.push(`[T${g.turn}] ${at.room.seats[at.seat].name} pings ${String(m.label ?? '').slice(0, 80)}: ${kinds[m.kind]}`);
      at.room.seats.forEach((s, i) => i !== at.seat && send(s.ws, { t: 'ping', from: at.seat, sel: m.sel, kind: m.kind }));
      return sendState(at.room);
    }
    case 'leave':
      return leave(ws, false);
  }
}

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ ok: true, protocol: PROTOCOL, rooms: rooms.size }));
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('ManaPool game server. Open the ManaPool app and choose Play online.\n');
});

const wss = new WebSocketServer({ server: http, maxPayload: 256 * 1024 });
const alive = new WeakMap<WebSocket, boolean>();
wss.on('connection', (ws) => {
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
  ws.on('message', (raw) => {
    let m: ClientMsg;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    try {
      handle(ws, m);
    } catch (e) {
      console.error('handler error', e);
      send(ws, { t: 'error', msg: 'Server error.' });
    }
  });
  ws.on('close', () => leave(ws, true));
});

// Keep connections alive through proxies, and drop dead ones.
setInterval(() => {
  for (const ws of wss.clients) {
    if (alive.get(ws) === false) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
  const now = Date.now();
  for (const [code, r] of rooms) if (r.emptySince !== null && now - r.emptySince > EMPTY_ROOM_MS) {
    if (r.timer) clearTimeout(r.timer);
    rooms.delete(code);
  }
}, 25_000);

http.listen(PORT, () => console.log(`ManaPool server on :${PORT}`));
