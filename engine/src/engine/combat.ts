// Combat: one attacker at a time, during the attacking player's Main phase.
// Declare → responses → block → responses → attacker boosts → defender boosts → responses → resolution.
// Boosts go to a creature: the attacker, or the defending creature (blocker or FACEOFF target).
import type { GameState, Iid, PlayerId } from '../types.ts';
import { emit } from './events.ts';
import { attackOf, boostValue, defenseOf, hasKeyword, hasStatic, isCreature } from './stats.ts';
import { openRound } from './stack.ts';
import { fail, log, nameOf, onField, player, pname } from './util.ts';
import { checkState, destroy, drawCards, loseLife, tapPerm } from './zones.ts';

export function canAttack(s: GameState, iid: Iid): boolean {
  const perm = s.perms[iid];
  return !!perm && isCreature(s, iid) && !perm.tapped && (!perm.sick || hasKeyword(s, iid, 'HASTE'));
}

export function declareAttack(s: GameState, pid: PlayerId, attacker: Iid, target: PlayerId, targetCreature?: Iid, forced = false): void {
  const perm = s.perms[attacker];
  if (!perm || perm.controller !== pid) fail('You can only attack with your own creature on the field.');
  if (!isCreature(s, attacker)) fail(`${nameOf(s, attacker)} is not a creature.`);
  if (!forced && perm.tapped) fail(`${nameOf(s, attacker)} is tapped.`);
  if (!forced && perm.sick && !hasKeyword(s, attacker, 'HASTE')) fail(`${nameOf(s, attacker)} has summoning sickness.`);
  if (target === pid || player(s, target).eliminated) fail('Choose a living opponent as the target.');
  if (targetCreature) {
    if (!hasKeyword(s, attacker, 'FACEOFF')) fail('Only a creature with FACEOFF can attack a creature.');
    if (s.perms[targetCreature]?.controller !== target || !isCreature(s, targetCreature)) fail("The target creature must be on that opponent's field.");
  }

  const p = player(s, pid);
  p.attacksThisTurn++;
  s.combat = {
    attacker,
    attackerController: pid,
    defender: target,
    targetCreature: targetCreature ?? null,
    blocker: null,
    atkBoosters: [],
    defBoosters: [],
    attackNumber: p.attacksThisTurn,
  };
  log(s, `${p.name} attacks ${pname(s, target)}${targetCreature ? `'s ${nameOf(s, targetCreature)}` : ''} with ${nameOf(s, attacker)}.`);
  if (!hasKeyword(s, attacker, 'VIGILANCE')) {
    tapPerm(s, attacker);
    emit(s, { name: 'tappedToAttack', subject: attacker, player: pid });
  }
  emit(s, { name: 'attackDeclared', subject: attacker, player: pid, attackNumber: p.attacksThisTurn });
  if (targetCreature) announceClash(s, attacker, targetCreature);
  openRound(s, 'afterDeclare');
}

/** After responses to the attack: the defender may block. */
/** The attack does nothing if a creature in it left the field. */
function fizzle(s: GameState): boolean {
  const c = s.combat;
  if (!c?.fizzled) return false;
  log(s, `The attack fizzles: ${c.fizzled} left the field.`);
  endCombat(s);
  return true;
}

export function afterDeclare(s: GameState): void {
  const c = s.combat;
  if (!c || fizzle(s)) return;
  if (!onField(s, c.attacker) || player(s, c.defender).eliminated) return endCombat(s);
  if (c.targetCreature || hasKeyword(s, c.attacker, 'EVASIVE')) return askAttackBoost(s);
  const options = untappedCreatures(s, c.defender, []);
  if (!options.length) return askAttackBoost(s);
  s.decision = { kind: 'block', player: c.defender, options };
}

/** After responses to the block: boosting. */
export function afterBlock(s: GameState): void {
  const c = s.combat;
  if (!c || fizzle(s)) return;
  if (!onField(s, c.attacker) || player(s, c.defender).eliminated) return endCombat(s);
  askAttackBoost(s);
}

export function chooseBlocker(s: GameState, blocker: Iid | null): void {
  const c = s.combat!;
  s.decision = null;
  if (blocker) {
    c.blocker = blocker;
    log(s, `${pname(s, c.defender)} blocks with ${nameOf(s, blocker)}.`);
    tapPerm(s, blocker); // blocking taps the blocker
    emit(s, { name: 'blocked', subject: c.attacker, player: c.attackerController, other: blocker });
    announceClash(s, c.attacker, blocker);
  } else {
    log(s, `${pname(s, c.defender)} does not block.`);
  }
  openRound(s, 'afterBlock');
}

/** Both creatures in a clash fire "ON CLASH" abilities (they resolve before combat damage). */
function announceClash(s: GameState, a: Iid, b: Iid): void {
  emit(s, { name: 'clash', subject: a, other: b, player: s.perms[a].controller });
  emit(s, { name: 'clash', subject: b, other: a, player: s.perms[b].controller });
}

function untappedCreatures(s: GameState, pid: PlayerId, exclude: (Iid | null)[]): Iid[] {
  return player(s, pid).field.filter((iid) => isCreature(s, iid) && !s.perms[iid].tapped && !exclude.includes(iid));
}

function askAttackBoost(s: GameState): void {
  const c = s.combat!;
  const options = untappedCreatures(s, c.attackerController, [c.attacker]);
  if (!options.length) return applyAttackBoost(s, []);
  s.decision = { kind: 'boostAttack', player: c.attackerController, options };
}

/** Taps boosters (summoning sickness does not matter) and fires their boost events. */
function tapBoosters(s: GameState, boosters: Iid[], boosted: Iid | null, side: string): void {
  for (const b of boosters) {
    const perm = s.perms[b];
    tapPerm(s, b);
    perm.flags.boostedThisTurn = true;
    log(s, `${nameOf(s, b)} boosts the ${side}.`);
    emit(s, { name: 'boost', subject: b, player: perm.controller, attacker: boosted ?? undefined });
  }
}

export function applyAttackBoost(s: GameState, boosters: Iid[]): void {
  const c = s.combat!;
  s.decision = null;
  c.atkBoosters = boosters;
  if (boosters.length) s.perms[c.attacker].flags.wasBoostedThisTurn = true;
  tapBoosters(s, boosters, c.attacker, 'attack');
  const defending = onField(s, c.blocker) ? c.blocker : onField(s, c.targetCreature) ? c.targetCreature : null;
  // With no defending creature there is nothing to boost on defense.
  const options = defending ? untappedCreatures(s, c.defender, [defending]) : [];
  if (!options.length) return applyDefenseBoost(s, []);
  s.decision = { kind: 'boostDefense', player: c.defender, options };
}

export function applyDefenseBoost(s: GameState, boosters: Iid[]): void {
  const c = s.combat!;
  s.decision = null;
  c.defBoosters = boosters;
  const defending = c.blocker ?? c.targetCreature;
  if (boosters.length && defending && s.perms[defending]) s.perms[defending].flags.wasBoostedThisTurn = true;
  tapBoosters(s, boosters, defending, 'defense');
  emit(s, { name: 'attackBoosted', subject: c.attacker, player: c.attackerController, boosters: c.atkBoosters });
  openRound(s, 'afterBoost');
}

/** Compares attack and defense and applies the result. */
export function resolveCombat(s: GameState): void {
  const c = s.combat;
  if (!c || fizzle(s)) return;
  if (!onField(s, c.attacker) || player(s, c.defender).eliminated) return endCombat(s);

  const defending = onField(s, c.blocker) ? c.blocker : onField(s, c.targetCreature) ? c.targetCreature : null;
  const clash = !!defending;
  const liveAtkBoosters = c.atkBoosters.filter((b) => onField(s, b));
  let atk = attackOf(s, c.attacker) + liveAtkBoosters.reduce((sum, b) => sum + boostValue(s, b), 0);
  if (clash && hasStatic(s, c.attacker, 'clashDouble')) atk *= 2;
  const def = (defending ? defenseOf(s, defending) : 0) + c.defBoosters.filter((b) => onField(s, b)).length;
  const critical = hasKeyword(s, c.attacker, 'CRITICAL') || liveAtkBoosters.some((b) => hasKeyword(s, b, 'CRITICAL BOOST'));
  player(s, c.attackerController).attackLog.push({ cardId: s.cards[c.attacker].cardId, atk });
  log(s, `Combat: ${nameOf(s, c.attacker)} attacks with ${atk} against ${defending ? `${nameOf(s, defending)}'s` : 'a'} defense of ${def}.`);

  let defenderDied = false;
  if (atk >= def && defending) {
    defenderDied = destroy(s, defending, 'destroyed in the clash');
    if (defenderDied) emit(s, { name: 'clashKill', subject: c.attacker, player: c.attackerController });
  }
  if (atk > def) {
    const lost = hasKeyword(s, c.attacker, 'DOUBLE STRIKE') ? 2 : 1;
    loseLife(s, c.defender, lost);
    const ap = player(s, c.attackerController);
    ap.hitsThisTurn.push({ iid: c.attacker, cardId: s.cards[c.attacker].cardId });
    s.perms[c.attacker].flags.dealtPlayerDamageThisTurn = true;
    if (critical) log(s, `CRITICAL: ${pname(s, c.defender)} does not draw.`);
    else drawCards(s, c.defender, 1);
    emit(s, { name: 'playerDamaged', subject: c.attacker, player: c.attackerController, target: c.defender, n: lost });
  } else if (atk < def) {
    log(s, 'The attack is stopped.');
  }
  emit(s, { name: 'combatResult', subject: c.attacker, player: c.attackerController, target: c.defender, kind: c.blocker ? 'blocked' : 'unblocked' });

  // DMG GAIN: a creature that survives a clash gets +1/+1.
  if (clash) {
    for (const [iid, other] of [[c.attacker, defending], [defenderDied ? null : defending, c.attacker]] as const) {
      if (onField(s, iid)) emit(s, { name: 'clashSurvived', subject: iid, other: other ?? undefined, player: s.perms[iid].controller });
      if (onField(s, iid) && hasKeyword(s, iid, 'DMG GAIN')) {
        const perm = s.perms[iid];
        perm.counters++;
        perm.counterAtk++;
        perm.counterDef++;
        log(s, `${nameOf(s, iid)} survives the clash and gets +1/+1 (DMG GAIN).`);
        emit(s, { name: 'counterAdded', subject: iid, player: perm.controller, kind: 'DMG GAIN' });
      }
    }
  }
  endCombat(s);
}

function endCombat(s: GameState): void {
  for (const perm of Object.values(s.perms)) perm.mods = perm.mods.filter((m) => m.until !== 'battle');
  const defender = s.combat?.defender;
  s.combat = null;
  checkState(s);
  if (s.phase === 'over') return;
  // Deathly Reconjurer: a returned Zombie makes its own attack at the same target.
  const next = s.extraAttacks?.shift();
  if (next && defender !== undefined) {
    const perm = s.perms[next.attacker];
    if (perm && isCreature(s, next.attacker) && !player(s, next.target).eliminated) {
      declareAttack(s, perm.controller, next.attacker, next.target, undefined, true);
      return;
    }
  }
  if (s.pendingTriggers.length) openRound(s, 'returnMain');
}
