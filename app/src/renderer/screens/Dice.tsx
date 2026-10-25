// The D20 for who goes first. Each player's die appears on their seat; you pick yours up, drag and let go to
// throw it. Bots and other people throw their own. When everyone has thrown, the dice gather on the results
// screen: a tie for first is rolled again there (drag your die again), until one player goes first.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import type { GameState, PlayerId } from '../engine';
import { playSound } from '../sound';

type Die = { x: number; y: number; vx: number; vy: number; rot: number; phase: 'idle' | 'held' | 'flying' | 'landed'; face: number | null; since: number; value: number | null };
const SIZE = 84;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** The 20-sided die: a hexagon outline with the inner faces, and the number on top. */
export function D20({ value, size = SIZE, state = 'plain', rot = 0 }: { value: number | string | null; size?: number; state?: 'plain' | 'win' | 'tie' | 'faded' | 'mine'; rot?: number }) {
  const col = state === 'tie' ? '#e2705f' : state === 'mine' ? '#7fd6e8' : '#e3b95a';
  return (
    <div className={`d20 d20-${state}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ transform: `rotate(${rot}deg)` }}>
        <polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill="#1d2230" stroke={col} strokeWidth="3" />
        <polygon points="50,22 78,66 22,66" fill="#262c3d" stroke={col} strokeWidth="2" />
        <path d="M50 3 L50 22 M93 27 L78 66 M93 73 L78 66 M50 97 L78 66 M50 97 L22 66 M7 73 L22 66 M7 27 L22 66 M7 27 L50 22 M93 27 L50 22" stroke={col} strokeWidth="1.5" opacity="0.6" fill="none" />
      </svg>
      <span style={{ fontSize: Math.round(size * 0.25), top: Math.round(size * 0.37) }}>{value ?? '?'}</span>
    </div>
  );
}

export function DiceRoll({ s, me, roll, onDone }: { s: GameState; me: PlayerId; roll: () => void; onDone: () => void }) {
  const r = s.roll!;
  const ids = s.players.map((p) => p.id);
  // Seats: dice on each player's place at the table, for the first round. Board: the results screen.
  const [stage, setStage] = useState<'seats' | 'board'>(r.round > 1 || r.done ? 'board' : 'seats');
  const dice = useRef<Record<number, Die>>({});
  const [, setFrame] = useState(0);
  const held = useRef<{ pid: PlayerId; dx: number; dy: number; samples: { t: number; x: number; y: number }[] } | null>(null);
  const sent = useRef(false);

  // Where each seat is on screen.
  const seatAt = (pid: PlayerId) => {
    const el = document.querySelector(pid === me ? '[data-zone="field"]' : `[data-strip="${pid}"]`);
    const b = el?.getBoundingClientRect();
    if (!b) return { x: window.innerWidth / 2 - SIZE / 2, y: window.innerHeight / 2 - SIZE / 2 };
    return { x: b.left + b.width / 2 - SIZE / 2, y: b.top + b.height / 2 - SIZE / 2 };
  };
  // Dice appear once the table is on screen, each on its player's seat.
  const [placed, setPlaced] = useState(false);
  useLayoutEffect(() => {
    if (stage !== 'seats') return;
    for (const pid of ids) {
      if (!dice.current[pid]) {
        const p = seatAt(pid);
        dice.current[pid] = { ...p, vx: 0, vy: 0, rot: 0, phase: 'idle', face: null, since: performance.now(), value: null };
      }
    }
    setPlaced(true);
  }, [stage]);
  const firstRound = r.history.filter((h) => h.round === 1);

  // Values that arrived: your own throw is already flying; others' dice are thrown for them.
  useEffect(() => {
    if (stage !== 'seats' || !placed) return;
    for (const h of firstRound) {
      const d = dice.current[h.player];
      if (!d || d.value !== null) continue;
      d.value = h.value;
      if (d.phase === 'idle') {
        const a = rnd(0, Math.PI * 2);
        const v = rnd(900, 1400);
        Object.assign(d, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, phase: 'flying', since: performance.now() });
        playSound('diceRoll');
      }
    }
  }, [s, stage, placed]);

  // The throw: speed, friction, bounces off the edges of the window, then it settles on its number.
  useEffect(() => {
    if (stage !== 'seats') return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Small steps, so a slow or busy frame doesn't turn into slow motion.
      const total = Math.min(1, (now - last) / 1000);
      last = now;
      let moving = false;
      for (let left = total; left > 0; left -= 0.016) {
        const dt = Math.min(0.016, left);
        if (step(dt, now)) moving = true;
      }
      setFrame((f) => f + 1);
      if (moving || held.current) raf = requestAnimationFrame(tick);
    };
    const step = (dt: number, now: number) => {
      let moving = false;
      for (const pid of ids) {
        const d = dice.current[pid];
        if (!d || d.phase !== 'flying') continue;
        moving = true;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const k = Math.exp(-2.4 * dt);
        d.vx *= k;
        d.vy *= k;
        const W = window.innerWidth - SIZE - 8;
        const H = window.innerHeight - SIZE - 8;
        if (d.x < 8) { d.x = 8; d.vx = Math.abs(d.vx) * 0.7; }
        if (d.x > W) { d.x = W; d.vx = -Math.abs(d.vx) * 0.7; }
        if (d.y < 60) { d.y = 60; d.vy = Math.abs(d.vy) * 0.7; }
        if (d.y > H) { d.y = H; d.vy = -Math.abs(d.vy) * 0.7; }
        const speed = Math.hypot(d.vx, d.vy);
        d.rot += speed * dt * 0.9;
        if (Math.random() < dt * 14) d.face = 1 + Math.floor(Math.random() * 20);
        if (speed < 70 && now - d.since > 900 && d.value !== null) {
          d.phase = 'landed';
          d.face = d.value;
          d.rot = Math.round(d.rot / 60) * 60;
          d.since = now;
          playSound('diceLand');
        }
      }
      return moving;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  // Everyone has thrown and every die is at rest: gather on the results screen.
  const allLanded = stage === 'seats' && r.contenders.length > 0 && firstRound.length >= ids.filter((p) => !s.players[p].eliminated).length && ids.every((p) => s.players[p].eliminated || dice.current[p]?.phase === 'landed');
  useEffect(() => {
    if (!allLanded) return;
    const t = setTimeout(() => setStage('board'), 1100);
    return () => clearTimeout(t);
  }, [allLanded]);

  const myTurnToThrow = !r.done && r.contenders.includes(me) && r.results[me] === null && !s.players[me].eliminated;

  // Picking up and throwing your die.
  const down = (e: RPointerEvent) => {
    if (!myTurnToThrow || sent.current) return;
    const d = dice.current[me];
    if (!d) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    held.current = { pid: me, dx: e.clientX - d.x, dy: e.clientY - d.y, samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }] };
    d.phase = 'held';
    playSound('diceShake');
    setFrame((f) => f + 1);
  };
  const move = (e: RPointerEvent) => {
    const h = held.current;
    if (!h) return;
    const d = dice.current[me];
    d.x = e.clientX - h.dx;
    d.y = e.clientY - h.dy;
    d.rot += 6;
    h.samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (h.samples.length > 8) h.samples.shift();
    setFrame((f) => f + 1);
  };
  const up = () => {
    const h = held.current;
    if (!h) return;
    held.current = null;
    const d = dice.current[me];
    const now = performance.now();
    const old = h.samples.find((p) => now - p.t < 120) ?? h.samples[0];
    const lastS = h.samples[h.samples.length - 1];
    const dt = Math.max(0.016, (lastS.t - old.t) / 1000);
    let vx = (lastS.x - old.x) / dt;
    let vy = (lastS.y - old.y) / dt;
    let v = Math.hypot(vx, vy);
    if (v < 350) {
      // A gentle drop still rolls a little.
      const a = rnd(0, Math.PI * 2);
      vx = Math.cos(a) * 600;
      vy = Math.sin(a) * 600;
      v = 600;
    }
    if (v > 2800) {
      vx *= 2800 / v;
      vy *= 2800 / v;
    }
    Object.assign(d, { vx, vy, phase: 'flying', since: now });
    sent.current = true;
    playSound('diceRoll');
    roll();
  };

  if (stage === 'seats') {
    return (
      <div className="dice-layer" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="dice-banner">
          <b>Who goes first?</b>
          <span>{myTurnToThrow && !sent.current ? 'Pick up your die, drag and let go to throw it.' : 'Waiting for everyone to throw…'}</span>
        </div>
        {ids.map((pid) => {
          const d = dice.current[pid];
          if (!d || s.players[pid].eliminated) return null;
          const mine = pid === me;
          const grab = mine && myTurnToThrow && !sent.current;
          return (
            <div key={pid} className={`die-seat${grab ? ' grab' : ''}${d.phase === 'held' ? ' held' : ''}${d.phase === 'landed' ? ' landed' : ''}`} style={{ left: d.x, top: d.y }} onPointerDown={mine ? down : undefined}>
              <D20 value={d.phase === 'idle' || d.phase === 'held' ? '?' : d.face} rot={d.rot} state={mine ? 'mine' : 'plain'} />
              <span className="die-name">{mine ? 'You' : s.players[pid].name}{d.phase === 'idle' && !mine ? ' · throwing…' : ''}</span>
              {grab && d.phase === 'idle' && <span className="die-hint">Drag to throw</span>}
            </div>
          );
        })}
      </div>
    );
  }
  return <DiceBoard s={s} me={me} roll={roll} onDone={onDone} />;
}

/** The results screen: everyone's roll; a tie for first rolls again here. */
function DiceBoard({ s, me, roll, onDone }: { s: GameState; me: PlayerId; roll: () => void; onDone: () => void }) {
  const r = s.roll!;
  const live = s.players.filter((p) => !p.eliminated);
  const lastOf = (pid: PlayerId) => [...r.history].reverse().find((h) => h.player === pid)?.value ?? null;
  // Dice rolled since the board opened spin for a moment before their number shows.
  const seen = useRef<Record<number, number>>(Object.fromEntries(s.players.map((p) => [p.id, r.history.filter((h) => h.player === p.id).length])));
  const [spin, setSpin] = useState<Record<number, number>>({});
  const [faces, setFaces] = useState(0);
  const [drag, setDrag] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const sentRound = useRef(0);
  useEffect(() => {
    for (const p of s.players) {
      const n = r.history.filter((h) => h.player === p.id).length;
      if (n > (seen.current[p.id] ?? 0)) {
        seen.current[p.id] = n;
        setSpin((x) => ({ ...x, [p.id]: Date.now() + 950 }));
        playSound('diceRoll');
        setTimeout(() => playSound('diceLand'), 950);
      }
    }
  }, [s]);
  const spinning = Object.values(spin).some((t) => t > Date.now());
  useEffect(() => {
    if (!spinning) return;
    const t = setInterval(() => setFaces((f) => f + 1), 70);
    return () => clearInterval(t);
  }, [spinning]);
  // A tie: the low notes once per new round.
  useEffect(() => {
    if (r.round > 1 && !r.done) playSound('diceTie');
  }, [r.round]);
  // The result stays a moment, then the opening hands.
  const settled = r.done && !spinning;
  useEffect(() => {
    if (!settled) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [settled]);

  const prevRound = r.history.filter((h) => h.round === r.round - 1);
  const prevTop = prevRound.length ? Math.max(...prevRound.map((h) => h.value)) : 0;
  const names = (pids: PlayerId[]) => pids.map((p) => (p === me ? 'you' : s.players[p].name)).join(' and ');
  const tied = !r.done ? r.contenders : [];
  const winner = r.done ? s.active : null;
  const myReroll = !r.done && r.contenders.includes(me) && r.results[me] === null && sentRound.current !== r.round;
  let title = 'Everyone rolled';
  let sub = '';
  if (settled && winner !== null) {
    title = winner === me ? 'You go first' : `${s.players[winner].name} goes first`;
    const fin = r.history.filter((h) => h.round === r.round);
    sub = r.round > 1 ? `Reroll: ${fin.map((h) => `${h.player === me ? 'you' : s.players[h.player].name} ${h.value}`).join(', ')}.` : `Highest roll: ${lastOf(winner)}.`;
  } else if (r.round > 1 && !r.done) {
    title = 'Tie for first!';
    const who = names(tied);
    sub = `${who.charAt(0).toUpperCase() + who.slice(1)} rolled ${prevTop}. ${tied.length === 2 ? 'Only those two roll' : 'Only they roll'} again.`;
  } else if (spinning) {
    title = 'Rolling…';
  }

  const throwMine = () => {
    sentRound.current = r.round;
    setDrag(null);
    roll();
  };
  return (
    <div className="modal-back dice-board-back">
      <div className="dice-board" role="dialog" aria-labelledby="dice-h" onPointerMove={(e) => drag && setDrag({ ...drag, x: e.clientX - drag.ox, y: e.clientY - drag.oy })} onPointerUp={() => drag && throwMine()}>
        <span className="dice-kicker">WHO GOES FIRST</span>
        <h2 id="dice-h">{title}</h2>
        <p className="muted">{sub || ' '}</p>
        <div className="dice-seats">
          {live.map((p) => {
            const spinningNow = (spin[p.id] ?? 0) > Date.now();
            const inRound = tied.includes(p.id);
            const waiting = inRound && r.results[p.id] === null;
            const value = spinningNow ? 1 + ((faces * 7 + p.id * 3) % 20) : waiting ? '?' : (inRound ? r.results[p.id] : lastOf(p.id));
            const state = settled && winner === p.id ? 'win' : inRound ? 'tie' : r.done && !spinningNow ? 'faded' : r.round > 1 ? 'faded' : 'plain';
            const grab = p.id === me && myReroll;
            return (
              <div key={p.id} className={`dice-seat${state === 'win' || inRound ? ' hl' : ''}`}>
                <div
                  className={`dice-slot${grab ? ' grab' : ''}${spinningNow ? ' spinning' : ''}`}
                  style={grab && drag ? { transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x}deg)` } : undefined}
                  onPointerDown={grab ? (e) => { (e.target as Element).setPointerCapture?.(e.pointerId); playSound('diceShake'); setDrag({ x: 0, y: 0, ox: e.clientX, oy: e.clientY }); } : undefined}
                >
                  <D20 value={value} size={76} state={state} rot={spinningNow ? faces * 37 : 0} />
                </div>
                <b>{p.id === me ? 'You' : p.name}</b>
                <small>{grab ? 'Drag to throw again' : waiting ? 'rolls again' : settled && winner === p.id ? 'first' : !spinningNow && value !== '?' ? String(value) : ' '}</small>
              </div>
            );
          })}
        </div>
        <p className="muted" style={{ fontSize: 12.5 }}>{settled ? 'Turn order goes on from there as usual. Every roll is in the log.' : tied.length ? 'Repeats until one player is highest.' : ' '}</p>
        {settled && (
          <button type="button" className="btn primary" autoFocus onClick={onDone}>
            To the opening hands
          </button>
        )}
      </div>
    </div>
  );
}
