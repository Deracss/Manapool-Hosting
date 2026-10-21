import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, PlayerId } from '../engine';
import { allDecks, FIELDS, isLegal } from '../storage';
import { Connection, DEFAULT_SERVER, loadName, loadServer, saveName, saveServer, wakeServer } from '../net';
import type { ServerMsg } from '../net';
import { BackButton } from './common';
import { Game } from './Game';
import type { OnlineLink } from './Game';
import type { PingKind } from './tableParts';

type RoomMsg = Extract<ServerMsg, { t: 'room' }>;
type Status = { k: 'form' } | { k: 'waking'; secs: number; what: 'host' | 'join' } | { k: 'connecting' } | { k: 'room' };

const PLAYABLE_FIELDS = FIELDS.filter((f) => f.scripted);

export function Online({ onBack }: { onBack: () => void }) {
  const decks = useMemo(() => allDecks().filter(isLegal), []);
  const [name, setName] = useState(loadName());
  const [deckId, setDeckId] = useState(decks[0]?.id ?? '');
  const deck = decks.find((d) => d.id === deckId);
  const [field, setField] = useState<string>(deck?.field ?? PLAYABLE_FIELDS[0].id);
  const [code, setCode] = useState('');
  const [server, setServer] = useState(loadServer());
  const [status, setStatus] = useState<Status>({ k: 'form' });
  const [error, setError] = useState('');
  const [room, setRoom] = useState<RoomMsg | null>(null);
  const [game, setGame] = useState<{ no: number; state: GameState } | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const conn = useRef<Connection | null>(null);
  const roomRef = useRef<RoomMsg | null>(null);
  const cancelled = useRef(false);
  const stateSubs = useRef(new Set<(s: GameState) => void>());
  const pingSubs = useRef(new Set<(from: PlayerId, sel: string, kind: PingKind) => void>());

  useEffect(() => () => {
    cancelled.current = true;
    conn.current?.close();
  }, []);

  const onMessage = (m: ServerMsg) => {
    if (m.t === 'room') {
      roomRef.current = m;
      setRoom(m);
      setStatus({ k: 'room' });
      setReconnecting(false);
    } else if (m.t === 'state') {
      setGame((g) => (g && g.no === m.game ? g : { no: m.game, state: m.state }));
      for (const f of stateSubs.current) f(m.state);
    } else if (m.t === 'ping') {
      for (const f of pingSubs.current) f(m.from, m.sel, m.kind as PingKind);
    } else if (m.t === 'error') {
      setError(m.msg);
      if (!roomRef.current) {
        conn.current?.close();
        conn.current = null;
        setStatus({ k: 'form' });
      }
    } else if (m.t === 'closed') {
      setError(m.msg);
      leaveAll();
    }
  };

  const attach = (c: Connection) => {
    conn.current = c;
    c.on(onMessage);
    c.onClose(() => {
      if (c.closedByUs || conn.current !== c) return;
      if (roomRef.current) void reconnect();
      else {
        setStatus({ k: 'form' });
        setError('Lost the connection to the server.');
      }
    });
  };

  // Lost the connection mid-game: come back to the same seat with our token.
  const reconnect = async () => {
    setReconnecting(true);
    for (let i = 0; i < 20 && !cancelled.current; i++) {
      await new Promise((r) => setTimeout(r, i ? 3000 : 800));
      const r = roomRef.current;
      if (!r) return;
      try {
        const c = await Connection.open(server);
        attach(c);
        c.send({ t: 'rejoin', v: 1, code: r.code, token: r.token });
        return;
      } catch {
        /* try again */
      }
    }
    setReconnecting(false);
    setError('Could not reconnect to the game.');
    leaveAll();
  };

  const go = async (what: 'host' | 'join') => {
    if (!deck) return setError('Build a legal deck first (Deck builder).');
    if (what === 'join' && code.trim().length !== 4) return setError('Type the 4-letter room code.');
    setError('');
    saveName(name.trim());
    saveServer(server);
    cancelled.current = false;
    setStatus({ k: 'waking', secs: 0, what });
    try {
      await wakeServer(server, (secs) => setStatus({ k: 'waking', secs, what }), () => cancelled.current);
      setStatus({ k: 'connecting' });
      const c = await Connection.open(server);
      attach(c);
      const loadout = { name: name.trim() || 'Player', deck: deck.cards, deckName: deck.name, field };
      if (what === 'host') c.send({ t: 'create', v: 1, ...loadout });
      else c.send({ t: 'join', v: 1, code: code.trim().toUpperCase(), ...loadout });
    } catch (e) {
      if (cancelled.current) return;
      setStatus({ k: 'form' });
      setError(e instanceof Error ? e.message : 'Could not reach the server.');
    }
  };

  const leaveAll = () => {
    conn.current?.close();
    conn.current = null;
    roomRef.current = null;
    setRoom(null);
    setGame(null);
    setStatus({ k: 'form' });
  };

  const link: OnlineLink | null = useMemo(() => {
    if (!game || !room) return null;
    return {
      seat: room.seat,
      name: room.seats[room.seat]?.name ?? 'You',
      initial: game.state,
      isHost: room.host,
      subscribe: (cb) => {
        stateSubs.current.add(cb);
        return () => stateSubs.current.delete(cb);
      },
      act: (a) => conn.current?.send({ t: 'act', action: a }),
      ping: (sel, kind, label) => conn.current?.send({ t: 'ping', sel, kind, label }),
      onPing: (cb) => {
        pingSubs.current.add(cb);
        return () => pingSubs.current.delete(cb);
      },
      playAgain: () => conn.current?.send({ t: 'start' }),
    };
    // A new game number gives a fresh table; host changes are picked up too.
  }, [game?.no, room?.host, room?.seat]);

  // ---------- the game ----------
  if (link && game) {
    return (
      <>
        <Game
          key={game.no}
          online={link}
          onExit={() => {
            leaveAll();
            onBack();
          }}
          onRematch={() => link.playAgain()}
        />
        {reconnecting && <div className="net-banner">Connection lost · reconnecting…</div>}
      </>
    );
  }

  // ---------- the lobby ----------
  if (status.k === 'room' && room) {
    const humans = room.seats.filter((x) => x.kind === 'human').length;
    return (
      <div className="screen">
        <header className="screen-header">
          <BackButton onClick={() => { leaveAll(); onBack(); }} label="Leave the room" />
          <h1>Online room</h1>
        </header>
        <div className="lobby">
          <section className="lobby-code" aria-label="Room code">
            <span className="label">ROOM CODE</span>
            <b className="code">{room.code}</b>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void navigator.clipboard?.writeText(room.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'Copied' : 'Copy code'}
            </button>
            <p className="muted">Send this code to your friends. They choose Play online → Join and type it.</p>
          </section>
          <section className="lobby-seats" aria-label="Players">
            {room.seats.map((x, i) => (
              <div key={i} className={`seat ${x.kind}${i === room.seat ? ' me' : ''}`}>
                <span className="seat-n">{i + 1}</span>
                <span className="seat-name">
                  {x.kind === 'human' ? x.name : x.kind === 'bot' ? `${x.name} (bot)` : 'Open seat'}
                  {i === room.seat && <span className="tag">YOU</span>}
                  {i === room.hostSeat && <span className="tag gold">HOST</span>}
                </span>
                <span className="muted">{x.kind === 'open' ? 'A bot plays here if nobody joins' : x.deckName}</span>
              </div>
            ))}
          </section>
          {error && <p className="net-error">{error}</p>}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {room.host ? (
              <button type="button" className="btn primary big" onClick={() => conn.current?.send({ t: 'start' })}>
                Start game{humans < 4 ? ` · ${4 - humans} bot${4 - humans === 1 ? '' : 's'}` : ''}
              </button>
            ) : (
              <p className="muted" style={{ margin: 0 }}>Waiting for the host to start the game…</p>
            )}
            <button type="button" className="btn ghost" onClick={leaveAll}>
              Leave room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- choose deck, then host or join ----------
  const busy = status.k === 'waking' || status.k === 'connecting';
  return (
    <div className="screen">
      <header className="screen-header">
        <BackButton onClick={() => { cancelled.current = true; leaveAll(); onBack(); }} />
        <h1>Play online</h1>
        <p className="muted" style={{ marginLeft: 'auto' }}>
          Up to 4 players · empty seats are played by bots
        </p>
      </header>
      <div className="setup-grid online">
        <section className="setup-col" aria-labelledby="on-you">
          <h2 id="on-you">1 · You</h2>
          <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
            Your name
            <input className="field-input" value={name} maxLength={16} placeholder="Player" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
            Deck
            <select
              className="field-input"
              value={deckId}
              onChange={(e) => {
                setDeckId(e.target.value);
                const d = decks.find((x) => x.id === e.target.value);
                if (d?.field) setField(d.field);
              }}
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
            Field
            <select className="field-input" value={field} onChange={(e) => setField(e.target.value)}>
              {PLAYABLE_FIELDS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section className="setup-col" aria-labelledby="on-host">
          <h2 id="on-host">2 · Host a game</h2>
          <p className="muted" style={{ margin: 0, lineHeight: 1.45 }}>Creates a room and gives you a code to share. You start the game when everyone is in.</p>
          <button type="button" className="btn primary big" disabled={busy} onClick={() => go('host')}>
            Host
          </button>
          <h2 id="on-join" style={{ marginTop: 18 }}>
            …or join one
          </h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              className="field-input code-input"
              aria-labelledby="on-join"
              value={code}
              maxLength={4}
              placeholder="CODE"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && go('join')}
            />
            <button type="button" className="btn big" disabled={busy || code.length !== 4} onClick={() => go('join')}>
              Join
            </button>
          </div>
        </section>
        <section className="setup-col" aria-labelledby="on-status">
          <h2 id="on-status">Server</h2>
          {status.k === 'waking' && (
            <div className="net-status">
              <span className="pulse-dot" />
              <span>
                <b>Waking the server…</b>
                <br />
                The free server sleeps when nobody plays; waking it takes up to a minute.{status.secs > 0 ? ` (${status.secs} s)` : ''}
              </span>
            </div>
          )}
          {status.k === 'connecting' && (
            <div className="net-status">
              <span className="pulse-dot" />
              <b>Connecting…</b>
            </div>
          )}
          {status.k === 'form' && <p className="muted" style={{ margin: 0 }}>Press Host or Join: the game wakes the server for you.</p>}
          {error && <p className="net-error">{error}</p>}
          <details className="net-advanced">
            <summary>Server address</summary>
            <input className="field-input" value={server} onChange={(e) => setServer(e.target.value)} spellCheck={false} />
            <button type="button" className="link-btn" onClick={() => setServer(DEFAULT_SERVER)}>
              Use the built-in server
            </button>
          </details>
        </section>
      </div>
    </div>
  );
}
