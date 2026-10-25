// The owner's reaction: in answer to an opponent's cast, a short scene shows the card being cast on the left and
// Gustavo on the right saying his line (with the audio). Only the owner can use it: the switch appears after the
// owner code is entered once (the code itself is never stored in the app, only its SHA-256; online, the server
// checks it too).
import { useEffect, useRef } from 'react';
import { Card, showInGame } from '../components/Card';
import type { GameState, Iid, PlayerId } from '../engine';
import { getSoundVolume } from '../sound';

export const OWNER_HASH = 'c934b1c7bfda54cf2aa19ce4ded77e83134620f2c44c9176c1b01229d6ad19a6';
export const REACTION_CAPTION = 'Disgusting!';
const CODE_KEY = 'manapool.owner.v1';
const ARMED_KEY = 'manapool.owner.armed';

export const normCode = (c: string) => c.trim().toUpperCase();
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** The saved owner code (null when this computer isn't the owner's). */
export function ownerCode(): string | null {
  try {
    return localStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
}
export async function unlockOwner(code: string): Promise<boolean> {
  const c = normCode(code);
  if ((await sha256(c)) !== OWNER_HASH) return false;
  try {
    localStorage.setItem(CODE_KEY, c);
  } catch {
    /* private storage: works for this session only */
  }
  return true;
}
export function forgetOwner(): void {
  try {
    localStorage.removeItem(CODE_KEY);
  } catch {
    /* nothing saved */
  }
}
export function loadArmed(): boolean {
  try {
    return localStorage.getItem(ARMED_KEY) === '1';
  } catch {
    return false;
  }
}
export function saveArmed(on: boolean): void {
  try {
    localStorage.setItem(ARMED_KEY, on ? '1' : '0');
  } catch {
    /* not saved */
  }
}

/** Gustavo, drawn: bald, with a darker skin tone, mid-shout. */
export function Portrait({ w, talking }: { w: number; talking: boolean }) {
  const h = Math.round((w * 260) / 200);
  return (
    <svg className="rx-portrait" viewBox="0 0 200 260" width={w} height={h} aria-hidden="true">
      <defs>
        <linearGradient id="rxbg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b3d63" />
          <stop offset="1" stopColor="#141c30" />
        </linearGradient>
        <radialGradient id="rxhead" cx="0.42" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#a8724c" />
          <stop offset="1" stopColor="#7a4f33" />
        </radialGradient>
      </defs>
      <rect width="200" height="260" rx="14" fill="url(#rxbg)" />
      <path d="M18 260 q10 -72 82 -80 q72 8 82 80 z" fill="#3b3f4c" />
      <path d="M76 184 l24 32 l24 -32" fill="#e8e2d2" />
      <path d="M92 190 l8 42 l8 -42 z" fill="#b2382c" />
      <rect x="84" y="158" width="32" height="30" rx="10" fill="#7a4f33" />
      <ellipse cx="47" cy="120" rx="8" ry="13" fill="#8a5b3c" />
      <ellipse cx="153" cy="120" rx="8" ry="13" fill="#8a5b3c" />
      <ellipse cx="100" cy="112" rx="52" ry="58" fill="url(#rxhead)" />
      <ellipse cx="82" cy="72" rx="20" ry="9" fill="#ffffff" opacity="0.16" transform="rotate(-18 82 72)" />
      <path d="M70 104 l20 -6 M110 98 l20 6" stroke="#2a1d14" strokeWidth="6" strokeLinecap="round" />
      <circle cx="82" cy="118" r="5.5" fill="#1d130d" />
      <circle cx="118" cy="118" r="5.5" fill="#1d130d" />
      <path d="M96 124 q4 14 -2 18 h10" stroke="#5a3826" strokeWidth="3" fill="none" strokeLinecap="round" />
      {talking ? <ellipse className="rx-mouth" cx="100" cy="152" rx="15" ry="11" fill="#3a1410" /> : <path d="M86 150 q14 8 28 0" stroke="#3a1410" strokeWidth="4" fill="none" strokeLinecap="round" />}
      <path d="M78 140 q22 -8 44 0" stroke="#5a3826" strokeWidth="3" fill="none" opacity="0.5" />
    </svg>
  );
}

let audioEl: HTMLAudioElement | null = null;
function playLine(): void {
  try {
    const v = getSoundVolume();
    if (!v) return;
    audioEl ??= new Audio('assets/reaction.mp3');
    audioEl.volume = Math.max(0.15, Math.min(1, v * 1.6));
    audioEl.currentTime = 0;
    void audioEl.play();
  } catch {
    /* no audio device */
  }
}

/** The scene itself: about 2.6 s, click-through, on top of everything. */
export function ReactionScene({ s, iid, by, onEnd }: { s: GameState; iid: Iid; by: PlayerId | null; onEnd: () => void }) {
  const card = s.cards[iid];
  const caster = s.stack.find((it) => it.kind === 'card' && it.iid === iid)?.controller ?? card?.owner;
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      playLine();
    }
    const t = setTimeout(onEnd, 2700);
    return () => clearTimeout(t);
  }, []);
  void by;
  return (
    <div className="rx-scene" aria-live="polite" role="status">
      <div className="rx-left">
        <svg className="rx-lines" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {Array.from({ length: 36 }, (_, i) => {
            const a = (i * Math.PI * 2) / 36;
            const w = i % 2 ? 0.035 : 0.018;
            const L = 900;
            return <polygon key={i} points={`300,300 ${300 + Math.cos(a - w) * L},${300 + Math.sin(a - w) * L} ${300 + Math.cos(a + w) * L},${300 + Math.sin(a + w) * L}`} fill="#ff7a5a22" />;
          })}
        </svg>
        <div className="rx-card">
          <span className="rx-kicker">{caster !== undefined && s.players[caster] ? `${s.players[caster].name.toUpperCase()} CASTS` : 'THE CAST'}</span>
          {card && <Card show={showInGame(s, iid)} scale={0.62} />}
        </div>
      </div>
      <div className="rx-seam" />
      <div className="rx-right">
        <div className="rx-bubble">
          <b>“{REACTION_CAPTION}”</b>
          <span className="rx-wave" aria-hidden="true">
            {Array.from({ length: 26 }, (_, i) => (
              <i key={i} style={{ animationDelay: `${(i % 7) * 70}ms`, height: 8 + ((i * 37) % 22) }} />
            ))}
          </span>
        </div>
        <div className="rx-me">
          <Portrait w={250} talking />
          <span className="rx-name">GUSTAVO</span>
        </div>
      </div>
    </div>
  );
}
