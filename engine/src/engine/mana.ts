// The mana pool: Mana Orbs (charged cards, refilled each Upkeep), Mana Rocks and Corrupted Mana Rocks
// (tokens, used once), and floating mana (added by effects, gone at end of turn).
import type { GameState, PaySource, PlayerId } from '../types.ts';
import { fail, log, nameOf, player } from './util.ts';
import { isArtifact, isCreature } from './stats.ts';
import { tapPerm } from './zones.ts';

/** What may pay a cost: normal mana, only Corrupted Mana, or both (Graveyard). */
export type PayMode = 'normal' | 'corruptedOnly' | 'any';

/** Mana you can spend. Corrupted Mana only counts for creatures played from your discard pile. */
export function availableMana(s: GameState, pid: PlayerId, mode: PayMode = 'normal'): number {
  const p = player(s, pid);
  if (mode === 'corruptedOnly') return p.corruptedRocks;
  return p.floating + p.orbs.filter((o) => o.filled).length + p.rocks + (mode === 'any' ? p.corruptedRocks : 0);
}

/**
 * Pays `n` mana. With `pay`, spends exactly the listed sources (one mana each).
 * Without it, pays automatically: floating mana, then Mana Orbs, then Corrupted Mana Rocks, then Mana Rocks.
 */
export function payMana(s: GameState, pid: PlayerId, n: number, pay?: PaySource[], artifactTaps = false, mode: PayMode = 'normal'): void {
  const p = player(s, pid);
  // Arcane Foundry: untapped Artifacts tap for 1 mana each (used last, only when the rest isn't enough).
  if (artifactTaps && !pay && mode !== 'corruptedOnly' && availableMana(s, pid, mode) < n) {
    const tappable = p.field.filter((iid) => isArtifact(s, iid) && !s.perms[iid].tapped && !isCreature(s, iid));
    const creatures = p.field.filter((iid) => isArtifact(s, iid) && !s.perms[iid].tapped && isCreature(s, iid));
    for (const iid of [...tappable, ...creatures]) {
      if (availableMana(s, pid, mode) >= n) break;
      tapPerm(s, iid);
      p.floating += 1;
      log(s, `${p.name} taps ${nameOf(s, iid)} for 1 mana (Arcane Foundry).`);
    }
  }
  if (n <= 0) {
    if (pay?.length) fail('This costs nothing, so there is nothing to pay.');
    return;
  }
  if (pay) {
    if (pay.length !== n) fail(`This costs ${n} mana; you chose ${pay.length}.`);
    // Check everything first so a bad choice changes nothing.
    const need = { floating: 0, rock: 0, corrupted: 0 };
    const orbs = new Set<string>();
    for (const src of pay) {
      if (typeof src === 'object') {
        const orb = p.orbs.find((o) => o.iid === src.orb);
        if (!orb || !orb.filled || orbs.has(src.orb)) fail('That Mana Orb is not available.');
        orbs.add(src.orb);
      } else need[src]++;
    }
    if (need.floating > p.floating) fail('Not enough floating mana.');
    if (need.rock > p.rocks) fail('Not enough Mana Rocks.');
    if (need.corrupted > p.corruptedRocks) fail('Not enough Corrupted Mana Rocks.');
    if (need.corrupted && mode === 'normal') fail('Corrupted Mana can only pay for creatures played from your discard pile.');
    if (mode === 'corruptedOnly' && need.corrupted !== n) fail('A creature played from your discard pile must be paid with Corrupted Mana.');
    p.floating -= need.floating;
    p.rocks -= need.rock;
    p.corruptedRocks -= need.corrupted;
    for (const o of p.orbs) if (orbs.has(o.iid)) o.filled = false;
  } else {
    if (availableMana(s, pid, mode) < n) fail(`${p.name} needs ${n} ${mode === 'corruptedOnly' ? 'Corrupted Mana' : 'mana'} but has ${availableMana(s, pid, mode)}.`);
    let left = n;
    const take = (have: number) => {
      const used = Math.min(have, left);
      left -= used;
      return used;
    };
    if (mode !== 'normal') p.corruptedRocks -= take(p.corruptedRocks);
    p.floating -= take(p.floating);
    for (const o of p.orbs) {
      if (left > 0 && o.filled) {
        o.filled = false;
        left--;
      }
    }
    p.rocks -= take(p.rocks);
  }
  log(s, `${p.name} pays ${n} mana.`);
}

export function refillOrbs(s: GameState, pid: PlayerId): void {
  const p = player(s, pid);
  let skip = p.skipRefill;
  for (const o of p.orbs) {
    if (!o.filled && skip > 0) {
      skip--;
      continue;
    }
    o.filled = true;
  }
  if (p.skipRefill) log(s, `${p.name} has ${p.skipRefill} Mana Orb${p.skipRefill === 1 ? '' : 's'} that don't refill this Upkeep.`);
  p.skipRefill = 0;
}
