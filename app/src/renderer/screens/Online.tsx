import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, PlayerId } from '../engine';
import { allDecks, FIELDS, isLegal, SAMPLE_DECKS } from '../storage';
import { Connection, DEFAULT_SERVER, PROTOCOL, loadName, loadServer, saveName, saveServer, wakeServer } from '../net';
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
  const emoteSubs = useRef(new Set<(from: PlayerId, id: number) => void>());
  const [inLobby, setInLobby] = useState(false);
  const gameNo = useRef(0);

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
      if (m.game !== gameNo.current) {
        gameNo.current = m.game;
        setInLobby(false);
      }
      setGame((g) => (g && g.no === m.game ? g : { no: m.game, state: m.state }));
      for (const f of stateSubs.current) f(m.state);
    } else if (m.t === 'emote') {
      for (const f of emoteSubs.current) f(m.from, m.id);
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
        c.send({ t: 'rejoin', v: PROTOCOL, code: r.code, token: r.token });
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
      if (what === 'host') c.send({ t: 'create', v: PROTOCOL, ...loadout });
      else c.send({ t: 'join', v: PROTOCOL, code: code.trim().toUpperCase(), ...loadout });
    } catch (e) {
      if (cancelled.current) return;
      setStatus({ k: 'form' });
      setError(e instanceof Error ? e.message : 'Could not reach the server.');
    }
  };

  // In the lobby: change your deck or Field (this un-readies you).
  const changeLoadout = (newDeck: string | null, newField: string | null) => {
    const d = decks.find((x) => x.id === (newDeck ?? deckId));
    if (!d) return;
    const f = newField ?? (newDeck ? (d.field ?? field) : field);
    if (newDeck) setDeckId(newDeck);
    setField(f);
    conn.current?.send({ t: 'loadout', deck: d.cards, deckName: d.name, field: f });
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
      backToLobby: () => setInLobby(true),
      emote: (id) => conn.current?.send({ t: 'emote', id }),
      onEmote: (cb) => {
        emoteSubs.current.add(cb);
        return () => emoteSubs.current.delete(cb);
      },
    };
    // A new game number gives a fresh table; host changes are picked up too.
  }, [game?.no, room?.host, room?.seat]);

  // ---------- the game ----------
  if (link && game && !inLobby) {
    return (
      <>
        <Game
          key={game.no}
          online={link}
          onExit={() => {
            leaveAll();
            onBack();
          }}
          onRematch={() => setInLobby(true)}
        />
        {reconnecting && <div className="net-banner">Connection lost · reconnecting…</div>}
      </>
    );
  }

  // ---------- the lobby ----------
  if (status.k === 'room' && room) {
    const humans = room.seats.filter((x) => x.kind === 'human').length;
    const me = room.seats[room.seat];
    const playing = room.playing;
    const waitingFor = room.seats.filter((x, i) => x.kind === 'human' && x.connected && i !== room.hostSeat && !x.ready).map((x) => x.name);
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
            {room.seats.map((x, i) => {
              const mine = i === room.seat;
              return (
                <div key={i} className={`seat ${x.kind}${mine ? ' me' : ''}`}>
                  <span className="seat-n">{i + 1}</span>
                  <span className="seat-name">
                    {x.kind === 'human' ? x.name : x.kind === 'bot' ? `${x.name} (bot)` : 'Open seat'}
                    {mine && <span className="tag">YOU</span>}
                    {i === room.hostSeat && <span className="tag gold">HOST</span>}
                  </span>
                  <span className="seat-deck">
                    {x.kind === 'human' && mine && !playing ? (
                      <>
                        <select className="field-input small" aria-label="Your deck" value={deckId} onChange={(e) => changeLoadout(e.target.value, null)}>
                          {decks.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        <select className="field-input small" aria-label="Your Field" value={field} onChange={(e) => changeLoadout(null, e.target.value)}>
                          {PLAYABLE_FIELDS.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : x.kind === 'human' ? (
                      <span className="muted">
                        {x.deckName}
                        {x.field ? ` · ${FIELDS.find((f) => f.id === x.field)?.name ?? ''}` : ''}
                      </span>
                    ) : room.host && !playing ? (
                      <select className="field-input small" aria-label={`Deck for seat ${i + 1}`} value={x.botDeck ?? ''} onChange={(e) => conn.current?.send({ t: 'botDeck', seat: i, deck: e.target.value || null })}>
                        <option value="">Bot · random precon</option>
                        {SAMPLE_DECKS.map((d) => (
                          <option key={d.id} value={d.id}>
                            Bot · {d.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="muted">Bot · {x.botDeck ? SAMPLE_DECKS.find((d) => d.id === x.botDeck)?.name : 'random precon'}</span>
                    )}
                  </span>
                  <span className={`seat-ready${x.kind === 'human' && (x.ready || i === room.hostSeat) ? ' on' : ''}`}>
                    {x.kind !== 'human' ? 'Bot' : i === room.hostSeat ? 'Host' : x.ready ? '✓ Ready' : 'Not ready'}
                  </span>
                </div>
              );
            })}
          </section>
          {error && <p className="net-error">{error}</p>}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {playing ? (
              <p className="muted" style={{ margin: 0 }}>A game is still running in this room. You'll join the table when the next one starts.</p>
            ) : room.host ? (
              <button type="button" className="btn primary big" disabled={waitingFor.length > 0} onClick={() => conn.current?.send({ t: 'start' })}>
                {waitingFor.length ? `Start (waiting for ${waitingFor.join(', ')})` : `Start game${humans < 4 ? ` · ${4 - humans} bot${4 - humans === 1 ? '' : 's'}` : ''}`}
              </button>
            ) : (
              <button type="button" className={`btn big${me?.ready ? '' : ' primary'}`} onClick={() => conn.current?.send({ t: 'ready', ready: !me?.ready })}>
                {me?.ready ? "Not ready yet" : "I'm ready"}
              </button>
            )}
            {!room.host && !playing && <p className="muted" style={{ margin: 0 }}>{me?.ready ? 'Waiting for the host to start…' : 'Press I\'m ready when your deck is set.'}</p>}
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
