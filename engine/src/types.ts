// Core types for the ManaPool rules engine.

export type PlayerId = number; // seat index; turns go clockwise = ascending seat index
export type Iid = string; // card instance id (one per physical card or token)

export type CardType =
  | 'Creature'
  | 'Artifact'
  | 'Spell'
  | 'Incantation'
  | 'Anthem'
  | 'Field'
  | 'Token'
  | 'Mana Token';

export type Speed = 'spell' | 'incantation';

export type Keyword =
  | 'HASTE'
  | 'CRITICAL'
  | 'CRITICAL BOOST'
  | 'DMG GAIN'
  | 'FACEOFF'
  | 'DOUBLE STRIKE'
  | 'INDESTRUCTIBLE'
  | 'VIGILANCE'
  | 'EVASIVE'
  | 'RECONFIGURE'
  | 'SHAPESHIFTER'
  | 'TRAMPLE'
  | 'FLASH'
  | 'BOND'
  | 'DEVOUR'
  | 'INFECT'
  | 'DEMIGOD';

export type Phase = 'mulligan' | 'upkeep' | 'main' | 'end' | 'over';

// ---------- card definitions ----------

/** Printed card data, from data/cards.json. */
export interface CardData {
  id: string;
  name: string;
  type: CardType;
  tribe?: string;
  speed?: Speed;
  cost: number | null;
  attack?: number | string | null;
  defense?: number | string | null;
  text: string;
}

export interface Filter {
  zone?: 'field' | 'deck' | 'hand' | 'discard' | 'orbs';
  orbFilled?: boolean; // zone 'orbs' only: true = filled, false = used
  controller?: 'you' | 'opponent' | 'any';
  type?: 'Creature' | CardType;
  tribe?: string;
  other?: boolean; // excludes the source itself
  maxCost?: number;
  minCost?: number;
  flag?: keyof PermFlags;
  untapped?: boolean;
  tapped?: boolean;
  hasCounters?: boolean;
  nonToken?: boolean;
  types?: CardType[]; // any of these types
  keywordRef?: string; // the card's text mentions this keyword (e.g. OFFER)
  atkAbovePrinted?: number; // attack is at least this much above its printed attack
}

/** Who an effect is for: you (default), a player chosen earlier, or the player the event is about. */
export type PlayerRef = 'you' | 'eventPlayer' | 'eventTarget' | 'owner' | `pvar:${string}`; // owner = owner of the source card

/** A number in an effect: a constant, a count of matching cards, or a stored variable. */
export type Num = number | { count: Filter } | { var: string } | { costOf: Ref } | { half: Num } | { souls: true } | { mul: [Num, number] } | { eventN: true };

export type Ref =
  | 'self' // the card the ability belongs to
  | 'attacker' // the creature attacking in the current combat
  | 'eventSubject' // the card the triggering event is about
  | `target:${number}` // a target chosen when the card was played
  | `var:${string}` // a card chosen earlier in this effect
  | 'eventOther' // the other creature in a clash
  | 'deckTop'; // the top card of your deck

export type Condition =
  | { count: Filter; atLeast: number }
  | { isYourTurn: true }
  | { clashInProgress: true }
  | { selfEnteredThisTurn: true }
  | { hitsThisTurn: { tribe?: string }; atLeast: number }
  | { varTribe: [string, string] } // [variable, tribe]
  | { eventBoostersInclude: { tribe?: string } }
  | { eventAttackNumber: number } // Nth attack this turn by the attacking player
  | { hasKeyword: [Ref, Keyword] }
  | { refType: [Ref, CardType[]] } // the referenced card is one of these types
  | { soulsAtLeast: number }
  | { refTribe: [Ref, string] }
  | { eventPlayerIsYou: true }
  | { onceFlag: string } // true the first time it's checked this turn for this source (then false)
  | { limitPerTurn: string; n: number } // true the first n times it's checked this turn for this source
  | { memo: string } // true only the first time ever for this permanent
  | { selfCounters: number } // this card has at least n counters
  | { eventKind: string }
  | { artifactTaps: number; exactly?: boolean } // how many times you tapped Artifacts this turn
  | { lifeBelow: number } // your life is below n
  | { eventNIs: number }
  | { varIs: [string, number] }
  | { varAtLeast: [string, number] }
  | { eventNMultipleOf: number }
  | { attackTotal: { tribe?: string }; atLeast: number } // total attack (with boosts) of your attackers this turn
  | { and: Condition[] }
  | { not: Condition };

export type Duration = 'battle' | 'turn' | 'permanent';

export interface StatOverride {
  name?: string;
  attack?: number;
  defense?: number;
  tribe?: string;
  type?: CardType;
  scriptFrom?: string | null; // use another card's abilities; null = no abilities
  text?: string;
}

export type Effect =
  | { do: 'draw'; n: Num; who?: PlayerRef; as?: string } // `as` stores the last card drawn
  | { do: 'createToken'; token: string; n: Num; keywords?: Keyword[]; tapped?: boolean }
  | { do: 'counter'; target: Ref; atk: number; def: number; max?: number } // max = most this source can give one card
  | { do: 'pump'; target: Ref; atk: number; def: number; until: Duration }
  | { do: 'grant'; target: Ref; keyword: Keyword; until: Duration }
  | { do: 'addMana'; n: Num }
  | { do: 'damage'; target: Ref; n: Num }
  | { do: 'destroy'; target: Ref }
  | { do: 'negate'; target: Ref }
  | { do: 'choose'; from: Filter; as: string; optional?: boolean; prompt: string }
  | { do: 'moveToHand'; target: Ref; reveal?: boolean }
  | { do: 'shuffleDeck' }
  | { do: 'repeat'; n: Num; effects: Effect[] }
  | { do: 'may'; prompt: string; cost?: Num; then: Effect[] } // the controller chooses yes or no (paying `cost` mana for yes)
  | { do: 'untap'; target: Ref }
  | { do: 'attach'; target: Ref } // equip the source to the target creature
  | { do: 'fillOrb'; n: Num } // refill used Mana Orbs
  | { do: 'destroyOrb'; target: Ref } // a Mana Orb's card goes to its owner's discard pile
  | { do: 'chargeCard'; target: Ref } // a card from hand becomes a Mana Orb (doesn't use the turn's charge)
  | { do: 'chargeFromDeck' } // the top card of your deck becomes a Mana Orb
  | { do: 'copyToken'; target: Ref } // a copy of the card: permanents enter your field; Spells and Incantations go on the stack
  | { do: 'chooseFrom'; options: Iid[]; as: string; prompt: string } // (internal) pick from a fixed list
  | { do: 'stackCopy'; iid: Iid; targetVar?: string } // (internal) put a copied Spell or Incantation on the stack
  | { do: 'reveal'; target: Ref }
  | { do: 'if'; cond: Condition; then: Effect[]; else?: Effect[] }
  | { do: 'guide'; n: Num } // look at the top N cards; put any on top in any order, the rest on the bottom
  | { do: 'chooseMode'; prompt: string; modes: { label: string; effects: Effect[] }[] }
  | { do: 'choosePlayer'; as: string; prompt: string; opponentsOnly?: boolean }
  | { do: 'destroyAll'; filter: Filter }
  | { do: 'sacrifice'; target: Ref } // destroy a creature you control, even an INDESTRUCTIBLE one
  | { do: 'returnToField'; target: Ref; tapped?: boolean } // from a discard pile onto your field
  | { do: 'toDeckBottom'; target: Ref }
  | { do: 'discardHand'; as: string } // stores how many were discarded
  | { do: 'loseLife'; n: Num }
  | { do: 'createRock'; n: Num; corrupted?: boolean; who?: PlayerRef }
  | { do: 'coinFlip'; heads: Effect[]; tails: Effect[] }
  | { do: 'override'; target: Ref; set: StatOverride }
  | { do: 'gainControl'; target: Ref; untap?: boolean }
  | { do: 'contract'; kind: 'offer' | 'command' | 'gift'; who: PlayerRef } // you make a contract with that player: +1 Soul
  | { do: 'tap'; target: Ref }
  | { do: 'untapAll'; filter: Filter }
  | { do: 'inheritKeywords'; from: Ref; to: Ref } // `to` permanently gets `from`'s keywords
  | { do: 'createSpecialToken'; set: StatOverride; base: string | 'eventOther'; n: Num; owner?: PlayerRef } // a token of card `base` with overrides
  | { do: 'toDiscard'; target: Ref } // a permanent goes to its owner's discard pile (not "destroyed")
  | { do: 'removeCounters'; target: Ref; n: number }
  | { do: 'gainSouls'; n: Num }
  | { do: 'skipRefill'; who: PlayerRef } // that player doesn't refill 1 Mana Orb in their next Upkeep
  | { do: 'chooseCreatureOf'; who: PlayerRef; as: string; prompt: string } // you choose one of that player's creatures
  | { do: 'gainCountersFromEvent'; target: Ref } // the counters the event's card had
  | { do: 'discountAbilities'; amount: number } // your activated abilities cost less this turn
  | { do: 'reduceNextCost'; tribe?: string; amount: number }
  | { do: 'moveCounters'; from: Ref; to: Ref }
  // OFFER: each opponent may accept `gift` (run as them). Each acceptance is a contract (+1 Soul for you).
  // `denied` runs for each refusal; `after` runs once, with var "contracts" = number of acceptances.
  | { do: 'offer'; prompt: string; gift: Effect[]; denied?: Effect[]; after?: Effect[] }
  | { do: 'asPlayer'; who: PlayerRef; effects: Effect[] } // run effects as if that player controlled them
  | { do: 'setVar'; as: string; n: Num }
  | { do: 'gainLife'; n: Num }
  | { do: 'countThisTurn'; key: string; as: string } // stores how many times this ran this turn (for this source)
  | { do: 'allowDiscardPlay'; n: number } // until the End Phase, you may play n cards from your discard pile
  | { do: 'incVar'; as: string }
  | { do: 'infect'; target: Ref } // INFECT
  | { do: 'fadeOut'; filter: Filter } // FADE OUT: matching permanents leave the game until the End Phase
  | { do: 'extraAttack'; target: Ref } // the card makes its own attack at the current attack's target after this one
  | { do: 'ctl'; player: PlayerId } // (internal) switch the acting player
  | { do: 'setP'; as: string; player: PlayerId } // (internal) remember a player
  | { do: 'ask'; player: PlayerId; prompt: string; then: Effect[]; else: Effect[]; offerFrom: PlayerId } // (internal)
  | { do: 'offerDone' }; // (internal)

export type EventName =
  | 'etb' // subject entered the field
  | 'destroyed' // subject was destroyed
  | 'attackDeclared' // subject declared an attack
  | 'tappedToAttack' // subject tapped because it attacked
  | 'boost' // subject was tapped to boost (attacker = the creature it boosted)
  | 'attackBoosted' // boosting finished for attacker = subject
  | 'clashKill' // subject destroyed another creature in a clash
  | 'upkeep'
  | 'endPhase'
  | 'charge' // subject became a Mana Orb (player = who charged it)
  | 'tapped' // subject became tapped (for any reason)
  | 'untapped' // subject untapped (player = its controller)
  | 'drawStep' // player's draw step
  | 'clash' // subject is in a clash with `other`
  | 'clashSurvived' // subject survived a clash with `other`
  | 'fromDiscard' // subject came onto the field from a discard pile
  | 'contract' // player made a contract (kind in `kind`)
  | 'leftField' // subject left the field (destroyed, sacrificed, returned...); player = its controller
  | 'combatResult' // subject finished attacking; kind 'blocked' | 'unblocked'; target = defending player
  | 'soulsGained' // player gained Souls
  | 'offered' // player made an OFFER
  | 'offerResolved' // player's OFFER finished; n = contracts made
  | 'blocked' // subject (an attacker) was blocked
  | 'playerDamaged' // subject damaged player `target` for n (player = subject's controller)
  | 'counterAdded' // subject got a +X/X counter; kind = card id of the source
  | 'creatureTriggered' // a triggered ability of player's creature (subject) fired
  | 'creatureTapAbility'; // player's creature (subject) used its own Tap ability; n = how many this turn

export interface TriggeredAbility {
  label: string;
  on: EventName;
  /** Whose event counts: 'self' = this card is the subject; a Filter = the subject matches it; omitted = any. */
  subject?: 'self' | Filter;
  condition?: Condition;
  effects: Effect[];
  /** Mana abilities resolve at once instead of using the stack. */
  immediate?: boolean;
}

export interface ActivatedAbility {
  label: string;
  cost: { tap?: boolean; mana?: number; souls?: number };
  oncePerTurn?: boolean;
  oncePerRound?: boolean; // once from the start of your turn until your next turn
  condition?: Condition; // must be true to activate
  speed?: Speed; // default 'incantation'
  /** RECONFIGURE: untap this permanent once per round, whenever you have priority (no stack). */
  reconfigure?: boolean;
  effects: Effect[];
}

export type StaticAbility =
  | { kind: 'buff'; filter: Filter; atk: number; def: number; minSouls?: number }
  | { kind: 'grantKeyword'; filter: Filter; keyword: Keyword; minSouls?: number }
  | { kind: 'inheritKeywords'; filter: Filter } // this card has every keyword of the matching cards
  | { kind: 'grantAbility'; filter: Filter; ability: ActivatedAbility }
  | { kind: 'costReduction'; filter: Filter; amount: number; firstPerTurn?: boolean } // cards you play that match cost less
  | { kind: 'statsFromCount'; per: Filter } // attack and defense equal the number of matching cards
  | { kind: 'selfAtkPerCount'; per: Filter; atk: number }
  | { kind: 'boostBonus'; filter: Filter; extra: number } // your boosting creatures add extra attack
  | { kind: 'clashDouble' } // doubles attack when this creature clashes as attacker
  | { kind: 'extraCharge'; n: number }
  | { kind: 'equipped'; keyword?: Keyword; atk?: number; def?: number } // what the creature this is equipped to gets
  | { kind: 'equipAsArtifact' } // while equipped, this card is an Artifact, not a Creature (Arsen); // you may charge this many more cards each turn

export type Replacement = { kind: 'extraTokens'; tribe: string; extra: number };

export type TargetSpec = (
  | { kind: 'creature'; filter?: Filter }
  | { kind: 'permanent'; filter: Filter }
  | { kind: 'stackCard'; types: CardType[]; negaters?: boolean } // negaters: only cards that negate ("Counter cards")
) & {
  prompt?: string; // what the player is asked ("Choose a creature to destroy")
  sacrifice?: boolean; // this target is sacrificed as part of the cost, when the card is played
};

export interface CardScript {
  keywords?: Keyword[];
  statics?: StaticAbility[];
  triggers?: TriggeredAbility[];
  activated?: ActivatedAbility[];
  /** Spells/Incantations: what happens when the card resolves. */
  resolve?: Effect[];
  targets?: TargetSpec[];
  playCondition?: Condition;
  altCost?: { condition: Condition; cost: number };
  replacements?: Replacement[];
  /** Set while part of the card isn't implemented yet; the card shows as "not fully working". */
  todo?: string;
}

export interface CardDef extends CardData {
  script: CardScript;
  scripted: boolean;
}

// ---------- game state ----------

export interface CardInstance {
  iid: Iid;
  cardId: string;
  owner: PlayerId;
  isToken: boolean;
  extraKeywords: Keyword[]; // e.g. a Goblin Token "with CRITICAL BOOST"
  override?: StatOverride; // changes to the printed card (Anthropomorph, special tokens)
}

export interface PermFlags {
  boostedThisTurn: boolean; // tapped to boost this turn
  wasBoostedThisTurn: boolean; // received a boost this turn
  dealtPlayerDamageThisTurn: boolean;
}

export interface TempMod {
  atk: number;
  def: number;
  keyword?: Keyword;
  until: Duration;
}

export interface Permanent {
  iid: Iid;
  controller: PlayerId;
  tapped: boolean;
  sick: boolean; // summoning sickness
  enteredTurn: number;
  counters: number; // how many combat counters are on it
  counterAtk: number; // total attack from counters
  counterDef: number; // total defense from counters
  countersFrom: Record<string, number>; // counters given, by the card id of the source (for "max" limits)
  damage: number;
  mods: TempMod[];
  flags: PermFlags;
  abilitiesUsed: number[]; // indexes of once-per-turn abilities used this turn
  memo: string[]; // "only once" markers that last while it's on the field
  attachedTo?: Iid; // equipment: the creature it is equipped to
  infectedBy?: PlayerId; // INFECT: who gets it
  infectArmed?: boolean; // its controller's next turn has started
  roundUsed?: number[]; // once-per-round abilities used since its controller's turn began
  reconfigured?: boolean; // RECONFIGURE already used this round (resets at the start of its controller's turn)
}

export interface Orb {
  iid: Iid;
  filled: boolean;
}

export interface Player {
  id: PlayerId;
  name: string;
  life: number;
  deck: Iid[]; // index 0 = top
  hand: Iid[];
  discard: Iid[];
  field: Iid[]; // permanents (creatures, artifacts, anthems)
  orbs: Orb[];
  rocks: number;
  corruptedRocks: number;
  floating: number; // mana added "until the end of the turn"
  souls: number;
  fieldCard: string | null; // chosen Field (by card id)
  eliminated: boolean;
  conceded?: boolean;
  mulligan: 'pending' | 'kept';
  mulliganUsed: boolean;
  chargesThisTurn: number;
  costReductions: { tribe?: string; amount: number; turn: number }[]; // one-shot discounts on your next card
  onceFlags: string[]; // "first time this turn" markers, reset each turn
  artifactTapsThisTurn: number;
  typesPlayedThisTurn: string[];
  skipRefill: number; // Mana Orbs that won't refill next Upkeep
  abilityDiscount: number; // activated abilities cost this much less this turn
  attacksThisTurn: number;
  hitsThisTurn: { iid: Iid; cardId: string }[]; // creatures that damaged an opponent this turn
  attackLog: { cardId: string; atk: number }[]; // attacks this turn, with total attack after boosts
  creatureTapAbilities: number;
  discardPlays: number; // Graveyard: cards you may still play from your discard pile until the End Phase // your creatures used their own Tap abilities this many times this turn
}

export type StackItem =
  | { id: number; kind: 'card'; iid: Iid; controller: PlayerId; targets: string[] }
  | {
      id: number;
      kind: 'ability';
      source: string; // Iid, or "field:<pid>"
      controller: PlayerId;
      label: string;
      effects: Effect[];
      ctx: EffectCtx;
    };

export interface EffectCtx {
  source: string;
  controller: PlayerId;
  targets: string[];
  vars: Record<string, Iid | number | null>;
  event?: GameEvent;
}

export interface GameEvent {
  name: EventName;
  subject?: Iid;
  player?: PlayerId;
  attacker?: Iid;
  boosters?: Iid[];
  attackNumber?: number;
  other?: Iid; // the other creature in a clash
  kind?: string;
  target?: PlayerId; // defending player (combatResult)
  counters?: { n: number; atk: number; def: number }; // counters the subject had when it left the field
  n?: number;
}

export type WindowThen = 'returnMain' | 'afterDeclare' | 'afterBlock' | 'afterBoost' | 'endMain' | 'afterUpkeep' | 'afterDraw' | 'afterEnd';

/** A round where players may respond at incantation speed, passing clockwise. */
export interface Window {
  holder: PlayerId;
  passes: number;
  then: WindowThen;
}

export type Decision =
  | { kind: 'block'; player: PlayerId; options: Iid[] }
  | { kind: 'boostAttack'; player: PlayerId; options: Iid[] }
  | { kind: 'boostDefense'; player: PlayerId; options: Iid[] }
  | {
      kind: 'confirm';
      player: PlayerId;
      prompt: string;
      cost: number;
      then: Effect[];
      else?: Effect[];
      offerFrom?: PlayerId; // an OFFER from this player
      queue: Effect[];
      ctx: EffectCtx;
    }
  | { kind: 'guide'; player: PlayerId; cards: Iid[]; queue: Effect[]; ctx: EffectCtx }
  | { kind: 'mode'; player: PlayerId; prompt: string; labels: string[]; modes: Effect[][]; queue: Effect[]; ctx: EffectCtx }
  | { kind: 'choosePlayer'; player: PlayerId; prompt: string; options: PlayerId[]; as: string; queue: Effect[]; ctx: EffectCtx }
  | {
      kind: 'choose';
      player: PlayerId;
      prompt: string;
      options: Iid[];
      optional: boolean;
      as: string;
      queue: Effect[];
      ctx: EffectCtx;
    };

export interface Combat {
  attacker: Iid;
  attackerController: PlayerId;
  defender: PlayerId;
  targetCreature: Iid | null; // FACEOFF
  blocker: Iid | null;
  atkBoosters: Iid[];
  defBoosters: Iid[];
  attackNumber: number;
  fizzled?: string; // a creature in this combat left the field (name): the attack does nothing
}

export interface PendingTrigger {
  source: string;
  controller: PlayerId;
  label: string;
  effects: Effect[];
  ctx: EffectCtx;
}

export interface GameState {
  rng: number;
  turn: number;
  active: PlayerId;
  phase: Phase;
  players: Player[];
  cards: Record<Iid, CardInstance>;
  perms: Record<Iid, Permanent>;
  stack: StackItem[]; // last element = top
  window: Window | null;
  decision: Decision | null;
  combat: Combat | null;
  pendingTriggers: PendingTrigger[];
  resolving: boolean;
  nextId: number;
  winner: PlayerId | null;
  log: string[];
  fadedOut?: Permanent[]; // FADE OUT: back at the End Phase
  extraAttacks?: { attacker: Iid; target: PlayerId }[]; // attacks that follow the current one
}

/** One mana spent from a specific place. Leave `pay` out of an action to pay automatically. */
export type PaySource = 'floating' | 'rock' | 'corrupted' | { orb: Iid };

export type Action =
  | { type: 'keep'; player: PlayerId }
  | { type: 'mulligan'; player: PlayerId }
  | { type: 'charge'; player: PlayerId; card: Iid }
  | { type: 'play'; player: PlayerId; card: Iid; targets?: string[]; pay?: PaySource[] }
  | { type: 'activate'; player: PlayerId; card: Iid; ability?: number; pay?: PaySource[] }
  | { type: 'attack'; player: PlayerId; attacker: Iid; target: PlayerId; targetCreature?: Iid }
  | { type: 'block'; player: PlayerId; blocker: Iid | null }
  | { type: 'boost'; player: PlayerId; creatures: Iid[] }
  | { type: 'choose'; player: PlayerId; choice: Iid | null }
  | { type: 'confirm'; player: PlayerId; accept: boolean }
  | { type: 'guide'; player: PlayerId; top: Iid[]; bottom: Iid[] } // top[0] ends up on top of the deck
  | { type: 'mode'; player: PlayerId; index: number }
  | { type: 'choosePlayer'; player: PlayerId; choice: PlayerId }
  | { type: 'pass'; player: PlayerId }
  | { type: 'concede'; player: PlayerId }; // allowed any time: the player is out

export interface PlayerConfig {
  name: string;
  deck: string[]; // card ids
  field?: string | null;
}

export interface GameConfig {
  players: PlayerConfig[];
  seed?: number;
  startingPlayer?: PlayerId;
  validateDecks?: boolean;
}

export class RulesError extends Error {}
