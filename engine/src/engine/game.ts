// Public API: createGame(config) and apply(state, action).
// apply() never mutates its input: it works on a copy and returns the new state, or throws RulesError.
import { getDef } from '../cards/registry.ts';
import type { Action, GameConfig, GameState, Iid, PaySource, Player, PlayerId, StackItem, TargetSpec } from '../types.ts';
import { RulesError } from '../types.ts';
import { emit } from './events.ts';
import { applyAttackBoost, applyDefenseBoost, chooseBlocker, declareAttack } from './combat.ts';
import { evalCondition, runQueue, targetOptions } from './effects.ts';
import { payMana } from './mana.ts';
import type { PayMode } from './mana.ts';
import { addToStack, continueAfterChoice, continueAfterChoosePlayer, continueAfterConfirm, continueAfterGuide, continueAfterMode, openRound, passPriority } from './stack.ts';
import { activatedOf, handAbilitiesOf, artifactsPayForArtifacts, chargesAllowed, costReductionFor, hasKeyword, isArtifact, isCreature, spellsAsIncantations } from './stats.ts';
import { beginTurn } from './turns.ts';
import { alive, defOf, fail, log, nameOf, newInstance, nextAlive, player, pname, random, shuffle } from './util.ts';
import { chargeCard, checkState, destroy, drawCards, tapPerm, untapPerm } from './zones.ts';

export const STARTING_LIFE = 7;
export const STARTING_HAND = 7;
export const DECK_SIZE = 60;

export function validateDeck(deck: string[]): string[] {
  const problems: string[] = [];
  if (deck.length !== DECK_SIZE) problems.push(`Deck has ${deck.length} cards; it needs exactly ${DECK_SIZE}.`);
  const seen = new Set<string>();
  for (const id of deck) {
    const d = getDef(id);
    if (d.type === 'Token' || d.type === 'Mana Token' || d.type === 'Field') problems.push(`${d.name} can't go in a deck.`);
    if (seen.has(id)) problems.push(`Only 1 copy of ${d.name} is allowed.`);
    seen.add(id);
  }
  return problems;
}

export function createGame(config: GameConfig): GameState {
  if (config.players.length < 2) throw new RulesError('A game needs at least 2 players.');
  const s: GameState = {
    rng: config.seed ?? 1,
    turn: 0,
    active: config.startingPlayer ?? 0,
    phase: 'mulligan',
    players: [],
    cards: {},
    perms: {},
    stack: [],
    window: null,
    decision: null,
    combat: null,
    pendingTriggers: [],
    resolving: false,
    nextId: 1,
    winner: null,
    log: [],
  };
  config.players.forEach((pc, id) => {
    if (config.validateDecks !== false) {
      const problems = validateDeck(pc.deck);
      if (problems.length) throw new RulesError(`${pc.name}: ${problems.join(' ')}`);
    }
    if (pc.field && getDef(pc.field).type !== 'Field') throw new RulesError(`${pc.field} is not a Field.`);
    const p: Player = {
      id,
      name: pc.name,
      life: STARTING_LIFE,
      deck: [],
      hand: [],
      discard: [],
      field: [],
      orbs: [],
      rocks: 0,
      corruptedRocks: 0,
      floating: 0,
      souls: 0,
      fieldCard: pc.field ?? null,
      eliminated: false,
      mulligan: 'pending',
      mulliganUsed: false,
      chargesThisTurn: 0,
      costReductions: [],
      onceFlags: [],
      artifactTapsThisTurn: 0,
      typesPlayedThisTurn: [],
      skipRefill: 0,
      abilityDiscount: 0,
      attacksThisTurn: 0,
      hitsThisTurn: [],
      attackLog: [],
      creatureTapAbilities: 0,
      discardPlays: 0,
    };
    s.players.push(p);
    for (const cardId of pc.deck) p.deck.push(newInstance(s, cardId, id).iid);
    shuffle(s, p.deck);
  });
  for (const p of s.players) drawCards(s, p.id, STARTING_HAND);
  if (config.rollForFirst) {
    s.roll = { round: 1, contenders: s.players.map((p) => p.id), results: s.players.map(() => null), history: [], done: false };
    log(s, 'Everyone rolls a D20; the highest goes first.');
  }
  log(s, 'Opening hands drawn. Each player may keep or mulligan once.');
  return s;
}

/** Who the game is waiting on right now (null when the game is over). */
export function whoMustAct(s: GameState): PlayerId | null {
  if (s.phase === 'over') return null;
  if (s.phase === 'mulligan' && s.roll && !s.roll.done) return rollPending(s)[0] ?? null;
  if (s.phase === 'mulligan') return s.players.find((p) => p.mulligan === 'pending')?.id ?? null;
  if (s.decision) return s.decision.player;
  if (s.window) return s.window.holder;
  return s.active;
}

export function apply(state: GameState, action: Action): GameState {
  const s = structuredClone(state);
  if (s.phase === 'over') fail('The game is over.');
  s.reveals = [];
  s.flips = [];
  if (player(s, action.player).eliminated) fail(`${pname(s, action.player)} has been eliminated.`);
  dispatch(s, action);
  settle(s);
  return s;
}

function dispatch(s: GameState, a: Action): void {
  if (a.type === 'concede') {
    // Out of the game right away, wherever it stands; settle() removes them like any other elimination.
    const p = player(s, a.player);
    p.conceded = true;
    p.life = 0;
    return;
  }
  if (s.phase === 'mulligan' && s.roll && !s.roll.done) {
    if (a.type !== 'roll') fail('Roll the D20 first.');
    return rollStep(s, a.player);
  }
  if (s.phase === 'mulligan') {
    if (a.type !== 'keep' && a.type !== 'mulligan') fail('Everyone must keep or mulligan first.');
    return mulliganStep(s, a.player, a.type === 'mulligan');
  }
  const d = s.decision;
  if (d) {
    if (d.player !== a.player) fail(`Waiting for ${pname(s, d.player)} to decide.`);
    if (d.kind === 'block' && a.type === 'block') {
      if (a.blocker !== null && !d.options.includes(a.blocker)) fail('That creature cannot block.');
      return chooseBlocker(s, a.blocker);
    }
    if ((d.kind === 'boostAttack' || d.kind === 'boostDefense') && a.type === 'boost') {
      if (new Set(a.creatures).size !== a.creatures.length || a.creatures.some((x) => !d.options.includes(x))) fail('Those creatures cannot boost.');
      return d.kind === 'boostAttack' ? applyAttackBoost(s, a.creatures) : applyDefenseBoost(s, a.creatures);
    }
    if (d.kind === 'choose' && a.type === 'choose') return continueAfterChoice(s, a.choice);
    if (d.kind === 'confirm' && a.type === 'confirm') return continueAfterConfirm(s, a.accept);
    if (d.kind === 'guide' && a.type === 'guide') return continueAfterGuide(s, a.top, a.bottom);
    if (d.kind === 'mode' && a.type === 'mode') return continueAfterMode(s, a.index);
    if (d.kind === 'choosePlayer' && a.type === 'choosePlayer') return continueAfterChoosePlayer(s, a.choice);
    fail(`A ${d.kind} decision is pending.`);
  }
  switch (a.type) {
    case 'pass':
      if (s.window) return passPriority(s, a.player);
      if (!isFreeMain(s, a.player)) fail('You cannot pass right now.');
      // Ending the Main phase gives everyone else a last chance to respond.
      log(s, `${pname(s, a.player)} ends their Main phase.`);
      s.window = { holder: nextAlive(s, a.player), passes: 1, then: 'endMain' };
      if (alive(s).length === 1) passPriority(s, a.player);
      return;
    case 'charge':
      return charge(s, a.player, a.card);
    case 'play':
      return play(s, a.player, a.card, a.targets ?? [], a.pay);
    case 'activate':
      return activate(s, a.player, a.card, a.ability ?? 0, a.pay);
    case 'attack':
      if (!isFreeMain(s, a.player)) fail('You can only attack during your own Main phase when nothing else is happening.');
      return declareAttack(s, a.player, a.attacker, a.target, a.targetCreature);
    default:
      fail(`You can't ${a.type} right now.`);
  }
}

/** Triggers waiting outside of a window go on the stack, and the active player's elimination ends their turn. */
function settle(s: GameState): void {
  checkState(s);
  if (s.phase === 'over' || s.phase === 'mulligan') return;
  if (player(s, s.active).eliminated && !s.resolving) {
    s.stack = [];
    s.window = null;
    s.decision = null;
    s.combat = null;
    s.pendingTriggers = [];
    beginTurn(s, nextAlive(s, s.active));
    return;
  }
  if (s.pendingTriggers.length && !s.window && !s.decision && !s.resolving) openRound(s, 'returnMain');
}

/** Players who still have to roll this round. */
export function rollPending(s: GameState): PlayerId[] {
  const r = s.roll;
  if (!r || r.done) return [];
  return r.contenders.filter((pid) => r.results[pid] === null && !player(s, pid).eliminated);
}

function rollStep(s: GameState, pid: PlayerId): void {
  const r = s.roll!;
  if (!r.contenders.includes(pid)) fail(`${pname(s, pid)} is not rolling this round.`);
  if (r.results[pid] !== null) fail(`${pname(s, pid)} already rolled.`);
  const value = 1 + Math.floor(random(s) * 20);
  r.results[pid] = value;
  r.history.push({ round: r.round, player: pid, value });
  log(s, `${pname(s, pid)} rolls ${value}${r.round > 1 ? ' (reroll)' : ''}.`);
  if (rollPending(s).length) return;
  const live = r.contenders.filter((q) => !player(s, q).eliminated);
  const best = Math.max(...live.map((q) => r.results[q] ?? 0));
  const top = live.filter((q) => r.results[q] === best);
  if (top.length === 1) {
    r.done = true;
    s.active = top[0];
    log(s, `${pname(s, top[0])} goes first.`);
    return;
  }
  log(s, `Tie at ${best}: ${top.map((q) => pname(s, q)).join(' and ')} roll again.`);
  r.round++;
  r.contenders = top;
  r.results = s.players.map(() => null);
}

function mulliganStep(s: GameState, pid: PlayerId, mulligan: boolean): void {
  const p = player(s, pid);
  if (p.mulligan !== 'pending') fail(`${p.name} has already kept their hand.`);
  if (mulligan) {
    p.deck.push(...p.hand);
    p.hand = [];
    shuffle(s, p.deck);
    p.mulliganUsed = true;
    log(s, `${p.name} mulligans.`);
    drawCards(s, pid, STARTING_HAND - 1);
  } else {
    log(s, `${p.name} keeps.`);
  }
  p.mulligan = 'kept';
  if (s.players.every((q) => q.mulligan === 'kept')) beginTurn(s, s.active);
}

/** Active player, Main phase, nothing on the stack, nobody else deciding: spell-speed actions are allowed. */
function isFreeMain(s: GameState, pid: PlayerId): boolean {
  return s.phase === 'main' && s.active === pid && !s.window && !s.decision && !s.combat && s.stack.length === 0;
}

function canActAtIncantationSpeed(s: GameState, pid: PlayerId): boolean {
  return isFreeMain(s, pid) || (!!s.window && s.window.holder === pid && !s.decision);
}

function charge(s: GameState, pid: PlayerId, card: Iid): void {
  const p = player(s, pid);
  if (!isFreeMain(s, pid)) fail('You can only charge mana during your own Main phase.');
  const allowed = chargesAllowed(s, pid);
  if (p.chargesThisTurn >= allowed) fail(allowed === 1 ? 'You have already charged this turn.' : `You have already charged ${allowed} times this turn.`);
  if (!p.hand.includes(card)) fail('That card is not in your hand.');
  p.chargesThisTurn++;
  chargeCard(s, pid, card, 'hand');
}

function costOf(s: GameState, pid: PlayerId, card: Iid): number {
  const d = defOf(s, card);
  let cost = d.cost ?? 0;
  const alt = d.script.altCost;
  if (alt && evalCondition(s, alt.condition, { source: card, controller: pid, targets: [], vars: {} })) cost = Math.min(cost, alt.cost);
  return Math.max(0, cost - costReductionFor(s, pid, card));
}

function play(s: GameState, pid: PlayerId, card: Iid, targets: string[], pay?: PaySource[]): void {
  const p = player(s, pid);
  // From the discard pile: a creature paid with Corrupted Mana, or any card with Graveyard's permission.
  const fromDiscard = p.discard.includes(card);
  if (!p.hand.includes(card) && !fromDiscard) fail('That card is not in your hand.');
  const d = defOf(s, card);
  let mode: PayMode = 'normal';
  const mark = fromDiscard ? (p.marked ?? []).find((m) => m.iid === card) : undefined;
  if (fromDiscard) {
    if (mark) mode = 'any'; // Tombstone: pay its cost
    else if (p.discardPlays > 0) mode = 'any';
    else if (isCreature(s, card)) mode = 'corruptedOnly';
    else fail('Only creatures can be played from your discard pile (paid with Corrupted Mana).');
  }
  if (d.type === 'Field' || d.type === 'Token' || d.type === 'Mana Token') fail(`${d.name} can't be played.`);
  const incantationSpeed = d.type === 'Incantation' || d.speed === 'incantation' || hasKeyword(s, card, 'FLASH') || (d.type === 'Spell' && spellsAsIncantations(s, pid));
  if (incantationSpeed ? !canActAtIncantationSpeed(s, pid) : !isFreeMain(s, pid)) {
    fail(incantationSpeed ? 'You do not have priority.' : `${d.name} can only be played during your own Main phase with nothing on the stack.`);
  }
  const ctx = { source: card, controller: pid, targets, vars: {} };
  if (d.script.playCondition && !evalCondition(s, d.script.playCondition, ctx)) {
    fail(`${d.name} can't be played right now${d.script.playCondition && 'clashInProgress' in d.script.playCondition ? ' (it needs a clash in progress)' : ''}.`);
  }
  checkTargets(s, d.script.targets ?? [], targets, pid, card);
  const cost = costOf(s, pid, card);
  payMana(s, pid, cost, pay, isArtifact(s, card) && artifactsPayForArtifacts(s, pid), mode);
  if (mark) p.marked = (p.marked ?? []).filter((m) => m !== mark);
  else if (fromDiscard && mode === 'any') p.discardPlays--;
  const p1 = player(s, pid);
  for (const t of [d.type, ...(isArtifact(s, card) ? ['Artifact'] : []), ...(isCreature(s, card) ? ['Creature'] : [])]) if (!p1.typesPlayedThisTurn.includes(t)) p1.typesPlayedThisTurn.push(t);
  // A used one-shot discount (Gravebound Martyr) is spent.
  if (d.type === 'Creature') {
    const p2 = player(s, pid);
    const i = p2.costReductions.findIndex((r) => r.turn === s.turn && (!r.tribe || r.tribe === d.tribe));
    if (i >= 0) p2.costReductions.splice(i, 1);
  }
  p.hand = p.hand.filter((x) => x !== card);
  p.discard = p.discard.filter((x) => x !== card);
  const item: StackItem = { id: s.nextId++, kind: 'card', iid: card, controller: pid, targets };
  log(s, `${p.name} plays ${d.name}${fromDiscard ? ' from the discard pile' : ''}${targets.length ? ` targeting ${targets.map((t) => nameOf(s, t)).join(', ')}` : ''}.`);
  // Sacrifices that are part of the cost happen now, before anyone can respond.
  (d.script.targets ?? []).forEach((spec, i) => {
    if (spec.sacrifice && s.perms[targets[i]]) destroy(s, targets[i], 'sacrificed', true);
  });
  addToStack(s, item, pid);
  emit(s, { name: 'cardPlayed', subject: card, player: pid });
  // Mimicry Magic: your next Spell or Incantation is copied (you may choose new targets).
  const pm = player(s, pid);
  if ((pm.copyNext ?? 0) > 0 && (d.type === 'Spell' || d.type === 'Incantation')) {
    pm.copyNext! -= 1;
    log(s, `Mimicry Magic copies ${d.name}.`);
    runQueue(s, [{ do: 'copyToken', target: 'self' }], { source: card, controller: pid, targets: [], vars: {} });
  }
}

function checkTargets(s: GameState, specs: TargetSpec[], targets: string[], pid: PlayerId, card: Iid): void {
  if (targets.length !== specs.length) fail(`Choose ${specs.length} target${specs.length === 1 ? '' : 's'}.`);
  if (new Set(targets).size !== targets.length) fail('Choose a different card for each target.');
  specs.forEach((spec, i) => {
    if (!targetOptions(s, spec, pid, card).includes(targets[i])) {
      fail(spec.kind === 'stackCard' ? `Target a ${spec.types.join(' or ')} on the stack.` : `That isn't a legal target for ${defOf(s, card).name}.`);
    }
  });
}

/** Abilities printed on a Field (e.g. Demon Field: "Pay 2 SOULS - ..."). `card` is "field:<pid>". */
function activateField(s: GameState, pid: PlayerId, card: string, index: number, pay?: PaySource[]): void {
  const p = player(s, pid);
  if (card !== `field:${pid}` || !p.fieldCard) fail('Activate abilities of your own Field.');
  const ab = (getDef(p.fieldCard).script.activated ?? [])[index];
  if (!ab) fail(`${nameOf(s, card)} has no such ability.`);
  const speed = ab.speed ?? 'incantation';
  if (speed === 'spell' ? !isFreeMain(s, pid) : !canActAtIncantationSpeed(s, pid)) fail('You cannot activate that right now.');
  const flag = `field-ability:${index}`;
  if (ab.oncePerTurn && p.onceFlags.includes(flag)) fail(`${nameOf(s, card)}'s ability can only be used once per turn.`);
  if (ab.cost.souls && p.souls < ab.cost.souls) fail(`You need ${ab.cost.souls} Souls.`);
  const ctx = { source: card, controller: pid, targets: [], vars: {} };
  if (ab.condition && !evalCondition(s, ab.condition, ctx)) fail(`You can't use ${nameOf(s, card)}'s ability right now.`);
  payMana(s, pid, ab.cost.mana ?? 0, pay);
  if (ab.cost.souls) p.souls -= ab.cost.souls;
  if (ab.oncePerTurn) p.onceFlags.push(flag);
  log(s, `${p.name} activates ${nameOf(s, card)}: ${ab.label}.`);
  addToStack(s, { id: s.nextId++, kind: 'ability', source: card, controller: pid, label: ab.label, effects: ab.effects, ctx }, pid);
}

/** An ability used from the hand: the card goes from your hand to your discard pile (the cost), then the effect uses the stack. */
function activateFromHand(s: GameState, pid: PlayerId, card: Iid, index: number, pay?: PaySource[]): void {
  const ab = handAbilitiesOf(s, card)[index];
  if (!ab) fail(`${nameOf(s, card)} has no ability you can use from your hand.`);
  const speed = ab.speed ?? 'incantation';
  if (speed === 'spell' ? !isFreeMain(s, pid) : !canActAtIncantationSpeed(s, pid)) fail('You cannot use that right now.');
  if (ab.condition && !evalCondition(s, ab.condition, { source: card, controller: pid, targets: [], vars: {} })) fail(`You can't use ${nameOf(s, card)} right now.`);
  payMana(s, pid, Math.max(0, ab.cost.mana ?? 0), pay);
  const p = player(s, pid);
  p.hand = p.hand.filter((c) => c !== card);
  p.discard.push(card);
  log(s, `${pname(s, pid)} sends ${nameOf(s, card)} from their hand to the discard pile: ${ab.label}.`);
  const ctx = { source: card, controller: pid, targets: [], vars: {} };
  addToStack(s, { id: s.nextId++, kind: 'ability', source: card, controller: pid, label: ab.label, effects: ab.effects, ctx }, pid);
}

function activate(s: GameState, pid: PlayerId, card: Iid, index: number, pay?: PaySource[]): void {
  if (card.startsWith('field:')) return activateField(s, pid, card, index, pay);
  if (player(s, pid).hand.includes(card)) return activateFromHand(s, pid, card, index, pay);
  const perm = s.perms[card];
  if (!perm || perm.controller !== pid) fail('Activate abilities of your own cards on the field.');
  const ab = activatedOf(s, card)[index];
  if (!ab) fail(`${nameOf(s, card)} has no such ability.`);
  if (ab.reconfigure) {
    if (!canActAtIncantationSpeed(s, pid)) fail('You need priority to RECONFIGURE.');
    if (!perm.tapped) fail(`${nameOf(s, card)} isn't tapped.`);
    if (perm.reconfigured) fail(`${nameOf(s, card)} already used RECONFIGURE this round.`);
    perm.reconfigured = true;
    untapPerm(s, card);
    log(s, `${pname(s, pid)} untaps ${nameOf(s, card)} with RECONFIGURE.`);
    return;
  }
  const speed = ab.speed ?? 'incantation';
  if (speed === 'spell' ? !isFreeMain(s, pid) : !canActAtIncantationSpeed(s, pid)) fail('You cannot activate that right now.');
  if (ab.oncePerTurn && perm.abilitiesUsed.includes(index)) fail(`${nameOf(s, card)}'s ability can only be used once per turn.`);
  if (ab.oncePerRound && perm.roundUsed?.includes(index)) fail(`${nameOf(s, card)}'s ability can only be used once per round (until your next turn).`);
  if (ab.condition && !evalCondition(s, ab.condition, { source: card, controller: pid, targets: [], vars: {} })) fail(`You can't use ${nameOf(s, card)}'s ability right now.`);
  if (ab.cost.tap) {
    if (perm.tapped) fail(`${nameOf(s, card)} is already tapped.`);
    if (perm.sick && isCreature(s, card) && !hasKeyword(s, card, 'HASTE')) fail(`${nameOf(s, card)} has summoning sickness.`);
  }
  if (ab.cost.souls && player(s, pid).souls < ab.cost.souls) fail(`You need ${ab.cost.souls} Souls.`);
  const manaCost = Math.max(0, (ab.cost.mana ?? 0) - player(s, pid).abilityDiscount);
  payMana(s, pid, manaCost, pay);
  if (ab.cost.souls) player(s, pid).souls -= ab.cost.souls;
  if (ab.cost.tap) tapPerm(s, card);
  // Blood Vial counts your creatures using their own Tap abilities.
  const own = defOf(s, card).script.activated ?? [];
  if (ab.cost.tap && isCreature(s, card) && index < own.length) {
    const n = ++player(s, pid).creatureTapAbilities;
    emit(s, { name: 'creatureTapAbility', subject: card, player: pid, n });
  }
  if (ab.oncePerTurn) perm.abilitiesUsed.push(index);
  if (ab.oncePerRound) (perm.roundUsed ??= []).push(index);
  log(s, `${pname(s, pid)} activates ${nameOf(s, card)}: ${ab.label}.`);
  const ctx = { source: card, controller: pid, targets: [], vars: {} };
  addToStack(s, { id: s.nextId++, kind: 'ability', source: card, controller: pid, label: ab.label, effects: ab.effects, ctx }, pid);
}

