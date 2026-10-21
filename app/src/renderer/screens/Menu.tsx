import { Card, showDef } from '../components/Card';
import { getDef } from '../engine';
import { cardNumber } from '../storage';

export function Menu({ onPlay, onOnline, onBuilder, onRules, onQuit }: { onPlay: () => void; onOnline: () => void; onBuilder: () => void; onRules: () => void; onQuit: () => void }) {
  const show = (id: string) => showDef(getDef(id), cardNumber(id));
  return (
    <div className="menu">
      <section className="menu-left">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 className="menu-title">MANAPOOL</h1>
          <p className="muted" style={{ fontSize: 20 }}>
            Interactive card game by Gustavo Acevedo
          </p>
        </div>
        <nav aria-label="Main menu">
          <button type="button" className="btn primary" onClick={onPlay} autoFocus>
            Play vs bots
          </button>
          <button type="button" className="btn" onClick={onOnline}>
            Play online
          </button>
          <button type="button" className="btn" onClick={onBuilder}>
            Deck builder
          </button>
          <button type="button" className="btn" onClick={onRules}>
            How to play
          </button>
          <button type="button" className="btn ghost" onClick={onQuit} style={{ color: 'var(--muted)' }}>
            Quit
          </button>
        </nav>
        <p style={{ fontSize: 14, color: 'var(--faint)' }}>Version 0.2.1 · 243 cards · 5 precons · every precon card playable</p>
      </section>
      <section className="menu-art" aria-hidden="true">
        <div className="ring" style={{ width: 560, height: 560 }} />
        <div className="ring" style={{ width: 400, height: 400 }} />
        <div style={{ position: 'absolute', left: 'calc(50% - 290px)', top: 'calc(50% - 150px)', transform: 'rotate(-14deg)' }}>
          <Card show={show('fireball')} scale={0.72} />
        </div>
        <div style={{ position: 'absolute', left: 'calc(50% + 40px)', top: 'calc(50% - 150px)', transform: 'rotate(14deg)' }}>
          <Card show={show('war-cry')} scale={0.72} />
        </div>
        <div style={{ position: 'absolute', left: 'calc(50% - 140px)', top: 'calc(50% - 200px)' }}>
          <Card show={show('goblin-berserker')} scale={0.82} />
        </div>
      </section>
    </div>
  );
}
