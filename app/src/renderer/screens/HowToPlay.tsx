import { BackButton } from './common';

export function HowToPlay({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen">
      <header className="screen-header">
        <BackButton onClick={onBack} />
        <h1>How to play</h1>
      </header>
      <div className="rules">
        <article>
          <p>Four players, 7 life each. Be the last player standing. You lose at 0 life, or if you must draw from an empty deck.</p>
          <h2>Your turn</h2>
          <ul>
            <li><b>Upkeep:</b> your Mana Orbs refill.</li>
            <li><b>Draw:</b> draw 1 card.</li>
            <li><b>Main:</b> charge mana, play cards, use abilities and attack, in any order.</li>
            <li><b>End:</b> end-of-turn effects happen, then the next player (clockwise) starts.</li>
          </ul>
          <h2>Mana</h2>
          <p>Once per turn you may <b>charge</b> a card from your hand: it becomes a face-down Mana Orb worth 1 mana. Some cards let you charge more, and some do something when charged (like Mana Sage). Spent Orbs refill at your Upkeep. Mana Rocks are tokens that stay until you spend them.</p>
          <p>Paying is automatic: floating mana first, then Orbs, then Corrupted Mana Rocks, then Mana Rocks.</p>
          <h2>Card speeds</h2>
          <ul>
            <li><b>Spell speed:</b> only in your own Main phase, with nothing waiting on the stack.</li>
            <li><b>Incantation speed</b> (lightning bolt on the card): whenever you have priority, including on other players' turns.</li>
          </ul>
          <h2>Combat</h2>
          <ul>
            <li>Attack with one ready creature at a time, at one opponent. New creatures can't attack until your next turn, unless they have HASTE.</li>
            <li>The defender may block with an untapped creature. Blocking taps it.</li>
            <li><b>Boosting:</b> tap your untapped creatures to give the attacker +1 attack each. The defender can do the same for their blocker. New creatures can boost.</li>
            <li>Attack higher than defense: the blocker dies and the defender loses 1 life. Equal: the blocker dies, no life lost. Lower: nothing happens. The attacker never dies in combat.</li>
            <li>Whenever you lose life in combat, you draw a card (not if the attacker has CRITICAL).</li>
          </ul>
          <h2>Playing the app</h2>
          <ul>
            <li>Click a card in your hand to play it or charge it. Click your creature to attack or use its ability.</li>
            <li>Hover any card to read it in the panel on the right. <b>Hold Alt</b> while hovering a card to see it large, with its full text, its current state and an explanation of every keyword on it. This works on your Mana Orbs too, to see which card you charged.</li>
            <li>When a bot plays something you can respond to, you get priority: play an Incantation or press <b>Pass</b>. With auto-pass on (Menu during a game), the game skips your priority when you have nothing you could play.</li>
          </ul>
          <h2>Card status</h2>
          <p>All Goblins and Druids, the Forest field, Fireball, Swords Up!, Shields Up!, No!, Mana Droid, Vendor Street, Anthem #1, Mana Ramp and Cosmic Channeling work fully. Other cards can be played, but their abilities don't work yet: creatures fight with their printed stats, and other cards do nothing.</p>
        </article>
      </div>
    </div>
  );
}
