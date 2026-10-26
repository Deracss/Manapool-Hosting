// Hold Alt while the mouse is over a card (or one of your Mana Orbs) to see a large copy of the card,
// its full text, its current state and explanations of its keywords.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Card } from './components/Card';
import { termsIn, TYPE_HELP } from './glossary';
import { getHovered, setHovered, subscribeHovered } from './hover';

// ---------- the popup ----------
function Bold({ text }: { text: string }) {
  const parts = text.split(/(\b[A-Z]{2,}[A-Z'-]*(?:\s+[A-Z]{2,}[A-Z'-]*)*\b)/g);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}</>;
}

export function InspectOverlay() {
  const card = useSyncExternalStore(subscribeHovered, getHovered);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      e.preventDefault(); // keep Windows from moving focus to the (hidden) menu bar
      // A card that disappeared from under the mouse doesn't count.
      if (!document.querySelector('.inspectable:hover')) setHovered(null);
      if (!held) setHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        e.preventDefault();
        setHeld(false);
      }
    };
    const blur = () => setHeld(false);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
    };
  }, [held]);

  if (!held || !card) return null;
  const kwText = (card.keywords ?? []).map((k) => k.k).join(', ');
  const terms = termsIn(`${kwText}\n${card.text}\n${card.extra ?? ''}`);
  const typeLine = card.type === 'Creature' ? `Creature — ${card.tribe}` : card.type === 'Token' ? `Token Creature — ${card.tribe}` : card.type === 'Field' ? `Field — ${card.tribe}` : card.type;
  const hasStats = card.atk !== null && card.atk !== undefined;
  const statsChanged = hasStats && card.baseAtk !== undefined && (card.baseAtk !== card.atk || card.baseDef !== card.def);

  return (
    <div className={`inspect${terms.length > 4 || card.text.length > 220 ? ' compact' : ''}`} role="dialog" aria-label={`${card.name} details`} aria-live="polite">
      <div className="inspect-card">
        <Card show={card} scale={Math.min(1.4, (window.innerHeight - 48) / 476)} />
      </div>
      <section className="inspect-info">
        <header>
          <h2>{card.name}</h2>
          <p className="muted">
            {typeLine}
            {card.cost !== null && card.cost !== undefined ? ` · Cost ${card.cost}` : ''}
            {hasStats ? ` · ${card.atk}/${card.def}` : ''}
            {card.incantation ? ' · Incantation speed' : ''}
          </p>
        </header>
        {kwText && (
          <p className="inspect-text" style={{ fontWeight: 800 }}>
            {kwText}
          </p>
        )}
        {card.text.trim() ? (
          <div className="inspect-text">
            {card.text.split('\n').map((l, i) => (
              <p key={i}>
                <Bold text={l} />
              </p>
            ))}
          </div>
        ) : (
          !kwText && <p className="muted">{hasStats ? 'No abilities: just its attack and defense.' : 'No rules text.'}</p>
        )}
        {(card.notes?.length || statsChanged || card.extra) && (
          <div className="inspect-block">
            <h3>Right now</h3>
            <ul>
              {statsChanged && (
                <li>
                  Printed {card.baseAtk}/{card.baseDef}, currently {card.atk}/{card.def}.
                </li>
              )}
              {card.extra && <li>{card.extra}.</li>}
              {card.notes?.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
        )}
        {card.works === false && (
          <p className="inspect-warn">This card's effect isn't working in the app yet. It can still be played{hasStats ? ', and it fights with its printed attack and defense' : ', but it does nothing'}.</p>
        )}
        {terms.length > 0 && (
          <div className="inspect-block">
            <h3>Keywords</h3>
            <dl>
              {terms.map((t) => (
                <div key={t.term}>
                  <dt>{t.term}</dt>
                  <dd>{t.meaning}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {TYPE_HELP[card.type] && (
          <div className="inspect-block">
            <h3>{card.type === 'Mana Token' ? 'Mana Token' : card.type}</h3>
            <p>{TYPE_HELP[card.type]}</p>
          </div>
        )}
        <p className="inspect-hint">Release Alt to close</p>
      </section>
    </div>
  );
}
