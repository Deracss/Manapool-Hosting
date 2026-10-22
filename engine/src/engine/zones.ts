// Moving cards between zones, and the state checks that run after every action.
import { getDef } from '../cards/registry.ts';
import type { GameState, Iid, Keyword, Permanent, PlayerId, StatOverride } from '../types.ts';
import { emit } from './events.ts';
import { defenseOf, hasKeyword, isArtifact, isCreature } from './stats.ts';
import { alive, defOf, inst, log, nameOf, newInstance, player, pname } from './util.ts';

export function drawCards(s: GameState, pid: PlayerId, n: number): void {
  const p = player(s, pid);
  if (p.eliminated) return;
  for (let i = 0; i < n; i++) {
    if (p.eliminated) return;
    const top = p.deck.shift();
    if (!top) {
      eliminate(s, pid, 'had to draw from an empty deck');
      return;
    }
    p.hand.push(top);
  }
  if (n > 0) log(s, `${p.name} draws ${n} card${n === 1 ? '' : 's'}.`);
}

export function enterField(s: GameState, iid: Iid, controller: PlayerId): void {
  player(s, controller).field.push(iid);
  s.perms[iid] = {
    iid,
    controller,
    tapped: false,
    sick: true,
    enteredTurn: s.turn,
    counters: 0,
    counterAtk: 0,
    counterDef: 0,
    countersFrom: {},
    damage: 0,
    mods: [],
    flags: { boostedThisTurn: false, wasBoostedThisTurn: false, dealtPlayerDamageThisTurn: false, attackedThisTurn: false },
    abilitiesUsed: [],
    memo: [],
  };
  log(s, `${nameOf(s, iid)} enters ${pname(s, controller)}'s field.`);
  emit(s, { name: 'etb', subject: iid, player: controller });
}

export function createTokens(s: GameState, controller: PlayerId, tokenId: string, n: number, keywords: Keyword[] = [], override?: StatOverride): Iid[] {
  const tribe = override?.tribe ?? getDef(tokenId).tribe;
  // Replacement effects such as Grukza add to the number created.
  for (const iid of player(s, controller).field) {
    for (const r of defOf(s, iid).script.replacements ?? []) {
      if (r.kind === 'extraTokens' && r.tribe === tribe && n > 0) n += r.extra;
    }
  }
  const made: Iid[] = [];
  for (let i = 0; i < n; i++) {
    const c = newInstance(s, tokenId, controller, true);
    c.extraKeywords = [...keywords];
    if (override) c.override = { ...override };
    made.push(c.iid);
    enterField(s, c.iid, controller);
  }
  return made;
}

/** Removes a permanent from the field (to its owner's discard pile, or `to`). Tokens cease to exist. */
export function leaveField(s: GameState, iid: Iid, to: 'discard' | 'none' = 'discard'): PlayerId {
  const perm = s.perms[iid];
  const ctrl = perm.controller;
  const p = player(s, ctrl);
  p.field = p.field.filter((x) => x !== iid);
  delete s.perms[iid];
  const c = inst(s, iid);
  if (!c.isToken && to === 'discard') player(s, c.owner).discard.push(iid);
  // A creature that leaves a combat (even if it comes right back) ends that attack: it fizzles.
  noteLeftCombat(s, iid);
  // Cards attached to it (equipment) stay on the field unattached; overrides end when a card leaves.
  for (const other of Object.values(s.perms)) if (other.attachedTo === iid) delete other.attachedTo;
  if (!c.isToken) c.override = undefined;
  emit(s, { name: 'leftField', subject: iid, player: ctrl, counters: { n: perm.counters, atk: perm.counterAtk, def: perm.counterDef } });
  return ctrl;
}

/** Destroys a permanent. Returns false if it could not be destroyed. */
export function destroy(s: GameState, iid: Iid, why = 'destroyed', ignoreIndestructible = false): boolean {
  if (!s.perms[iid]) return false;
  if (!ignoreIndestructible && hasKeyword(s, iid, 'INDESTRUCTIBLE')) {
    log(s, `${nameOf(s, iid)} is INDESTRUCTIBLE and survives.`);
    return false;
  }
  const name = nameOf(s, iid);
  const infectedBy = s.perms[iid].infectedBy;
  const ctrl = leaveField(s, iid);
  log(s, `${name} is ${why}.`);
  // INFECT (Krr'ask): an infected creature that is destroyed becomes a 1/1 Zombie Token for the infecting player.
  if (infectedBy !== undefined && !player(s, infectedBy).eliminated) {
    createTokens(s, infectedBy, 'zombie-token', 1);
    log(s, `The INFECTION rises: ${pname(s, infectedBy)} gets a 1/1 Zombie Token.`);
  }
  emit(s, { name: 'destroyed', subject: iid, player: ctrl });
  return true;
}

/** Taps a permanent and fires "whenever this becomes tapped". Returns false if it was already tapped. */
export function tapPerm(s: GameState, iid: Iid): boolean {
  const perm = s.perms[iid];
  if (!perm || perm.tapped) return false;
  perm.tapped = true;
  if (isArtifact(s, iid)) player(s, perm.controller).artifactTapsThisTurn++;
  emit(s, { name: 'tapped', subject: iid, player: perm.controller });
  return true;
}

export function untapPerm(s: GameState, iid: Iid, kind?: 'untapStep'): boolean {
  const perm = s.perms[iid];
  if (!perm || !perm.tapped) return false;
  perm.tapped = false;
  emit(s, { name: 'untapped', subject: iid, player: perm.controller, kind });
  return true;
}

/** A card in any discard pile comes onto `controller`'s field. */
export function returnFromDiscard(s: GameState, iid: Iid, controller: PlayerId, tapped = false): boolean {
  const owner = player(s, inst(s, iid).owner);
  if (!owner.discard.includes(iid)) return false;
  owner.discard = owner.discard.filter((x) => x !== iid);
  enterField(s, iid, controller);
  if (tapped) s.perms[iid].tapped = true;
  emit(s, { name: 'fromDiscard', subject: iid, player: controller });
  return true;
}

export function gainControl(s: GameState, iid: Iid, to: PlayerId): void {
  const perm = s.perms[iid];
  if (!perm || perm.controller === to) return;
  player(s, perm.controller).field = player(s, perm.controller).field.filter((x) => x !== iid);
  player(s, to).field.push(iid);
  perm.controller = to;
  perm.sick = true;
  log(s, `${pname(s, to)} gains control of ${nameOf(s, iid)}.`);
}

export function moveToDeckBottom(s: GameState, iid: Iid): void {
  const c = inst(s, iid);
  const p = player(s, c.owner);
  if (s.perms[iid]) leaveField(s, iid, 'none');
  for (const zone of ['deck', 'discard', 'hand'] as const) p[zone] = p[zone].filter((x) => x !== iid);
  p.orbs = p.orbs.filter((o) => o.iid !== iid);
  p.deck.push(iid);
}

export function moveToHand(s: GameState, iid: Iid, reveal: boolean): void {
  const c = inst(s, iid);
  const p = player(s, c.owner);
  if (s.perms[iid]) leaveField(s, iid);
  for (const zone of ['deck', 'discard', 'hand'] as const) p[zone] = p[zone].filter((x) => x !== iid);
  p.orbs = p.orbs.filter((o) => o.iid !== iid);
  p.hand.push(iid);
  log(s, `${p.name} ${reveal ? `reveals ${nameOf(s, iid)} and puts it` : 'puts a card'} into their hand.`);
}

/** A card from `pid`'s hand or deck becomes a face-down Mana Orb (filled). Fires the charge event. */
export function chargeCard(s: GameState, pid: PlayerId, iid: Iid, from: 'hand' | 'deck'): void {
  const p = player(s, pid);
  p[from] = p[from].filter((x) => x !== iid);
  p.orbs.push({ iid, filled: true });
  log(s, `${p.name} charges ${from === 'deck' ? 'the top card of their deck' : 'a card'} as a filled Mana Orb (${p.orbs.length} in pool).`);
  emit(s, { name: 'charge', subject: iid, player: pid });
}

/** A Mana Orb's card goes to its owner's discard pile. */
export function destroyOrb(s: GameState, iid: Iid): void {
  for (const p of s.players) {
    if (p.orbs.some((o) => o.iid === iid)) {
      p.orbs = p.orbs.filter((o) => o.iid !== iid);
      p.discard.push(iid);
      log(s, `${p.name}'s Mana Orb (${nameOf(s, iid)}) is destroyed.`);
      return;
    }
  }
}

export function loseLife(s: GameState, pid: PlayerId, n: number): void {
  const p = player(s, pid);
  p.life -= n;
  log(s, `${p.name} loses ${n} life (${p.life} left).`);
}

export function eliminate(s: GameState, pid: PlayerId, why: string): void {
  const p = player(s, pid);
  if (p.eliminated) return;
  p.eliminated = true;
  log(s, `${p.name} is eliminated: ${why}.`);
  // Assumption: an eliminated player's permanents and stack items leave the game with them.
  for (const iid of [...p.field]) leaveField(s, iid);
  s.stack = s.stack.filter((it) => it.controller !== pid);
  s.pendingTriggers = s.pendingTriggers.filter((t) => t.controller !== pid);
  if (s.window && s.window.holder === pid) s.window.holder = (pid + 1) % s.players.length;
  const left = alive(s);
  if (left.length === 1) {
    s.winner = left[0];
    s.phase = 'over';
    s.window = null;
    s.decision = null;
    s.combat = null;
    log(s, `${pname(s, left[0])} is the last player standing and wins!`);
  }
}

/** Creatures at 0 defense or less are destroyed; players at 0 life are eliminated. Repeats until stable. */
export function checkState(s: GameState): void {
  for (let guard = 0; guard < 50; guard++) {
    let changed = false;
    for (const iid of Object.keys(s.perms)) {
      if (s.perms[iid] && isCreature(s, iid) && defenseOf(s, iid) <= 0 && !hasKeyword(s, iid, 'INDESTRUCTIBLE')) {
        destroy(s, iid, 'destroyed (no defense left)');
        changed = true;
      }
    }
    for (const p of s.players) {
      if (!p.eliminated && p.life <= 0) {
        eliminate(s, p.id, p.conceded ? 'conceded' : 'life reached 0');
        changed = true;
      }
    }
    if (!changed) return;
  }
}

/** FADE OUT: the permanent leaves the game until the End Phase. Its counters stay with it. */
export function fadeOut(s: GameState, iid: Iid): void {
  const perm = s.perms[iid];
  if (!perm) return;
  const saved: Permanent = structuredClone(perm);
  noteLeftCombat(s, iid);
  const p = player(s, perm.controller);
  p.field = p.field.filter((x) => x !== iid);
  delete s.perms[iid];
  for (const other of Object.values(s.perms)) if (other.attachedTo === iid) delete other.attachedTo;
  (s.fadedOut ??= []).push(saved);
  emit(s, { name: 'leftField', subject: iid, player: saved.controller, counters: { n: saved.counters, atk: saved.counterAtk, def: saved.counterDef } });
}

/** End Phase: FADED OUT cards come back to their controller's field, untapped, with their counters. */
export function returnFaded(s: GameState): void {
  const back = s.fadedOut ?? [];
  s.fadedOut = [];
  for (const saved of back) {
    const p = player(s, saved.controller);
    if (p.eliminated) continue;
    p.field.push(saved.iid);
    s.perms[saved.iid] = { ...saved, tapped: false, sick: false, damage: 0, mods: [], attachedTo: undefined };
    log(s, `${nameOf(s, saved.iid)} returns to ${p.name}'s field.`);
  }
}

/** INFECT: at the end of its controller's next turn, the creature becomes a 1/1 Zombie under the infecting player's control. */
export function resolveInfections(s: GameState, endingTurnOf: PlayerId): void {
  for (const perm of Object.values(s.perms)) {
    if (perm.infectedBy === undefined || perm.controller !== endingTurnOf || !perm.infectArmed) continue;
    const to = perm.infectedBy;
    perm.infectedBy = undefined;
    perm.infectArmed = undefined;
    if (player(s, to).eliminated) continue;
    const c = inst(s, perm.iid);
    const name = nameOf(s, perm.iid);
    c.override = { name: `Infected ${getDef(c.cardId).name}`, attack: 1, defense: 1, tribe: 'Zombie', type: 'Creature', scriptFrom: null, text: 'INFECTED: a 1/1 Zombie.' };
    c.extraKeywords = [];
    perm.counters = perm.counterAtk = perm.counterDef = 0;
    perm.mods = [];
    gainControl(s, perm.iid, to);
    log(s, `${name} turns into a 1/1 Zombie under ${pname(s, to)}'s control.`);
  }
}

/** If the card was attacking, blocking or the FACEOFF target, the attack fizzles. */
function noteLeftCombat(s: GameState, iid: Iid): void {
  const c = s.combat;
  if (!c || c.fizzled) return;
  if (c.attacker === iid || c.blocker === iid || c.targetCreature === iid) c.fizzled = nameOf(s, iid);
}
