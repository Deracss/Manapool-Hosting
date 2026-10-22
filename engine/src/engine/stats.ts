// Card characteristics on the field: types, tribes, keywords, attack, defense, abilities, filters.
import type { ActivatedAbility, Filter, GameState, Iid, Keyword, PlayerId, StaticAbility } from '../types.ts';
import { getDef } from '../cards/registry.ts';
import { controllerOf, defOf, inst, player } from './util.ts';

/** Constructs count as Artifacts too (the Precon Essentials list Augmenter Drone as "Creature/Artifact"). */
export const CONSTRUCTS_ARE_ARTIFACTS = true;

/** Arsen: while equipped, it is an Artifact and not a Creature. */
function equippedAsArtifact(s: GameState, iid: Iid): boolean {
  return !!s.perms[iid]?.attachedTo && (defOf(s, iid).script.statics ?? []).some((a) => a.kind === 'equipAsArtifact');
}

export function isCreature(s: GameState, iid: Iid): boolean {
  const d = defOf(s, iid);
  if (equippedAsArtifact(s, iid)) return false;
  return d.type === 'Creature' || (d.type === 'Token' && d.attack !== null && d.attack !== undefined);
}

export function isArtifact(s: GameState, iid: Iid): boolean {
  const d = defOf(s, iid);
  if (equippedAsArtifact(s, iid)) return true;
  if (inst(s, iid).override?.alsoArtifact) return true;
  return d.type === 'Artifact' || (CONSTRUCTS_ARE_ARTIFACTS && (d.tribe === 'Construct' || (d.type === 'Token' && d.id === 'construct-token')));
}

function isType(s: GameState, iid: Iid, type: string): boolean {
  if (type === 'Creature') return isCreature(s, iid);
  if (type === 'Artifact') return isArtifact(s, iid);
  return defOf(s, iid).type === type;
}

/** Every static ability currently in play, with the permanent it comes from. */
function staticsInPlay(s: GameState): { src: Iid; controller: PlayerId; ab: StaticAbility }[] {
  const out: { src: Iid; controller: PlayerId; ab: StaticAbility }[] = [];
  for (const p of s.players) {
    if (p.eliminated) continue;
    for (const iid of p.field) for (const ab of defOf(s, iid).script.statics ?? []) out.push({ src: iid, controller: p.id, ab });
    if (p.fieldCard) for (const ab of getDef(p.fieldCard).script.statics ?? []) out.push({ src: `field:${p.id}`, controller: p.id, ab });
  }
  // Abilities that need a number of Souls (Demon Field).
  return out.filter(({ controller, ab }) => !('minSouls' in ab) || ab.minSouls === undefined || player(s, controller).souls >= ab.minSouls);
}

export function keywordsOf(s: GameState, iid: Iid, depth = 0): Keyword[] {
  const c = inst(s, iid);
  const kws = new Set<Keyword>([...(defOf(s, iid).script.keywords ?? []), ...c.extraKeywords]);
  const perm = s.perms[iid];
  if (perm) {
    for (const m of perm.mods) if (m.keyword) kws.add(m.keyword);
    for (const { src, controller, ab } of staticsInPlay(s)) {
      if (ab.kind === 'grantKeyword' && matches(s, iid, ab.filter, controller, src)) kws.add(ab.keyword);
      if (ab.kind === 'equipped' && ab.keyword && s.perms[src]?.attachedTo === iid) kws.add(ab.keyword);
      if (ab.kind === 'inheritKeywords' && src === iid && depth < 2) {
        for (const other of listMatching(s, ab.filter, controller, src)) for (const k of keywordsOf(s, other, depth + 1)) kws.add(k);
      }
    }
  }
  return [...kws];
}

export function hasKeyword(s: GameState, iid: Iid, k: Keyword): boolean {
  return keywordsOf(s, iid).includes(k);
}

export function hasTribe(s: GameState, iid: Iid, tribe: string): boolean {
  const d = defOf(s, iid);
  if (d.tribe === tribe) return true;
  // SHAPESHIFTER from the card itself (not from other cards' effects, which would loop back here).
  return (d.script.keywords ?? []).includes('SHAPESHIFTER') || inst(s, iid).extraKeywords.includes('SHAPESHIFTER');
}

/** The card's own activated abilities plus any granted to it (Mana Harmonics). */
/** Abilities used from your hand (the card goes to your discard pile as the cost). */
export function handAbilitiesOf(s: GameState, iid: Iid): ActivatedAbility[] {
  return (defOf(s, iid).script.activated ?? []).filter((a) => a.fromHand);
}

export function activatedOf(s: GameState, iid: Iid): ActivatedAbility[] {
  const own = (defOf(s, iid).script.activated ?? []).filter((a) => !a.fromHand);
  const granted: ActivatedAbility[] = [];
  if (s.perms[iid]) for (const { src, controller, ab } of staticsInPlay(s)) if (ab.kind === 'grantAbility' && matches(s, iid, ab.filter, controller, src)) granted.push(ab.ability);
  const all = [...own, ...granted];
  if (s.perms[iid] && keywordsOf(s, iid).includes('RECONFIGURE')) all.push({ label: 'RECONFIGURE: untap', cost: {}, reconfigure: true, effects: [] });
  return all;
}

function baseStat(s: GameState, iid: Iid, which: 'attack' | 'defense'): number {
  const d = defOf(s, iid);
  const v = d[which];
  if (typeof v === 'number') return v;
  const perm = s.perms[iid];
  const fromCount = (d.script.statics ?? []).find((a) => a.kind === 'statsFromCount');
  if (perm && fromCount && fromCount.kind === 'statsFromCount') return listMatching(s, fromCount.per, perm.controller, iid).length;
  return 0;
}

/** Confused Knight: a swapped creature's attack is what its defense would be (buffs included), and the other way round. */
export function attackOf(s: GameState, iid: Iid): number {
  if (s.perms[iid]?.swapped) return rawDefense(s, iid);
  return rawAttack(s, iid);
}

export function defenseOf(s: GameState, iid: Iid): number {
  const perm = s.perms[iid];
  if (perm?.swapped) return rawAttack(s, iid) - perm.damage;
  return rawDefense(s, iid) - (perm?.damage ?? 0);
}

function rawAttack(s: GameState, iid: Iid): number {
  const perm = s.perms[iid];
  let atk = baseStat(s, iid, 'attack');
  if (!perm) return atk;
  atk += perm.counterAtk;
  for (const m of perm.mods) atk += m.atk;
  for (const { src, controller, ab } of staticsInPlay(s)) {
    if (ab.kind === 'buff' && matches(s, iid, ab.filter, controller, src)) atk += ab.atk;
    if (ab.kind === 'equipped' && ab.atk && s.perms[src]?.attachedTo === iid) atk += ab.atk;
    if (ab.kind === 'selfAtkPerCount' && src === iid) atk += ab.atk * listMatching(s, ab.per, controller, src).length;
  }
  return atk;
}

function rawDefense(s: GameState, iid: Iid): number {
  const perm = s.perms[iid];
  let def = baseStat(s, iid, 'defense');
  if (!perm) return def;
  def += perm.counterDef;
  for (const m of perm.mods) def += m.def;
  for (const { src, controller, ab } of staticsInPlay(s)) {
    if (ab.kind === 'buff' && matches(s, iid, ab.filter, controller, src)) def += ab.def;
    if (ab.kind === 'equipped' && ab.def && s.perms[src]?.attachedTo === iid) def += ab.def;
  }
  return def;
}

/** How much attack one booster adds when it boosts its controller's attack. */
export function boostValue(s: GameState, booster: Iid): number {
  let v = 1;
  for (const { src, controller, ab } of staticsInPlay(s)) {
    if (ab.kind === 'boostBonus' && matches(s, booster, ab.filter, controller, src)) v += ab.extra;
  }
  return v;
}

/** Total attack added by boosters, with Tavern's bonus for a booster of the attacker's own tribe. */
export function attackBoostTotal(s: GameState, attacker: Iid, boosters: Iid[]): number {
  const live = boosters.filter((b) => s.perms[b]);
  return live.reduce((n, b) => n + boostValue(s, b), 0) + tavernBonus(s, attacker, live);
}

/** Total defense added by boosters (+1 each), with Tavern's bonus. */
export function defenseBoostTotal(s: GameState, defending: Iid | null, boosters: Iid[]): number {
  const live = boosters.filter((b) => s.perms[b]);
  return live.length + (defending ? tavernBonus(s, defending, live) : 0);
}

/** Tavern: the first boost a creature gets in a battle from a creature of its own tribe counts for 1 more (per Tavern). */
function tavernBonus(s: GameState, target: Iid, boosters: Iid[]): number {
  const perm = s.perms[target];
  const tribe = perm ? defOf(s, target).tribe : undefined;
  if (!perm || !tribe || !boosters.some((b) => hasTribe(s, b, tribe))) return 0;
  return player(s, perm.controller).field.filter((iid) => hasStatic(s, iid, 'tavernBoost')).length;
}

/** Magic Shield: the creature can't be targeted by card effects of `viewer` when `viewer` is an opponent of its controller. */
export function shieldedFrom(s: GameState, iid: Iid, viewer: PlayerId): boolean {
  const perm = s.perms[iid];
  if (!perm || perm.controller === viewer) return false;
  return Object.values(s.perms).some((o) => o.attachedTo === iid && hasStatic(s, o.iid, 'shield'));
}

/** Book of Spells: `pid` may play Spells as Incantations (they count as both). */
export function spellsAsIncantations(s: GameState, pid: PlayerId): boolean {
  return player(s, pid).field.some((iid) => hasStatic(s, iid, 'spellsAsIncantations'));
}

/** Discount on a card `pid` is about to play, from cards like Tavern and Foundry Stone. */
export function costReductionFor(s: GameState, pid: PlayerId, card: Iid): number {
  let n = 0;
  for (const { src, controller, ab } of staticsInPlay(s)) {
    if (ab.kind !== 'costReduction' || controller !== pid || !matches(s, card, { ...ab.filter, controller: undefined }, pid, src)) continue;
    if (ab.firstPerTurn && ab.filter.type && player(s, pid).typesPlayedThisTurn.includes(ab.filter.type)) continue;
    n += ab.amount;
  }
  const d = defOf(s, card);
  for (const r of player(s, pid).costReductions) if (r.turn === s.turn && (!r.tribe || d.tribe === r.tribe) && d.type === 'Creature') n += r.amount;
  return n;
}

/** How many cards `pid` may charge each turn. */
export function chargesAllowed(s: GameState, pid: PlayerId): number {
  let n = 1;
  for (const iid of player(s, pid).field) for (const ab of defOf(s, iid).script.statics ?? []) if (ab.kind === 'extraCharge') n += ab.n;
  return n;
}

export function hasStatic(s: GameState, iid: Iid, kind: StaticAbility['kind']): boolean {
  return (defOf(s, iid).script.statics ?? []).some((a) => a.kind === kind);
}

/** Does card `iid` match `f`, judged from the point of view of `viewer` (and source card `src`)? Zone is not checked. */
export function matches(s: GameState, iid: Iid, f: Filter, viewer: PlayerId, src?: string): boolean {
  const d = defOf(s, iid);
  const ctrl = controllerOf(s, iid);
  if (f.controller === 'you' && ctrl !== viewer) return false;
  if (f.controller === 'opponent' && ctrl === viewer) return false;
  if (f.type && !isType(s, iid, f.type)) return false;
  if (f.tribe && !hasTribe(s, iid, f.tribe)) return false;
  if (f.other && iid === src) return false;
  if (f.maxCost !== undefined && (d.cost ?? 0) > f.maxCost) return false;
  if (f.minCost !== undefined && (d.cost ?? 0) < f.minCost) return false;
  if (f.nonToken && inst(s, iid).isToken) return false;
  const perm = s.perms[iid];
  if (f.flag && !perm?.flags[f.flag]) return false;
  if (f.untapped && (!perm || perm.tapped)) return false;
  if (f.tapped && (!perm || !perm.tapped)) return false;
  if (f.hasCounters && (!perm || perm.counters === 0)) return false;
  if (f.types && !f.types.some((t) => isType(s, iid, t))) return false;
  if (f.keywordRef && !new RegExp(`\\b${f.keywordRef}\\b`).test(d.text)) return false;
  if (f.statCounters && (!perm || (!perm.counterAtk && !perm.counterDef))) return false;
  if (f.token && !inst(s, iid).isToken) return false;
  if (f.equipment && !(d.script.statics ?? []).some((a) => a.kind === 'equipped')) return false;
  if (f.atkAbovePrinted !== undefined && (!perm || attackOf(s, iid) - baseStat(s, iid, 'attack') < f.atkAbovePrinted)) return false;
  return true;
}

/** All cards in the filter's zone (default: the field) that match it. */
export function listMatching(s: GameState, f: Filter, viewer: PlayerId, src?: string): Iid[] {
  const zone = f.zone ?? 'field';
  let pool: Iid[];
  if (zone === 'field') pool = s.players.filter((p) => !p.eliminated).flatMap((p) => p.field);
  else {
    // Hidden zones are only searched for their owner unless the filter says otherwise.
    const owners = f.controller === 'opponent' ? s.players.filter((p) => p.id !== viewer) : f.controller === 'any' ? s.players : [player(s, viewer)];
    if (zone === 'orbs') pool = owners.flatMap((p) => p.orbs.filter((o) => f.orbFilled === undefined || o.filled === f.orbFilled).map((o) => o.iid));
    else pool = owners.flatMap((p) => p[zone]);
  }
  return pool.filter((iid) => matches(s, iid, { ...f, controller: zone === 'field' ? f.controller : undefined }, viewer, src));
}

/** Arcane Foundry: you can tap your Artifacts for 1 mana each when playing an Artifact. */
export function artifactsPayForArtifacts(s: GameState, pid: PlayerId): boolean {
  return player(s, pid).field.some((iid) => defOf(s, iid).id === 'arcane-foundry');
}
