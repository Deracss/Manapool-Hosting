# ManaPool Engine

The rules engine for the digital version of **ManaPool**. It knows the turn structure, mana, the stack, combat and card abilities, and it refuses illegal moves. There is no user interface yet: a UI (or a server) calls the engine and draws whatever state it returns.

## Running it

Requires Node.js 20+.

```bash
npm install
npm test            # 54 tests: core rules, every Goblin and Druid card, bot games
npm run typecheck
npm run demo        # a 4-player game between simple bots, printed as a log
npm run demo -- 7   # same, with a different shuffle seed
```

## How it works

The whole game is one plain data object, `GameState`. The engine has two main functions:

```ts
const state = createGame({ players: [{ name: 'Ana', deck: [...60 card ids], field: 'forest' }, ...] });
const next  = apply(state, { type: 'attack', player: 0, attacker: 'c12', target: 1 });
```

`apply` never changes the state it is given; it returns a new one, or throws a `RulesError` explaining why the move is not allowed. Because shuffles use a seeded random number generator stored in the state, a game can be replayed exactly from its seed and list of actions. That is what makes online play, replays and bug reports straightforward later.

`whoMustAct(state)` says whose input the game is waiting for.

### Actions

| Action | When |
|---|---|
| `keep` / `mulligan` | Before the first turn (mulligan once, to 6 cards) |
| `charge` | Your Main phase, once per turn: a card from hand becomes a Mana Orb |
| `play` | A card from hand (with `targets` if it needs them, and optionally `pay`) |
| `activate` | An ability of a card you control (optionally `pay`) |
| `attack` | Your Main phase: one creature, at one opponent (or a creature, with FACEOFF) |
| `block` | When attacked |
| `boost` | Tap creatures to add attack (attacker) or defense (defender) |
| `choose` | When a card asks you to pick something |
| `pass` | Give up priority, or end your Main phase |

### Priority and the stack (works like MTG)

Players get a chance to respond at **incantation speed** in these windows: Upkeep, Draw, after an attack is declared, after blocks, after boosting, when the active player ends their Main phase, and the End Phase. Each window starts with the active player. Whenever someone adds something to the stack, priority goes to the player on their left, then clockwise. When every living player passes in a row, only the **top** item resolves; then the active player gets priority again, so players can respond before the next item resolves. Triggered abilities go on the stack too, so they can be responded to (destroying Goblin Planner in response to its trigger doesn't stop the mana).

Activated abilities can be used at incantation speed unless the card says otherwise.

### Paying mana

Leave out `pay` and the engine pays automatically: floating mana first, then Mana Orbs, then Corrupted Mana Rocks, then Mana Rocks. Or list exactly what to spend, one entry per mana: `pay: [{ orb: 'c14' }, 'rock']` (sources: `{ orb }`, `'floating'`, `'rock'`, `'corrupted'`).

### Combat

1. The attacker declares an attack (it taps unless it has VIGILANCE).
2. Everyone may respond.
3. The defender may block with an untapped creature, which taps it (skipped for EVASIVE and FACEOFF attacks). Everyone may respond.
4. The attacker taps any untapped creatures to boost the attacker (+1 each; summoning sickness doesn't matter).
5. If there is a defending creature (a blocker or the FACEOFF target), the defender may boost it the same way. With no defending creature there is nothing to boost.
6. Everyone may respond again.
7. Attack is compared with defense. Higher: the defending creature dies and the defender loses 1 life (2 with DOUBLE STRIKE) and draws a card (not with CRITICAL). Equal: the defending creature dies, no life lost. Lower: nothing happens. The attacker never dies in combat.

## Card scripts

Printed card data (name, cost, stats, text) lives in `data/cards.json`, exported from the spreadsheet. What a card **does** is written as data in `src/cards/`, keyed by card id. For example, Goblin Scout:

```ts
'goblin-scout': {
  triggers: [
    { label: 'Draw on play',       on: 'etb',       subject: 'self', effects: [{ do: 'draw', n: 1 }] },
    { label: 'Draw when destroyed', on: 'destroyed', subject: 'self', effects: [{ do: 'draw', n: 1 }] },
  ],
},
```

A script can have:

- **keywords**: HASTE, CRITICAL, VIGILANCE, …
- **triggers**: when an event happens (`etb`, `destroyed`, `attackDeclared`, `tappedToAttack`, `boost`, `attackBoosted`, `clashKill`, `upkeep`, `endPhase`, `charge`), check a condition and run effects
- **activated** abilities: a cost (tap and/or mana) and effects
- **statics**: always-on effects such as "your other Goblins get +1/+1"
- **resolve** effects and **targets** for Spells and Incantations
- **altCost**, **playCondition** and **replacements**

Effects available so far: `draw`, `createToken`, `counter`, `pump`, `grant`, `addMana`, `damage`, `destroy`, `negate`, `choose`, `moveToHand`, `shuffleDeck`, `repeat`, `if`, `may` (a yes/no choice, optionally paying mana), `untap`, `fillOrb`, `destroyOrb`, `chargeCard`, `chargeFromDeck`, `copyToken`, `reveal`. New cards mostly combine these; a new effect is added to `src/engine/effects.ts` when a card needs one.

Cards without a script can still be played. Creatures act as vanilla creatures with their printed stats; other cards go on the stack and do nothing, with a note in the log.

### Scripted so far

- All 21 Goblins, the Goblin Token, and the Forest field
- All 8 Druids, plus the charging cards Mana Droid, Vendor Street, Anthem #1, Mana Ramp and Cosmic Channeling
- Fireball, Swords Up!, Shields Up! and No!, used to test the stack and responses

## Layout

```
data/cards.json          card database (from Cards.xlsx)
src/types.ts             state, actions and script types
src/engine/game.ts       createGame, apply, whoMustAct, playing and charging cards
src/engine/turns.ts      Untap → Upkeep → Draw → Main → End
src/engine/stack.ts      priority windows and stack resolution
src/engine/combat.ts     attacks, blocks, boosts, clashes
src/engine/effects.ts    the effect interpreter
src/engine/events.ts     events and triggered abilities
src/engine/stats.ts      attack/defense, keywords, tribes, filters
src/engine/zones.ts      drawing, entering/leaving the field, elimination
src/engine/mana.ts       Mana Orbs, Mana Rocks, floating mana
src/cards/*.ts           card scripts
src/bot.ts, src/decks.ts simple bot and sample decks for testing
test/                    tests
```

## Not built yet

- Hidden information: the state holds every hand and deck; a server must send each player only their own view.
- Souls, contracts (OFFER / COMMAND / GIFT), Corrupted Mana, BOND, DEMIGOD, INFECT and the other tribe mechanics.
- Choosing the order of simultaneous triggers (they currently go on the stack in the order they happened).
- Cards that look at or interact with charged Mana Orbs (the Orb keeps track of which card it is, ready for them).
