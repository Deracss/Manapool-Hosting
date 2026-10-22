// Turn structure: Untap → Upkeep → Draw → Main → End Phase.
// Upkeep, Draw and End each have a response window; the active player gets priority first.
import type { GameState, PlayerId } from '../types.ts';
import { emit } from './events.ts';
import { refillOrbs } from './mana.ts';
import { openRound } from './stack.ts';
import { log, nameOf, nextAlive, player } from './util.ts';
import { drawCards, resolveInfections, returnFaded, untapPerm } from './zones.ts';

export function beginTurn(s: GameState, pid: PlayerId): void {
  s.turn++;
  s.active = pid;
  for (const p of s.players) {
    p.chargesThisTurn = 0;
    p.onceFlags = [];
    p.artifactTapsThisTurn = 0;
    p.typesPlayedThisTurn = [];
    p.abilityDiscount = 0;
    p.attacksThisTurn = 0;
    p.hitsThisTurn = [];
    p.attackLog = [];
    p.creatureTapAbilities = 0;
    p.discardPlays = 0;
    p.battled = [];
    p.unblockedAttacks = 0;
  }
  // Tombstone marks last until the End Phase of their player's next turn.
  for (const m of player(s, pid).marked ?? []) m.armed = true;
  for (const perm of Object.values(s.perms)) {
    perm.flags = { boostedThisTurn: false, wasBoostedThisTurn: false, dealtPlayerDamageThisTurn: false, attackedThisTurn: false };
    perm.abilitiesUsed = [];
  }
  log(s, `--- ${player(s, pid).name}'s turn ---`);
  // Untap
  for (const perm of Object.values(s.perms)) {
    if (perm.controller === pid) {
      perm.sick = false;
      perm.reconfigured = false;
      perm.roundUsed = [];
      if (perm.infectedBy !== undefined) perm.infectArmed = true;
      untapPerm(s, perm.iid, 'untapStep');
    }
  }
  // Upkeep: Mana Orbs refill, then upkeep triggers
  s.phase = 'upkeep';
  refillOrbs(s, pid);
  emit(s, { name: 'upkeep', player: pid });
  openRound(s, 'afterUpkeep');
}

/** Draw step: draw a card, then players may respond before Main. */
export function afterUpkeep(s: GameState): void {
  drawCards(s, s.active, 1);
  if (s.phase === 'over' || player(s, s.active).eliminated) return;
  emit(s, { name: 'drawStep', player: s.active });
  openRound(s, 'afterDraw');
}

export function afterDraw(s: GameState): void {
  s.phase = 'main';
  if (s.pendingTriggers.length) openRound(s, 'returnMain');
}

/** The active player passed with nothing left to do in their Main phase. */
export function endMain(s: GameState): void {
  s.phase = 'end';
  for (const p of s.players) p.discardPlays = 0; // Graveyard: "until the End Phase"
  const ap = player(s, s.active);
  if (ap.marked?.some((m) => m.armed)) {
    ap.marked = ap.marked.filter((m) => !m.armed);
    log(s, `${ap.name}'s Tombstone mark ends.`);
  }
  returnFaded(s);
  resolveInfections(s, s.active);
  emit(s, { name: 'endPhase', player: s.active });
  openRound(s, 'afterEnd');
}

export function afterEnd(s: GameState): void {
  // Cards that left during the End Phase itself (Blink, FADE OUT) still come back before the turn ends.
  if (s.fadedOut?.length) returnFaded(s);
  for (const perm of Object.values(s.perms)) {
    perm.mods = perm.mods.filter((m) => m.until === 'permanent');
    perm.damage = 0;
    // Shifting Relic: the copy ends.
    const c = s.cards[perm.iid];
    if (c.override?.untilEndOfTurn) {
      c.override = undefined;
      log(s, `${nameOf(s, perm.iid)} turns back.`);
    }
  }
  for (const p of s.players) p.floating = 0;
  beginTurn(s, nextAlive(s, s.active));
}
