// Scripts for Vampires, Zombies, Constructs and Demons (cards whose rules are settled).
import type { CardScript, Effect, Filter } from '../types.ts';

const yourVampires: Filter = { controller: 'you', tribe: 'Vampire' };
const yourZombies: Filter = { controller: 'you', tribe: 'Zombie' };
const yourArtifacts: Filter = { controller: 'you', type: 'Artifact' };
const yourCreatures: Filter = { controller: 'you', type: 'Creature' };
const zombieToken: Effect = { do: 'createToken', token: 'zombie-token', n: 1 };
const constructToken: Effect = { do: 'createToken', token: 'construct-token', n: 1 };

export const vampireScripts: Record<string, CardScript> = {
  // TAP; Target "Vampire" gains DMG GAIN until the end of the turn.
  'vampire-merchant': {
    activated: [
      {
        label: 'Tap: a Vampire gains DMG GAIN',
        cost: { tap: true },
        effects: [{ do: 'choose', from: { zone: 'field', tribe: 'Vampire', controller: 'any' }, as: 'v', prompt: 'Choose a Vampire to gain DMG GAIN this turn' }, { do: 'grant', target: 'var:v', keyword: 'DMG GAIN', until: 'turn' }],
      },
    ],
  },
  'marissa-vampire-bride': { keywords: ['DMG GAIN'] },
  'vampire-duke': { keywords: ['DMG GAIN'] },
  'vampire-infiltrator': { keywords: ['FACEOFF'] },
  // ON "Vampire" CLASH - CLASHING "Vampire" gains a +0/1 counter.
  'xavier-vampire-groom': {
    triggers: [{ label: '+0/+1 counter for the clashing Vampire', on: 'clash', subject: yourVampires, effects: [{ do: 'counter', target: 'eventSubject', atk: 0, def: 1 }] }],
  },
  // Inherits all the Keywords of Vampires you control.
  'vampire-glutton': { statics: [{ kind: 'inheritKeywords', filter: { ...yourVampires, other: true } }] },
  // If this creature survives CLASH; create a 1/1 vampire token with the same effect as the creature this card battled.
  'inspired-vampire': {
    triggers: [
      {
        label: 'Vampire Token with the same effect',
        on: 'clashSurvived',
        subject: 'self',
        effects: [{ do: 'createSpecialToken', base: 'eventOther', n: 1, set: { name: 'Vampire Token', type: 'Creature', tribe: 'Vampire', attack: 1, defense: 1 } }],
      },
    ],
  },
  // ON Vampire entering your field, inherit its keywords.
  'vampire-shapeshifter': {
    triggers: [{ label: 'Inherit keywords', on: 'etb', subject: { ...yourVampires, other: true }, effects: [{ do: 'inheritKeywords', from: 'eventSubject', to: 'self' }] }],
  },
  // FACEOFF - When this creature survives a CLASH; add 1 mana to your mana pool until the end of the turn.
  'vampire-nurse': { keywords: ['FACEOFF'], triggers: [{ label: 'Add 1 mana', on: 'clashSurvived', subject: 'self', effects: [{ do: 'addMana', n: 1 }] }] },
  // Vampires you control gain VIGILANCE.
  'vampire-castle': { statics: [{ kind: 'grantKeyword', filter: yourVampires, keyword: 'VIGILANCE' }] },
  // Whenever a creature you control with Combat Counters attacks; you may draw 1 card.
  'lair-entrance': {
    triggers: [{ label: 'You may draw', on: 'attackDeclared', subject: { controller: 'you', hasCounters: true }, effects: [{ do: 'may', prompt: 'Draw a card?', then: [{ do: 'draw', n: 1 }] }] }],
  },
};

export const zombieScripts: Record<string, CardScript> = {
  // Whenever one of your creatures gets destroyed, you may draw 1 card.
  'mourning-marauder': {
    triggers: [{ label: 'You may draw', on: 'destroyed', subject: yourCreatures, effects: [{ do: 'may', prompt: 'One of your creatures was destroyed. Draw a card?', then: [{ do: 'draw', n: 1 }] }] }],
  },
  // During your turn, you may send this card to your Discard Pile; add 1 Zombie from your Discard Pile to your hand.
  'cryptic-reclaimer': {
    activated: [
      {
        label: 'Send to discard: a Zombie from your discard pile to your hand',
        cost: {},
        condition: { isYourTurn: true },
        effects: [
          { do: 'toDiscard', target: 'self' },
          { do: 'choose', from: { zone: 'discard', controller: 'you', tribe: 'Zombie' }, as: 'z', prompt: 'Choose a Zombie from your discard pile' },
          { do: 'moveToHand', target: 'var:z', reveal: true },
        ],
      },
    ],
  },
  // Tap - Destroy this creature - When this creature is destroyed; Reduce the cost of your next Zombie creature played this turn by 2.
  'gravebound-martyr': {
    activated: [{ label: 'Tap: destroy this creature', cost: { tap: true }, effects: [{ do: 'destroy', target: 'self' }] }],
    triggers: [{ label: 'Next Zombie costs 2 less', on: 'destroyed', subject: 'self', effects: [{ do: 'reduceNextCost', tribe: 'Zombie', amount: 2 }] }],
  },
  // Whenever this card is destroyed; Return it to your field tapped.
  'resilient-revenant': {
    triggers: [{ label: 'Return to the field tapped', on: 'destroyed', subject: 'self', effects: [{ do: 'returnToField', target: 'self', tapped: true }] }],
  },
  // Whenever this card is destroyed; you may create a 1/1 Zombie Token and add this card to your hand.
  'graveborn-guardian': {
    triggers: [
      {
        label: 'Zombie Token and back to hand',
        on: 'destroyed',
        subject: 'self',
        effects: [{ do: 'may', prompt: 'Create a 1/1 Zombie Token and return Graveborn Guardian to your hand?', then: [zombieToken, { do: 'moveToHand', target: 'self' }] }],
      },
    ],
  },
  // TAP; Destroy 1 creature you control and create a 1/1 Zombie Token.
  'morbid-manipulator': {
    activated: [
      {
        label: 'Tap: destroy a creature you control, create a Zombie Token',
        cost: { tap: true },
        effects: [{ do: 'choose', from: { zone: 'field', ...yourCreatures }, as: 'c', prompt: 'Choose a creature you control to destroy' }, { do: 'destroy', target: 'var:c' }, zombieToken],
      },
    ],
  },
  // ETB - Return target Zombie from your Discard Pile to your field.
  'necromantic-summoner': {
    triggers: [
      {
        label: 'Return a Zombie from your discard pile',
        on: 'etb',
        subject: 'self',
        effects: [{ do: 'choose', from: { zone: 'discard', controller: 'you', tribe: 'Zombie' }, as: 'z', prompt: 'Choose a Zombie to return to your field' }, { do: 'returnToField', target: 'var:z' }],
      },
    ],
  },
  // All Your zombies gain +1/0.
  'dread-envoy': { statics: [{ kind: 'buff', filter: yourZombies, atk: 1, def: 0 }] },
  // When a Zombie in your field is destroyed; create a tapped 1/1 Zombie Token.
  'dreaded-lineage': {
    triggers: [{ label: 'Tapped Zombie Token', on: 'destroyed', subject: yourZombies, effects: [{ do: 'createToken', token: 'zombie-token', n: 1, tapped: true }] }],
  },
  // The first 2 times a Zombie enters your field during a turn; create 1 Corrupted Mana.
  'corrupted-artificer': {
    triggers: [{ label: 'Corrupted Mana Rock', on: 'etb', subject: yourZombies, condition: { limitPerTurn: 'zombie-etb', n: 2 }, effects: [{ do: 'createRock', n: 1, corrupted: true }] }],
  },
  // Tap; Destroy 1 Zombie you control; Create 1 Corrupted Mana Rock.
  'unholy-grimoire': {
    activated: [
      {
        label: 'Tap: destroy a Zombie you control, create a Corrupted Mana Rock',
        cost: { tap: true },
        condition: { count: yourZombies, atLeast: 1 },
        effects: [{ do: 'choose', from: { zone: 'field', ...yourZombies }, as: 'z', prompt: 'Choose a Zombie you control to destroy' }, { do: 'destroy', target: 'var:z' }, { do: 'createRock', n: 1, corrupted: true }],
      },
    ],
  },
  // Tap; Create a 1/1 Zombie Token.
  'grim-gauntlet': { activated: [{ label: 'Tap: create a Zombie Token', cost: { tap: true }, effects: [zombieToken] }] },
  // Whenever a Creature in your drop zone is played to your field; generate 1 Mana Rock.
  tombstone: { triggers: [{ label: 'Mana Rock', on: 'fromDiscard', subject: { type: 'Creature' }, condition: { eventPlayerIsYou: true }, effects: [{ do: 'createRock', n: 1 }] }] },
  // When a creature you control dies - Add 1 counter to this card. When at 3 counters - Create 1 Corrupted Mana and reduce 3 counters.
  'corruption-engine': {
    triggers: [
      {
        label: 'Add a counter',
        on: 'destroyed',
        subject: yourCreatures,
        effects: [
          { do: 'counter', target: 'self', atk: 0, def: 0 },
          { do: 'if', cond: { selfCounters: 3 }, then: [{ do: 'removeCounters', target: 'self', n: 3 }, { do: 'createRock', n: 1, corrupted: true }] },
        ],
      },
    ],
  },
  // Return target creature from a discard pile to your field.
  reanimation: {
    resolve: [{ do: 'choose', from: { zone: 'discard', controller: 'any', type: 'Creature' }, as: 'c', prompt: 'Choose a creature from any discard pile to put onto your field' }, { do: 'returnToField', target: 'var:c' }],
  },
  // Move one creature from your discard pile to your hand.
  'creature-retrieval': {
    resolve: [{ do: 'choose', from: { zone: 'discard', controller: 'you', type: 'Creature' }, as: 'c', prompt: 'Choose a creature from your discard pile' }, { do: 'moveToHand', target: 'var:c', reveal: true }],
  },
  // Sacrifice a creature; destroy 1 creature.
  // Sacrifice a creature (as part of the cost); destroy 1 creature.
  sacrifice: {
    targets: [
      { kind: 'creature', filter: { controller: 'you' }, sacrifice: true, prompt: 'Choose a creature you control to sacrifice' },
      { kind: 'creature', prompt: 'Choose a creature to destroy' },
    ],
    resolve: [{ do: 'destroy', target: 'target:1' }],
  },
  'zombie-token': {},
};

/** Steelshaper Vanguard: offer "tap 2 Artifacts for a keyword" again only after a Yes. */
function steelshaperOffers(left: number): Effect[] {
  if (left <= 0) return [];
  return [
    {
      do: 'if',
      cond: { count: { ...yourArtifacts, untapped: true }, atLeast: 2 },
      then: [
        {
          do: 'may',
          prompt: 'Tap 2 of your Artifacts to give Steelshaper Vanguard a keyword this turn?',
          then: [
            { do: 'choose', from: { zone: 'field', ...yourArtifacts, untapped: true }, as: 'a1', prompt: 'Choose the first Artifact to tap' },
            { do: 'tap', target: 'var:a1' },
            { do: 'choose', from: { zone: 'field', ...yourArtifacts, untapped: true }, as: 'a2', prompt: 'Choose the second Artifact to tap' },
            { do: 'tap', target: 'var:a2' },
            {
              do: 'chooseMode',
              prompt: 'Steelshaper Vanguard gains:',
              modes: (['CRITICAL', 'DOUBLE STRIKE', 'FACEOFF', 'DMG GAIN', 'RECONFIGURE', 'INDESTRUCTIBLE'] as const).map((k) => ({ label: k, effects: [{ do: 'grant', target: 'self', keyword: k, until: 'turn' } as Effect] })),
            },
            ...steelshaperOffers(left - 1),
          ],
        },
      ],
    },
  ];
}

export const constructScripts: Record<string, CardScript> = {
  // All your artifacts gain RECONFIGURE.
  'recalibrator-sentinel': { statics: [{ kind: 'grantKeyword', filter: { controller: 'you', type: 'Artifact' }, keyword: 'RECONFIGURE' }] },
  // TAP - Create 1 Mana Rock ; RECONFIGURE
  'crystalforge-automaton': { keywords: ['RECONFIGURE'], activated: [{ label: 'Tap: create a Mana Rock', cost: { tap: true }, effects: [{ do: 'createRock', n: 1 }] }] },
  // ON ATTACK - TAP 2 Artifacts you control; choose a keyword and gain it until the end of the turn; once per keyword.
  'steelshaper-vanguard': {
    triggers: [
      {
        label: 'Tap Artifacts for keywords',
        on: 'attackDeclared',
        subject: 'self',
        // Up to once per keyword (6). Saying No ends it for this attack.
        effects: steelshaperOffers(6),
      },
    ],
  },
  // TAP - Untap target Artifact you control.
  'clockwork-servitor': {
    activated: [
      {
        label: 'Tap: untap another Artifact you control',
        cost: { tap: true },
        condition: { count: { ...yourArtifacts, tapped: true, other: true }, atLeast: 1 },
        // "another" Artifact: untapping itself would be an endless loop (with Tharix, endless counters).
        effects: [{ do: 'choose', from: { zone: 'field', ...yourArtifacts, tapped: true, other: true }, as: 'a', prompt: 'Choose another tapped Artifact you control to untap' }, { do: 'untap', target: 'var:a' }],
      },
    ],
  },
  // Constructs you control gain a +1/1 counter whenever they become tapped.
  'tharix-gearwork-animator': {
    triggers: [{ label: '+1/+1 counter', on: 'tapped', subject: { controller: 'you', tribe: 'Construct' }, effects: [{ do: 'counter', target: 'eventSubject', atk: 1, def: 1 }] }],
  },
  // ETB - Create a 1/1 Construct token with RECONFIGURE.
  'fabrication-sentinel': { triggers: [{ label: 'Construct Token', on: 'etb', subject: 'self', effects: [constructToken] }] },
  // ON YOUR TURN - You may draw 1 card ON Artifact ETB.
  'insight-automaton': {
    triggers: [{ label: 'You may draw', on: 'etb', subject: yourArtifacts, condition: { isYourTurn: true }, effects: [{ do: 'may', prompt: 'An Artifact entered your field. Draw a card?', then: [{ do: 'draw', n: 1 }] }] }],
  },
  // This creature's power and toughness are equal to the number of Artifacts you control.
  'clockwork-titan': { statics: [{ kind: 'statsFromCount', per: yourArtifacts }] },
  // Pay 1 and Tap an artifact you control - Draw 1 card.
  'support-mk-ii': {
    activated: [
      {
        label: 'Pay 1, tap an Artifact: draw a card',
        cost: { mana: 1 },
        condition: { count: { ...yourArtifacts, untapped: true }, atLeast: 1 },
        effects: [{ do: 'choose', from: { zone: 'field', ...yourArtifacts, untapped: true }, as: 'a', prompt: 'Choose an Artifact you control to tap' }, { do: 'tap', target: 'var:a' }, { do: 'draw', n: 1 }],
      },
    ],
  },
  // END OF ANY TURN - If you tapped at least 3 Artifacts this turn, create a 1/1 Artifact Creature token with RECONFIGURE.
  database: { triggers: [{ label: 'Construct Token', on: 'endPhase', condition: { artifactTaps: 3 }, effects: [constructToken] }] },
  // You can tap your Artifacts to pay for 1 mana when playing an Artifact. (Handled by the payment rules.)
  'arcane-foundry': {},
  // Whenever another Artifact is tapped under your control - Gain 1 Counter. TAP - 3 counters: draw; 6: abilities cost 2 less; 12: untap all your Artifacts.
  'machinist-s-reservoir': {
    triggers: [{ label: 'Gain a counter', on: 'tapped', subject: { ...yourArtifacts, other: true }, effects: [{ do: 'counter', target: 'self', atk: 0, def: 0 }] }],
    activated: [
      { label: 'Tap, remove 3 counters: draw a card', cost: { tap: true }, condition: { selfCounters: 3 }, effects: [{ do: 'removeCounters', target: 'self', n: 3 }, { do: 'draw', n: 1 }] },
      { label: 'Tap, remove 6 counters: abilities cost 2 less this turn', cost: { tap: true }, condition: { selfCounters: 6 }, effects: [{ do: 'removeCounters', target: 'self', n: 6 }, { do: 'discountAbilities', amount: 2 }] },
      { label: 'Tap, remove 12 counters: untap all your Artifacts', cost: { tap: true }, condition: { selfCounters: 12 }, effects: [{ do: 'removeCounters', target: 'self', n: 12 }, { do: 'untapAll', filter: yourArtifacts }] },
    ],
  },
  // TAP - Create a 1/1 Construct Token with RECONFIGURE.
  'automaton-forge': { activated: [{ label: 'Tap: create a Construct Token', cost: { tap: true }, effects: [constructToken] }] },
  // TAP - GUIDE 1, you may reveal an Artifact from those cards and add it to your hand. Artifacts you play cost 1 less.
  'foundry-stone': {
    statics: [{ kind: 'costReduction', filter: { type: 'Artifact' }, amount: 1 }],
    activated: [
      {
        label: 'Tap: look at the top card; take it if it is an Artifact',
        cost: { tap: true },
        effects: [
          {
            do: 'if',
            cond: { refType: ['deckTop', ['Artifact']] },
            then: [{ do: 'may', prompt: 'The top card of your deck is an Artifact. Reveal it and put it into your hand?', then: [{ do: 'moveToHand', target: 'deckTop', reveal: true }] }],
          },
          { do: 'guide', n: 1 },
        ],
      },
    ],
  },
  // Return 1 Artifact from your drop to your hand.
  repairs: {
    resolve: [{ do: 'choose', from: { zone: 'discard', controller: 'you', type: 'Artifact' }, as: 'a', prompt: 'Choose an Artifact from your discard pile' }, { do: 'moveToHand', target: 'var:a', reveal: true }],
  },
  // Untap all of your artifacts.
  reset: { resolve: [{ do: 'untapAll', filter: yourArtifacts }] },
  // GUIDE 3, Draw 1 card. You may reveal the card if it's an Artifact and create 1 Mana Rock.
  'artificer-s-insight': {
    resolve: [
      { do: 'guide', n: 3 },
      { do: 'draw', n: 1, as: 'drawn' },
      { do: 'if', cond: { refType: ['var:drawn', ['Artifact']] }, then: [{ do: 'may', prompt: 'You drew an Artifact. Reveal it to create a Mana Rock?', then: [{ do: 'reveal', target: 'var:drawn' }, { do: 'createRock', n: 1 }] }] },
    ],
  },
  // Whenever a creature with +1/1 counters leaves the battlefield under your control, you may move the counters to this card.
  // TAP - Move any number of counters from this card to target creature you control.
  'artifact-1': {
    triggers: [
      {
        label: 'Keep the counters',
        on: 'leftField',
        subject: { controller: 'you', type: 'Creature' },
        effects: [{ do: 'may', prompt: 'Move that creature\'s counters onto Artifact #1?', then: [{ do: 'gainCountersFromEvent', target: 'self' }] }],
      },
    ],
    activated: [
      {
        label: 'Tap: move all counters to a creature you control',
        cost: { tap: true },
        condition: { selfCounters: 1 },
        effects: [{ do: 'choose', from: { zone: 'field', ...yourCreatures }, as: 'c', prompt: 'Choose a creature you control to get the counters' }, { do: 'moveCounters', from: 'self', to: 'var:c' }],
      },
    ],
  },
  // ON YOUR TURN - first Artifact costs 1 less; tap your 3rd Artifact: may draw; tap your 10th Artifact: may create a Construct Token.
  'neural-nexus': {
    statics: [{ kind: 'costReduction', filter: { type: 'Artifact' }, amount: 1, firstPerTurn: true }],
    triggers: [
      {
        label: 'Third Artifact tapped: you may draw',
        on: 'tapped',
        subject: yourArtifacts,
        condition: { and: [{ isYourTurn: true }, { artifactTaps: 3, exactly: true }] },
        effects: [{ do: 'may', prompt: 'You tapped your third Artifact this turn. Draw a card?', then: [{ do: 'draw', n: 1 }] }],
      },
      {
        label: 'Tenth Artifact tapped: Construct Token',
        on: 'tapped',
        subject: yourArtifacts,
        condition: { and: [{ isYourTurn: true }, { artifactTaps: 10, exactly: true }] },
        effects: [{ do: 'may', prompt: 'You tapped your tenth Artifact this turn. Create a Construct Token?', then: [constructToken] }],
      },
    ],
  },
  'construct-token': { keywords: ['RECONFIGURE'] },
};

export const demonScripts: Record<string, CardScript> = {
  // When this creature is attacking and you have at least 10 Souls, destroy target creature.
  'chained-demon': {
    triggers: [
      {
        label: 'Destroy a creature (10 Souls)',
        on: 'attackDeclared',
        subject: 'self',
        condition: { soulsAtLeast: 10 },
        effects: [{ do: 'choose', from: { zone: 'field', type: 'Creature', controller: 'any', other: true }, as: 'c', prompt: 'Chained Demon: choose a creature to destroy' }, { do: 'destroy', target: 'var:c' }],
      },
    ],
  },
  // If blocked, defending opponent doesn't untap 1 mana card during their untap phase. If not blocked, defending opponent draws 1 card.
  'charitable-demon': {
    triggers: [
      {
        label: 'Blocked or not',
        on: 'combatResult',
        subject: 'self',
        effects: [{ do: 'if', cond: { eventKind: 'blocked' }, then: [{ do: 'skipRefill', who: 'eventTarget' }], else: [{ do: 'draw', n: 1, who: 'eventTarget' }] }],
      },
    ],
  },
  // The first time a Demon enters your field during a turn; COMMAND target player to draw a card.
  'demon-bard': {
    triggers: [
      {
        label: 'COMMAND a player to draw',
        on: 'etb',
        subject: { controller: 'you', tribe: 'Demon' },
        condition: { onceFlag: 'demon-etb' },
        effects: [{ do: 'choosePlayer', as: 't', prompt: 'COMMAND a player to draw a card', opponentsOnly: true }, { do: 'draw', n: 1, who: 'pvar:t' }, { do: 'contract', kind: 'command', who: 'pvar:t' }],
      },
    ],
  },
  // 5 SOULS - this creature gets a +1/1 counter - 10 SOULS - Create 1 Mana Rock. Each effect is only triggered once.
  'demon-charger': {
    triggers: (['soulsGained', 'etb'] as const).map((on) => ({
      label: 'Soul rewards',
      on,
      ...(on === 'etb' ? { subject: 'self' as const } : {}),
      condition: on === 'soulsGained' ? { eventPlayerIsYou: true as const } : undefined,
      effects: [
        { do: 'if', cond: { and: [{ soulsAtLeast: 5 }, { memo: '5' }] }, then: [{ do: 'counter', target: 'self', atk: 1, def: 1 }] },
        { do: 'if', cond: { and: [{ soulsAtLeast: 10 }, { memo: '10' }] }, then: [{ do: 'createRock', n: 1 }] },
      ] as Effect[],
    })),
  },
  // If you have at least 10 Souls, whenever an OFFER or COMMAND effect activates; create a 2/2 Demon Token.
  'demon-summoner': {
    triggers: [{ label: 'Demon Token', on: 'contract', condition: { soulsAtLeast: 10 }, effects: [{ do: 'createToken', token: 'demon-token', n: 1 }] }],
  },
  // ON COMMAND - Gain a Soul.
  'soul-collector': {
    triggers: [{ label: 'Gain a Soul', on: 'contract', condition: { and: [{ eventPlayerIsYou: true }, { eventKind: 'command' }] }, effects: [{ do: 'gainSouls', n: 1 }] }],
  },
  // ETB - COMMAND target player to give you selected creature. Untap it. ON OFFER OR COMMAND - You may draw 1 card.
  'lilith-queen-of-demons': {
    triggers: [
      {
        label: 'COMMAND a player to give you a creature',
        on: 'etb',
        subject: 'self',
        effects: [
          { do: 'choosePlayer', as: 't', prompt: 'COMMAND a player to give you a creature', opponentsOnly: true },
          { do: 'chooseCreatureOf', who: 'pvar:t', as: 'c', prompt: 'Choose the creature they must give you' },
          { do: 'gainControl', target: 'var:c', untap: true },
          { do: 'contract', kind: 'command', who: 'pvar:t' },
        ],
      },
      { label: 'You may draw', on: 'contract', condition: { eventPlayerIsYou: true }, effects: [{ do: 'may', prompt: 'You made a contract. Draw a card?', then: [{ do: 'draw', n: 1 }] }] },
    ],
  },
  // COMMAND target player to draw a card; Draw a card.
  'insightful-decree': {
    resolve: [{ do: 'choosePlayer', as: 't', prompt: 'COMMAND a player to draw a card', opponentsOnly: true }, { do: 'draw', n: 1, who: 'pvar:t' }, { do: 'contract', kind: 'command', who: 'pvar:t' }, { do: 'draw', n: 1 }],
  },
  'demon-token': {},
};
