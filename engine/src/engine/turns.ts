// Turn structure: Untap → Upkeep → Draw → Main → End Phase.
// Upkeep, Draw and End each have a response window; the active player gets priority first.
import type { GameState, PlayerId } from '../types.ts';
import { emit } from './events.ts';
import { refillOrbs } from './mana.ts';
import { openRound } from './stack.ts';
import { log, nextAlive, player } from './util.ts';
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
  }
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
  returnFaded(s);
  resolveInfections(s, s.active);
  emit(s, { name: 'endPhase', player: s.active });
  openRound(s, 'afterEnd');
}

export function afterEnd(s: GameState): void {
  for (const perm of Object.values(s.perms)) {
    perm.mods = perm.mods.filter((m) => m.until === 'permanent');
    perm.damage = 0;
  }
  for (const p of s.players) p.floating = 0;
  beginTurn(s, nextAlive(s, s.active));
}
