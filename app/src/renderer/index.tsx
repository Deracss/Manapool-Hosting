import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { Menu } from './screens/Menu';
import { NewGame, rematchSetup, type GameSetup } from './screens/NewGame';
import { DeckBuilder } from './screens/DeckBuilder';
import { HowToPlay } from './screens/HowToPlay';
import { Game } from './screens/Game';
import { Online } from './screens/Online';
import { InspectOverlay } from './inspect';

type Screen = { name: 'menu' } | { name: 'setup'; deckId?: string } | { name: 'builder'; deckId?: string } | { name: 'rules' } | { name: 'online' } | { name: 'game'; setup: GameSetup; key: number };

function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const home = () => setScreen({ name: 'menu' });
  switch (screen.name) {
    case 'menu':
      return (
        <Menu
          onPlay={() => setScreen({ name: 'setup' })}
          onOnline={() => setScreen({ name: 'online' })}
          onBuilder={() => setScreen({ name: 'builder' })}
          onRules={() => setScreen({ name: 'rules' })}
          onQuit={() => window.close()}
        />
      );
    case 'setup':
      return (
        <NewGame
          initialDeckId={screen.deckId}
          onBack={home}
          onBuilder={() => setScreen({ name: 'builder' })}
          onStart={(setup) => setScreen({ name: 'game', setup, key: Date.now() })}
        />
      );
    case 'builder':
      return <DeckBuilder initialDeckId={screen.deckId} onBack={home} onPlay={(deckId) => setScreen({ name: 'setup', deckId })} />;
    case 'rules':
      return <HowToPlay onBack={home} />;
    case 'online':
      return <Online onBack={home} />;
    case 'game':
      return (
        <Game
          key={screen.key}
          setup={screen.setup}
          onExit={home}
          onRematch={(mode, first) => setScreen({ name: 'game', setup: rematchSetup(screen.setup, mode, first), key: Date.now() })}
        />
      );
  }
}

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <InspectOverlay />
  </>,
);
