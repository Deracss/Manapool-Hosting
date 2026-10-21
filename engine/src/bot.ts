// A simple bot opponent. It plays sensibly but not cleverly: charge the least useful card, play the
// biggest things it can afford, use abilities, remove threats with Fireball, and attack the weakest player.
import { canAttack } from './engine/combat.ts';
import { apply, whoMustAct } from './engine/game.ts';
import { availableMana } from './engine/mana.ts';
import { activatedOf, attackOf, chargesAllowed, defenseOf, isCreature } from './engine/stats.ts';
import { defOf } from './engine/util.ts';
import { targetOptions } from './engine/effects.ts';
import { hasKeyword } from './engine/stats.ts';
import type { Action, CardDef, GameState, Iid, PlayerId, TargetSpec } from './types.ts';
import { RulesError } from './types.ts';

function legal(s: GameState, a: Action): boolean {
  try {
    apply(s, a);
    return true;
  } catch (e) {
    if (e instanceof RulesError) return false;
    throw e;
  }
}

const PERMANENT = new Set(['Creature', 'Artifact', 'Anthem']);

/** How much the bot wants to keep a card in hand (low = charge it). */
function keepValue(d: CardDef, mana: number): number {
  let v = 0;
  if (d.type === 'Creature') v = 50 + (typeof d.attack === 'number' ? d.attack : 0) * 4 + (d.scripted ? 10 : 0);
  else if (d.scripted) v = 40;
  else if (PERMANENT.has(d.type)) v = 15; // a permanent whose effect doesn't work yet
  else v = 0; // a Spell or Incantation that does nothing yet
  if ((d.cost ?? 0) > mana + 3) v -= 25; // far out of reach
  if (d.script.triggers?.some((t) => t.on === 'charge' && t.subject === 'self')) v -= 30; // charging it does something
  return v;
}

export function botAction(s: GameState): Action {
  const pid = whoMustAct(s);
  if (pid === null) throw new Error('Nobody needs to act.');
  const p = s.players[pid];
  if (s.phase === 'mulligan') return { type: 'keep', player: pid };

  const d = s.decision;
  if (d) {
    if (d.kind === 'block') {
      // Block with a creature that survives (no life lost). When life is low, a creature with exactly
      // enough defense dies but still saves the life point.
      const atk = attackOf(s, s.combat!.attacker);
      const safe = d.options.filter((o) => defenseOf(s, o) > atk).sort((a, b) => creatureScore(s, a) - creatureScore(s, b))[0];
      if (safe) return { type: 'block', player: pid, blocker: safe };
      const lethalish = p.life <= (hasKeyword(s, s.combat!.attacker, 'DOUBLE STRIKE') ? 2 : 1) + 1;
      const chump = d.options.filter((o) => defenseOf(s, o) === atk).sort((a, b) => creatureScore(s, a) - creatureScore(s, b))[0];
      return { type: 'block', player: pid, blocker: lethalish && chump ? chump : null };
    }
    if (d.kind === 'boostAttack') {
      // New creatures can't attack this turn anyway, so they boost.
      return { type: 'boost', player: pid, creatures: d.options.filter((o) => s.perms[o].sick) };
    }
    if (d.kind === 'boostDefense') {
      // Boost just enough to save the blocker, if that's possible.
      const c = s.combat!;
      const defending = c.blocker ?? c.targetCreature;
      if (!defending) return { type: 'boost', player: pid, creatures: [] };
      const need = attackOf(s, c.attacker) + c.atkBoosters.length - defenseOf(s, defending) + 1;
      if (need > 0 && need <= d.options.length) return { type: 'boost', player: pid, creatures: d.options.slice(0, need) };
      return { type: 'boost', player: pid, creatures: [] };
    }
    if (d.kind === 'confirm' && d.offerFrom !== undefined) {
      // OFFERs: take the gift unless the offerer is close to their big Soul rewards; refusing a COMMAND threat is worse.
      const threat = /COMMANDED/.test(d.prompt);
      return { type: 'confirm', player: pid, accept: threat || s.players[d.offerFrom].souls < 9 };
    }
    if (d.kind === 'confirm') return { type: 'confirm', player: pid, accept: p.deck.length > 3 };
    if (d.kind === 'guide') {
      // Keep cards it can play soon on top; send the rest to the bottom.
      const mana = availableMana(s, pid) + 2;
      const top = d.cards.filter((c) => (defOf(s, c).cost ?? 0) <= mana);
      return { type: 'guide', player: pid, top, bottom: d.cards.filter((c) => !top.includes(c)) };
    }
    if (d.kind === 'mode') {
      // In a clash, a defending creature wants defense, an attacker wants attack.
      const c = s.combat;
      const defending = c && [c.blocker, c.targetCreature].some((x) => x && s.perms[x]?.controller === pid);
      const want = defending ? /defen/i : /attack/i;
      const i = d.labels.findIndex((l) => want.test(l));
      return { type: 'mode', player: pid, index: i >= 0 ? i : 0 };
    }
    if (d.kind === 'choosePlayer') {
      const opp = d.options.filter((o) => o !== pid).sort((a, b) => s.players[a].life - s.players[b].life)[0];
      return { type: 'choosePlayer', player: pid, choice: opp ?? d.options[0] };
    }
    // Copied Spells/Incantations: aim at an opponent's creature or card.
    if (d.as === 'copyTarget') {
      const theirs = d.options.find((o) => (s.perms[o]?.controller ?? s.stack.find((it) => it.kind === 'card' && it.iid === o)?.controller) !== pid);
      return { type: 'choose', player: pid, choice: theirs ?? d.options[0] };
    }
    // Harmful choices (damage, destroy) aim at opponents' cards; helpful ones at the bot's own.
    if (/damage|destroy|give you|INFECT/i.test(d.prompt) && !/you control|your /i.test(d.prompt)) {
      const theirs = d.options.filter((o) => s.perms[o] && s.perms[o].controller !== pid).sort((a, b) => attackOf(s, b) - attackOf(s, a));
      if (theirs.length) return { type: 'choose', player: pid, choice: theirs[0] };
    }
    if (/counter|gains|untap/i.test(d.prompt)) {
      const mine = d.options.filter((o) => s.perms[o]?.controller === pid);
      if (mine.length) return { type: 'choose', player: pid, choice: mine[0] };
    }
    // Choices: give up a used Mana Orb before a filled one; otherwise take the first option.
    const usedOrb = d.options.find((o) => p.orbs.some((orb) => orb.iid === o && !orb.filled));
    return { type: 'choose', player: pid, choice: usedOrb ?? d.options[0] ?? null };
  }

  const freeMain = s.phase === 'main' && s.active === pid && !s.window && !s.combat && s.stack.length === 0;
  if (!freeMain) return respond(s, pid) ?? { type: 'pass', player: pid };
  const mana = availableMana(s, pid);

  // 1. Charge the least useful card (one charge per turn, plus extras from cards like Cloudwhisper).
  if (p.chargesThisTurn < chargesAllowed(s, pid) && p.hand.length > 1 && p.orbs.length < 8) {
    const card = [...p.hand].sort((a, b) => keepValue(defOf(s, a), mana) - keepValue(defOf(s, b), mana) || (defOf(s, b).cost ?? 0) - (defOf(s, a).cost ?? 0))[0];
    return { type: 'charge', player: pid, card };
  }

  // Corrupted Mana: bring back the best creature from the discard pile it can pay for.
  if (p.corruptedRocks > 0) {
    const back = p.discard
      .filter((c) => isCreature(s, c) && (defOf(s, c).cost ?? 0) <= p.corruptedRocks)
      .sort((a, b) => (defOf(s, b).cost ?? 0) - (defOf(s, a).cost ?? 0));
    for (const card of back) {
      const a: Action = { type: 'play', player: pid, card };
      if (legal(s, a)) return a;
    }
  }

  // 2. Removal on the biggest threat (held back for small targets, so Incantations stay ready as responses).
  for (const card of p.hand) {
    const d2 = defOf(s, card);
    if (!d2.scripted || !(d2.script.targets?.length) || kindOf(d2) !== 'harm' || d2.script.playCondition) continue;
    const a = bestTargets(s, pid, card, 'harm', d2.type === 'Incantation' ? 3 : 2);
    if (a && legal(s, a)) return a;
  }

  // 3. Play the most expensive affordable permanent; working cards before ones whose effect isn't scripted yet.
  const rank = (d2: CardDef) => (d2.type === 'Creature' ? 2 : d2.scripted ? 1 : 0);
  const permanents = p.hand
    .filter((c) => PERMANENT.has(defOf(s, c).type))
    .sort((a, b) => rank(defOf(s, b)) - rank(defOf(s, a)) || (defOf(s, b).cost ?? 0) - (defOf(s, a).cost ?? 0));
  for (const card of permanents) {
    const a: Action = { type: 'play', player: pid, card };
    if (legal(s, a)) return a;
  }

  // 4. Scripted spells that need no target (Mana Ramp, Cosmic Channeling…).
  for (const card of p.hand) {
    const d2 = defOf(s, card);
    if (!d2.scripted || PERMANENT.has(d2.type) || (d2.script.targets?.length ?? 0) > 0 || d2.script.playCondition) continue;
    const a: Action = { type: 'play', player: pid, card };
    if (legal(s, a)) return a;
  }

  // 5. Use tap and once-per-turn abilities of cards that aren't good attackers.
  for (const card of p.field) {
    const abs = activatedOf(s, card);
    for (let i = 0; i < abs.length; i++) {
      if (!abs[i].cost.tap && !abs[i].oncePerTurn) continue;
      // Don't throw away its own cards for no reason (Gravebound Martyr, Morbid Manipulator, Dark Dealings...).
      if (JSON.stringify(abs[i].effects).match(/"do":"(destroy|toDiscard|destroyOrb|sacrifice)"/)) continue;
      // Don't throw away its own cards for no reason (Gravebound Martyr, Morbid Manipulator, Dark Dealings...).
      if (JSON.stringify(abs[i].effects).match(/"do":"(destroy|toDiscard|destroyOrb|sacrifice)"/)) continue;
      if (isCreature(s, card) && abs[i].cost.tap && attackOf(s, card) >= 2 && canAttack(s, card)) continue;
      // Safety: never use the same ability more than 3 times in one turn.
      const tag = `activates ${defOf(s, card).name}: ${abs[i].label}`;
      if (s.log.filter((l) => l.startsWith(`[T${s.turn}]`) && l.includes(tag)).length >= 3) continue;
      const a: Action = { type: 'activate', player: pid, card, ability: i };
      if (legal(s, a)) return a;
    }
  }

  // 6. Attack: finish off a player who's close, otherwise hit the leader where no blocker can stop it.
  const attackers = p.field.filter((c) => isCreature(s, c) && canAttack(s, c) && attackOf(s, c) > 0).sort((a, b) => attackOf(s, b) - attackOf(s, a));
  for (const attacker of attackers) {
    const atk = attackOf(s, attacker);
    const opponents = s.players.filter((o) => o.id !== pid && !o.eliminated);
    const walls = (o: { id: PlayerId }) => s.players[o.id].field.filter((c) => isCreature(s, c) && !s.perms[c].tapped && defenseOf(s, c) > atk).length;
    const hits = hasKeyword(s, attacker, 'DOUBLE STRIKE') ? 2 : 1;
    const kill = opponents.filter((o) => o.life <= hits && (walls(o) === 0 || hasKeyword(s, attacker, 'EVASIVE')))[0];
    // FACEOFF: knock out a creature it can beat.
    if (!kill && hasKeyword(s, attacker, 'FACEOFF')) {
      const prey = opponents
        .flatMap((o) => s.players[o.id].field.filter((c) => isCreature(s, c) && defenseOf(s, c) <= atk).map((c) => ({ o, c })))
        .sort((a, b) => creatureScore(s, b.c) - creatureScore(s, a.c))[0];
      if (prey && creatureScore(s, prey.c) >= 6) return { type: 'attack', player: pid, attacker, target: prey.o.id, targetCreature: prey.c };
    }
    const open = opponents.filter((o) => walls(o) === 0 || hasKeyword(s, attacker, 'EVASIVE'));
    const pool = open.length ? open : [];
    const target = kill ?? pool.sort((a, b) => leaderScore(s, b.id) - leaderScore(s, a.id) || seatDistance(s, pid, a.id) - seatDistance(s, pid, b.id))[0];
    if (target) return { type: 'attack', player: pid, attacker, target: target.id };
  }
  return { type: 'pass', player: pid };
}

function seatDistance(s: GameState, from: PlayerId, to: PlayerId): number {
  return (to - from + s.players.length) % s.players.length;
}

// ---------- judging cards and the table ----------

type Kind = 'harm' | 'help' | 'negate' | 'other';

/** What a card's effect does to its target. */
function kindOf(d: CardDef): Kind {
  const js = JSON.stringify(d.script.resolve ?? []);
  if (/"do":"negate"/.test(js)) return 'negate';
  if (/"do":"(destroy|damage|override|infect|toDeckBottom|gainControl|fadeOut)"/.test(js)) return 'harm';
  if (/"do":"(grant|pump|counter|chooseMode)"/.test(js)) return 'help';
  return 'other';
}

function kindOfItem(s: GameState, it: GameState['stack'][number]): Kind {
  if (it.kind === 'card') return kindOf(defOf(s, it.iid));
  const js = JSON.stringify(it.effects);
  if (/"do":"(destroy|damage|infect|gainControl)"/.test(js)) return 'harm';
  return 'other';
}

function creatureScore(s: GameState, iid: Iid): number {
  if (!s.perms[iid]) return 0;
  return attackOf(s, iid) * 2 + defenseOf(s, iid) + (defOf(s, iid).script.keywords?.length ?? 0) + (defOf(s, iid).cost ?? 0) / 2;
}

/** How far ahead a player is: life, board and Souls. */
function leaderScore(s: GameState, pid: PlayerId): number {
  const p = s.players[pid];
  return p.life * 3 + p.field.filter((c) => isCreature(s, c)).reduce((n, c) => n + attackOf(s, c), 0) * 2 + p.souls + p.orbs.length;
}

/** Targets for a card: harmful ones hit the strongest enemy, helpful ones your strongest creature, sacrifices your weakest. */
function bestTargets(s: GameState, pid: PlayerId, card: Iid, kind: Kind, minScore: number, prefer?: Iid): Action | null {
  const specs: TargetSpec[] = defOf(s, card).script.targets ?? [];
  const picked: string[] = [];
  for (const spec of specs) {
    const opts = targetOptions(s, spec, pid, card).filter((t) => !picked.includes(t));
    let choice: string | undefined;
    if (spec.sacrifice) choice = opts.filter((t) => s.perms[t]?.controller === pid).sort((a, b) => creatureScore(s, a) - creatureScore(s, b))[0];
    else if (prefer && opts.includes(prefer)) choice = prefer;
    else if (kind === 'harm') choice = opts.filter((t) => s.perms[t] && s.perms[t].controller !== pid && creatureScore(s, t) >= minScore).sort((a, b) => creatureScore(s, b) - creatureScore(s, a))[0];
    else if (kind === 'help') choice = opts.filter((t) => s.perms[t]?.controller === pid).sort((a, b) => creatureScore(s, b) - creatureScore(s, a))[0];
    else if (kind === 'negate') choice = opts.find((t) => s.stack.some((it) => it.kind === 'card' && it.iid === t && it.controller !== pid));
    if (!choice) return null;
    picked.push(choice);
  }
  // Don't sacrifice something better than what it destroys.
  if (specs.some((sp) => sp.sacrifice) && picked.length === 2 && creatureScore(s, picked[0]) + 2 > creatureScore(s, picked[1])) return null;
  return { type: 'play', player: pid, card, targets: picked };
}

/** With priority outside its own Main phase: protect its creatures, counter threats, win clashes. */
function respond(s: GameState, pid: PlayerId): Action | null {
  const p = s.players[pid];
  const quick = p.hand.filter((c) => {
    const d = defOf(s, c);
    return d.scripted && (d.type === 'Incantation' || d.speed === 'incantation' || hasKeyword(s, c, 'FLASH'));
  });
  if (!quick.length) return null;
  const top = s.stack[s.stack.length - 1];
  if (top && top.controller !== pid) {
    const targets = top.kind === 'card' ? top.targets : top.ctx.targets;
    const mine = targets.filter((t) => s.perms[t]?.controller === pid && isCreature(s, t));
    const threat = kindOfItem(s, top) === 'harm' && mine.length > 0;
    for (const card of quick) {
      const k = kindOf(defOf(s, card));
      let a: Action | null = null;
      if (threat && k === 'help') a = bestTargets(s, pid, card, 'help', 0, mine.sort((x, y) => creatureScore(s, y) - creatureScore(s, x))[0]);
      else if (k === 'negate' && top.kind === 'card' && (threat || (defOf(s, top.iid).cost ?? 0) >= 4)) a = bestTargets(s, pid, card, 'negate', 0, top.iid);
      if (a && legal(s, a)) return a;
    }
    return null;
  }
  // In a clash with nothing on the stack: save its blocker, or push its attacker through.
  const c = s.combat;
  if (!top && c && s.window?.then === 'afterBoost') {
    const defending = c.blocker ?? c.targetCreature;
    const atk = attackOf(s, c.attacker) + c.atkBoosters.length;
    const def = defending ? defenseOf(s, defending) + c.defBoosters.length : 0;
    let focus: Iid | null = null;
    if (defending && s.perms[defending]?.controller === pid && atk >= def && atk - def < 3) focus = defending;
    if (c.attackerController === pid && defending && atk < def && def - atk < 3) focus = c.attacker;
    if (!focus) return null;
    for (const card of quick) {
      if (kindOf(defOf(s, card)) !== 'help') continue;
      const a = bestTargets(s, pid, card, 'help', 0, focus);
      if (a && legal(s, a)) return a;
    }
  }
  return null;
}
