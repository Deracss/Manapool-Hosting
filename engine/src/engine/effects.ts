// The effect interpreter. Effects run from a flat queue so that a choice can pause and resume them.
import type { Condition, Effect, EffectCtx, GameState, Iid, Num, PlayerId, PlayerRef, Ref, TargetSpec } from '../types.ts';
import { attackOf, defenseOf, hasKeyword, hasStatic, hasTribe, isCreature, keywordsOf, listMatching, matches, shieldedFrom, spellsAsIncantations } from './stats.ts';
import {
  chargeCard,
  createTokens,
  destroy,
  destroyOrb,
  drawCards,
  fadeOut,
  gainControl,
  leaveField,
  loseLife,
  moveToDeckBottom,
  moveToHand,
  returnFromDiscard,
  enterField,
  tapPerm,
  untapPerm,
} from './zones.ts';
import { emit } from './events.ts';
import { availableMana } from './mana.ts';
import { getDef } from '../cards/registry.ts';
import { alive, defOf, inst, log, nameOf, newInstance, onField, player, pname, random, shuffle } from './util.ts';

export function resolveRef(s: GameState, ref: Ref, ctx: EffectCtx): Iid | null {
  if (ref === 'self') return ctx.source.startsWith('field:') ? null : ctx.source;
  if (ref === 'attacker') return s.combat?.attacker ?? null;
  if (ref === 'eventSubject') return ctx.event?.subject ?? null;
  if (ref === 'eventOther') return ctx.event?.other ?? null;
  if (ref === 'deckTop') return player(s, ctx.controller).deck[0] ?? null;
  if (ref.startsWith('target:')) return ctx.targets[Number(ref.slice(7))] ?? null;
  if (ref.startsWith('var:')) {
    const v = ctx.vars[ref.slice(4)];
    return typeof v === 'string' ? v : null;
  }
  return null;
}

export function resolvePlayer(s: GameState, ref: PlayerRef | undefined, ctx: EffectCtx): PlayerId | null {
  if (!ref || ref === 'you') return ctx.controller;
  if (ref === 'eventPlayer') return ctx.event?.player ?? null;
  if (ref === 'eventTarget') return ctx.event?.target ?? null;
  if (ref === 'owner') return ctx.source.startsWith('field:') ? Number(ctx.source.slice(6)) : inst(s, ctx.source).owner;
  if (ref.startsWith('controllerOf:')) {
    const iid = resolveRef(s, ref.slice(13) as Ref, ctx);
    if (!iid) return null;
    const item = s.stack.find((it) => it.kind === 'card' && it.iid === iid);
    return item ? item.controller : (s.perms[iid]?.controller ?? inst(s, iid).owner);
  }
  const v = ctx.vars[`p:${ref.slice(5)}`];
  return typeof v === 'number' ? v : null;
}

export function evalNum(s: GameState, n: Num, ctx: EffectCtx): number {
  if (typeof n === 'number') return n;
  if ('count' in n) return listMatching(s, n.count, ctx.controller, ctx.source).length;
  if ('costOf' in n) {
    const iid = resolveRef(s, n.costOf, ctx);
    return iid ? (defOf(s, iid).cost ?? 0) : 0;
  }
  if ('half' in n) return Math.floor(evalNum(s, n.half, ctx) / 2);
  if ('souls' in n) return player(s, ctx.controller).souls;
  if ('mul' in n) return evalNum(s, n.mul[0], ctx) * n.mul[1];
  if ('eventN' in n) return ctx.event?.n ?? 0;
  const v = ctx.vars[n.var];
  return typeof v === 'number' ? v : 0;
}

export function evalCondition(s: GameState, c: Condition, ctx: EffectCtx): boolean {
  if ('and' in c) return c.and.every((x) => evalCondition(s, x, ctx));
  if ('not' in c) return !evalCondition(s, c.not, ctx);
  if ('count' in c) return listMatching(s, c.count, ctx.controller, ctx.source).length >= c.atLeast;
  if ('isYourTurn' in c) return s.active === ctx.controller;
  if ('clashInProgress' in c) return clashInProgress(s);
  if ('selfEnteredThisTurn' in c) return s.perms[ctx.source]?.enteredTurn === s.turn;
  if ('hitsThisTurn' in c) {
    const tribe = c.hitsThisTurn.tribe;
    const hits = player(s, ctx.controller).hitsThisTurn.filter((h) => !tribe || getDef(h.cardId).tribe === tribe);
    return hits.length >= c.atLeast;
  }
  if ('varTribe' in c) {
    const v = ctx.vars[c.varTribe[0]];
    return typeof v === 'string' && hasTribe(s, v, c.varTribe[1]);
  }
  if ('eventBoostersInclude' in c) {
    const tribe = c.eventBoostersInclude.tribe;
    return (ctx.event?.boosters ?? []).some((b) => !tribe || hasTribe(s, b, tribe));
  }
  if ('eventAttackNumber' in c) return ctx.event?.attackNumber === c.eventAttackNumber;
  if ('refType' in c) {
    const iid = resolveRef(s, c.refType[0], ctx);
    return !!iid && c.refType[1].includes(defOf(s, iid).type);
  }
  if ('refTribe' in c) {
    const iid = resolveRef(s, c.refTribe[0], ctx);
    return !!iid && hasTribe(s, iid, c.refTribe[1]);
  }
  if ('hasKeyword' in c) {
    const iid = resolveRef(s, c.hasKeyword[0], ctx);
    return !!iid && hasKeyword(s, iid, c.hasKeyword[1]);
  }
  if ('soulsAtLeast' in c) return player(s, ctx.controller).souls >= c.soulsAtLeast;
  if ('eventPlayerIsYou' in c) return ctx.event?.player === ctx.controller;
  if ('lifeBelow' in c) return player(s, ctx.controller).life < c.lifeBelow;
  if ('varIs' in c) return Number(ctx.vars[c.varIs[0]] ?? 0) === c.varIs[1];
  if ('eventNIs' in c) return (ctx.event?.n ?? 0) === c.eventNIs;
  if ('varAtLeast' in c) return Number(ctx.vars[c.varAtLeast[0]] ?? 0) >= c.varAtLeast[1];
  if ('eventNMultipleOf' in c) return (ctx.event?.n ?? 0) > 0 && (ctx.event?.n ?? 0) % c.eventNMultipleOf === 0;
  if ('varSet' in c) return typeof ctx.vars[c.varSet] === 'string';
  if ('unblockedAttacks' in c) return (player(s, ctx.controller).unblockedAttacks ?? 0) >= c.unblockedAttacks;
  if ('attackTotal' in c) {
    const tribe = c.attackTotal.tribe;
    const total = player(s, ctx.controller).attackLog.filter((a) => !tribe || getDef(a.cardId).tribe === tribe).reduce((sum, a) => sum + a.atk, 0);
    return total >= c.atLeast;
  }
  if ('limitPerTurn' in c) {
    const key = `${ctx.source}:${c.limitPerTurn}`;
    const flags = player(s, ctx.controller).onceFlags;
    const used = flags.filter((f) => f === key).length;
    if (used >= c.n) return false;
    flags.push(key);
    return true;
  }
  if ('memo' in c) {
    const perm = s.perms[ctx.source];
    if (!perm || perm.memo.includes(c.memo)) return false;
    perm.memo.push(c.memo);
    return true;
  }
  if ('selfCounters' in c) return (s.perms[ctx.source]?.counters ?? 0) >= c.selfCounters;
  if ('eventKind' in c) return ctx.event?.kind === c.eventKind;
  if ('artifactTaps' in c) {
    const n = player(s, ctx.controller).artifactTapsThisTurn;
    return c.exactly ? n === c.artifactTaps : n >= c.artifactTaps;
  }
  if ('onceFlag' in c) {
    const key = `${ctx.source}:${c.onceFlag}`;
    const flags = player(s, ctx.controller).onceFlags;
    if (flags.includes(key)) return false;
    flags.push(key);
    return true;
  }
  return false;
}

export function clashInProgress(s: GameState): boolean {
  const c = s.combat;
  return !!c && onField(s, c.attacker) && (onField(s, c.blocker) || onField(s, c.targetCreature));
}

/** Every legal choice for a target slot, seen by `controller`. */
export function targetOptions(s: GameState, spec: TargetSpec, controller: PlayerId, source?: string): Iid[] {
  if (spec.kind === 'stackCard') {
    return s.stack.flatMap((it) => {
      if (it.kind !== 'card' || it.iid === source) return [];
      const type = defOf(s, it.iid).type;
      // Book of Spells: its controller's Spells count as Incantations too.
      const asIncantation = type === 'Spell' && spec.types.includes('Incantation') && spellsAsIncantations(s, it.controller);
      if (!spec.types.includes(type) && !asIncantation) return [];
      if (spec.negaters && !(defOf(s, it.iid).script.resolve ?? []).some((x) => x.do === 'negate')) return [];
      return [it.iid];
    });
  }
  const filter = spec.kind === 'creature' ? { ...(spec.filter ?? {}), type: 'Creature' as const } : spec.filter;
  return Object.keys(s.perms).filter((iid) => matches(s, iid, filter, controller, source) && !shieldedFrom(s, iid, controller));
}

function addCounter(s: GameState, iid: Iid, atk: number, def: number, from: string): void {
  const perm = s.perms[iid];
  perm.countersFrom[from] = (perm.countersFrom[from] ?? 0) + 1;
  perm.counters += 1;
  perm.counterAtk += atk;
  perm.counterDef += def;
  emit(s, { name: 'counterAdded', subject: iid, player: perm.controller, kind: from });
}

/** Runs effects in order. Returns 'paused' if a player has to make a choice first. */
export function runQueue(s: GameState, queue: Effect[], ctx: EffectCtx): 'done' | 'paused' {
  while (queue.length) {
    if (s.phase === 'over') return 'done';
    const e = queue.shift()!;
    switch (e.do) {
      case 'draw': {
        const who = resolvePlayer(s, e.who, ctx);
        if (who === null) break;
        drawCards(s, who, evalNum(s, e.n, ctx));
        if (e.as) ctx.vars[e.as] = player(s, who).hand.at(-1) ?? null;
        break;
      }
      case 'createToken': {
        const made = createTokens(s, ctx.controller, e.token, evalNum(s, e.n, ctx), e.keywords ?? []);
        if (e.tapped) for (const t of made) s.perms[t].tapped = true;
        log(s, `${pname(s, ctx.controller)} creates ${made.length} ${getDef(e.token).name}${made.length === 1 ? '' : 's'}.`);
        break;
      }
      case 'createSpecialToken': {
        const base = e.base === 'eventOther' ? (ctx.event?.other ? s.cards[ctx.event.other].cardId : null) : e.base;
        if (!base) break;
        const set = { ...e.set, scriptFrom: e.set.scriptFrom === undefined && e.base === 'eventOther' ? base : e.set.scriptFrom };
        const made = createTokens(s, ctx.controller, base, evalNum(s, e.n, ctx), [], set);
        const owner = e.owner ? resolvePlayer(s, e.owner, ctx) : null;
        if (owner !== null) for (const t of made) s.cards[t].owner = owner;
        if (made.length) log(s, `${pname(s, ctx.controller)} creates ${made.length} ${nameOf(s, made[0])}${made.length === 1 ? '' : 's'}.`);
        break;
      }
      case 'counter': {
        const iid = resolveRef(s, e.target, ctx);
        const perm = iid ? s.perms[iid] : undefined;
        const from = ctx.source.startsWith('field:') ? ctx.source : s.cards[ctx.source].cardId;
        if (!iid || !perm) break;
        if (e.max !== undefined && (perm.countersFrom[from] ?? 0) >= e.max) {
          log(s, `${nameOf(s, iid)} already has ${e.max} counters from ${nameOf(s, ctx.source)}.`);
          break;
        }
        addCounter(s, iid, e.atk, e.def, from);
        log(s, `${nameOf(s, iid)} gets a ${e.atk || e.def ? `+${e.atk}/+${e.def} ` : ''}counter.`);
        break;
      }
      case 'moveCounters': {
        const from = resolveRef(s, e.from, ctx);
        const to = resolveRef(s, e.to, ctx);
        if (!from || !to || !s.perms[from] || !s.perms[to]) break;
        const a = s.perms[from];
        const b = s.perms[to];
        b.counters += a.counters;
        b.counterAtk += a.counterAtk;
        b.counterDef += a.counterDef;
        log(s, `${a.counters} counter${a.counters === 1 ? '' : 's'} move from ${nameOf(s, from)} to ${nameOf(s, to)}.`);
        a.counters = a.counterAtk = a.counterDef = 0;
        break;
      }
      case 'pump':
      case 'grant': {
        const iid = resolveRef(s, e.target, ctx);
        const perm = iid ? s.perms[iid] : undefined;
        if (!perm) break;
        const until = e.until === 'permanent' ? '' : ` until the end of ${e.until}`;
        if (e.do === 'pump') {
          perm.mods.push({ atk: e.atk, def: e.def, until: e.until });
          log(s, `${nameOf(s, iid)} gets +${e.atk}/+${e.def}${until}.`);
        } else {
          perm.mods.push({ atk: 0, def: 0, keyword: e.keyword, until: e.until });
          log(s, `${nameOf(s, iid)} gains ${e.keyword}${until}.`);
        }
        break;
      }
      case 'addMana': {
        const n = evalNum(s, e.n, ctx);
        player(s, ctx.controller).floating += n;
        log(s, `${pname(s, ctx.controller)} adds ${n} mana until the end of the turn.`);
        break;
      }
      case 'createRock': {
        const who = resolvePlayer(s, e.who, ctx);
        if (who === null) break;
        const n = evalNum(s, e.n, ctx);
        if (e.corrupted) player(s, who).corruptedRocks += n;
        else player(s, who).rocks += n;
        if (n) log(s, `${pname(s, who)} creates ${n} ${e.corrupted ? 'Corrupted ' : ''}Mana Rock${n === 1 ? '' : 's'}.`);
        break;
      }
      case 'damage': {
        const iid = resolveRef(s, e.target, ctx);
        if (!iid || !s.perms[iid] || !isCreature(s, iid)) break;
        if (hasKeyword(s, iid, 'INDESTRUCTIBLE')) {
          log(s, `${nameOf(s, iid)} is INDESTRUCTIBLE and takes no damage.`);
          break;
        }
        const n = evalNum(s, e.n, ctx);
        s.perms[iid].damage += n;
        log(s, `${nameOf(s, iid)} takes ${n} damage.`);
        break;
      }
      case 'destroy': {
        const iid = resolveRef(s, e.target, ctx);
        if (iid) destroy(s, iid);
        break;
      }
      case 'sacrifice': {
        const iid = resolveRef(s, e.target, ctx);
        if (iid && s.perms[iid]) destroy(s, iid, 'sacrificed', true);
        break;
      }
      case 'destroyAll': {
        const all = listMatching(s, { ...e.filter, zone: 'field' }, ctx.controller, ctx.source);
        log(s, `Destroying ${all.length} card${all.length === 1 ? '' : 's'}.`);
        for (const iid of all) if (s.perms[iid]) destroy(s, iid);
        break;
      }
      case 'negate': {
        const iid = resolveRef(s, e.target, ctx);
        const idx = s.stack.findIndex((it) => it.kind === 'card' && it.iid === iid);
        if (iid && idx >= 0) {
          s.stack.splice(idx, 1);
          if (!inst(s, iid).isToken) player(s, inst(s, iid).owner).discard.push(iid);
          log(s, `${nameOf(s, iid)} is negated.`);
          ctx.vars.negated = 1;
        }
        break;
      }
      case 'choose': {
        const options = listMatching(s, e.from, ctx.controller, ctx.source).filter((iid) => (e.from.zone ?? 'field') !== 'field' || !shieldedFrom(s, iid, ctx.controller));
        if (options.length === 0) {
          ctx.vars[e.as] = null;
          if (e.from.zone === 'deck') log(s, `${pname(s, ctx.controller)} finds nothing.`);
          break;
        }
        // Even a single option is shown to the player, so they see what is chosen.
        s.decision = { kind: 'choose', player: ctx.controller, prompt: e.prompt, options, optional: !!e.optional, as: e.as, queue, ctx };
        return 'paused';
      }
      case 'chooseFrom': {
        s.decision = { kind: 'choose', player: ctx.controller, prompt: e.prompt, options: e.options, optional: false, as: e.as, queue, ctx };
        return 'paused';
      }
      case 'choosePlayer': {
        const battled = player(s, ctx.controller).battled ?? [];
        const options = alive(s).filter((p) => (!e.opponentsOnly || p !== ctx.controller) && (!e.battled || (p !== ctx.controller && battled.includes(p))));
        if (!options.length) {
          if (e.battled) log(s, `${pname(s, ctx.controller)} hasn't fought an opponent this turn.`);
          delete ctx.vars[`p:${e.as}`];
          break;
        }
        if (options.length === 1) {
          ctx.vars[`p:${e.as}`] = options[0];
          break;
        }
        s.decision = { kind: 'choosePlayer', player: ctx.controller, prompt: e.prompt, options, as: e.as, queue, ctx };
        return 'paused';
      }
      case 'chooseMode': {
        s.decision = { kind: 'mode', player: ctx.controller, prompt: e.prompt, labels: e.modes.map((m) => m.label), modes: e.modes.map((m) => m.effects), queue, ctx };
        return 'paused';
      }
      case 'guide': {
        const n = evalNum(s, e.n, ctx);
        const cards = player(s, ctx.controller).deck.slice(0, n);
        if (!cards.length) break;
        s.decision = { kind: 'guide', player: ctx.controller, cards, queue, ctx };
        return 'paused';
      }
      case 'moveToHand': {
        const iid = resolveRef(s, e.target, ctx);
        if (iid) moveToHand(s, iid, !!e.reveal);
        break;
      }
      case 'toDeckBottom': {
        const iid = resolveRef(s, e.target, ctx);
        if (iid) {
          moveToDeckBottom(s, iid);
          log(s, `${pname(s, inst(s, iid).owner)} puts a card on the bottom of their deck.`);
        }
        break;
      }
      case 'returnToField': {
        const iid = resolveRef(s, e.target, ctx);
        if (iid && returnFromDiscard(s, iid, ctx.controller, e.tapped)) log(s, `${nameOf(s, iid)} returns to ${pname(s, ctx.controller)}'s field from a discard pile.`);
        break;
      }
      case 'discardHand': {
        const p = player(s, ctx.controller);
        const n = p.hand.length;
        p.discard.push(...p.hand);
        p.hand = [];
        ctx.vars[e.as] = n;
        log(s, `${p.name} discards their hand (${n} card${n === 1 ? '' : 's'}).`);
        break;
      }
      case 'loseLife': {
        const who = resolvePlayer(s, e.who, ctx);
        if (who === null || player(s, who).eliminated) break;
        const n = evalNum(s, e.n, ctx);
        loseLife(s, who, n);
        // Every point of life lost draws a card, unless the card says otherwise.
        if (!e.noDraw && n > 0 && player(s, who).life > 0) drawCards(s, who, n);
        break;
      }
      case 'coinFlip': {
        const heads = random(s) < 0.5;
        log(s, `${pname(s, ctx.controller)} flips a coin: ${heads ? 'heads' : 'tails'}.`);
        queue.unshift(...(heads ? e.heads : e.tails));
        break;
      }
      case 'override': {
        const iid = resolveRef(s, e.target, ctx);
        if (!iid || !s.perms[iid]) break;
        const c = inst(s, iid);
        c.override = { ...(c.override ?? {}), ...e.set };
        if (e.set.scriptFrom === null) c.extraKeywords = [];
        s.perms[iid].mods = s.perms[iid].mods.filter((m) => !m.keyword);
        log(s, `${getDef(c.cardId).name} becomes ${nameOf(s, iid)}${e.set.attack !== undefined ? ` (${e.set.attack}/${e.set.defense})` : ''}.`);
        break;
      }
      case 'gainControl': {
        const iid = resolveRef(s, e.target, ctx);
        if (!iid || !s.perms[iid]) break;
        gainControl(s, iid, ctx.controller);
        if (e.untap) untapPerm(s, iid);
        break;
      }
      case 'contract': {
        const who = resolvePlayer(s, e.who, ctx);
        if (who === null) break;
        const p = player(s, ctx.controller);
        p.souls += 1;
        log(s, `${p.name} makes a contract with ${pname(s, who)} (${p.souls} Soul${p.souls === 1 ? '' : 's'}).`);
        emit(s, { name: 'contract', player: ctx.controller, kind: e.kind });
        emit(s, { name: 'soulsGained', player: ctx.controller });
        break;
      }
      case 'tap': {
        const iid = resolveRef(s, e.target, ctx);
        if (iid && tapPerm(s, iid)) log(s, `${nameOf(s, iid)} is tapped.`);
        break;
      }
      case 'attach': {
        const iid = resolveRef(s, e.target, ctx);
        const eq = s.perms[ctx.source];
        if (iid && eq && s.perms[iid] && iid !== ctx.source) {
          eq.attachedTo = iid;
          log(s, `${nameOf(s, ctx.source)} is equipped to ${nameOf(s, iid)}.`);
        }
        break;
      }
      case 'untap': {
        const iid = resolveRef(s, e.target, ctx);
        if (iid && untapPerm(s, iid)) log(s, `${nameOf(s, iid)} untaps.`);
        break;
      }
      case 'untapAll': {
        let n = 0;
        for (const iid of listMatching(s, { ...e.filter, zone: 'field' }, ctx.controller, ctx.source)) if (untapPerm(s, iid)) n++;
        log(s, `${n} card${n === 1 ? '' : 's'} untap.`);
        break;
      }
      case 'inheritKeywords': {
        const from = resolveRef(s, e.from, ctx);
        const to = resolveRef(s, e.to, ctx);
        if (!from || !to || !s.perms[to]) break;
        const c = inst(s, to);
        const added = keywordsOf(s, from).filter((k) => !keywordsOf(s, to).includes(k));
        c.extraKeywords.push(...added);
        if (added.length) log(s, `${nameOf(s, to)} gains ${added.join(', ')}.`);
        break;
      }
      case 'reduceNextCost': {
        player(s, ctx.controller).costReductions.push({ tribe: e.tribe, amount: e.amount, turn: s.turn });
        log(s, `${pname(s, ctx.controller)}'s next ${e.tribe ?? ''} creature this turn costs ${e.amount} less.`);
        break;
      }
      case 'toDiscard': {
        const iid = resolveRef(s, e.target, ctx);
        if (iid && s.perms[iid]) {
          const name = nameOf(s, iid);
          leaveField(s, iid);
          log(s, `${name} goes to the discard pile.`);
        }
        break;
      }
      case 'removeCounters': {
        const iid = resolveRef(s, e.target, ctx);
        const perm = iid ? s.perms[iid] : undefined;
        if (perm) perm.counters = Math.max(0, perm.counters - e.n);
        break;
      }
      case 'gainSouls': {
        const p = player(s, ctx.controller);
        p.souls += evalNum(s, e.n, ctx);
        log(s, `${p.name} has ${p.souls} Soul${p.souls === 1 ? '' : 's'}.`);
        emit(s, { name: 'soulsGained', player: ctx.controller });
        break;
      }
      case 'skipRefill': {
        const who = resolvePlayer(s, e.who, ctx);
        if (who !== null) {
          player(s, who).skipRefill++;
          log(s, `One of ${pname(s, who)}'s Mana Orbs won't refill in their next Upkeep.`);
        }
        break;
      }
      case 'chooseCreatureOf': {
        const who = resolvePlayer(s, e.who, ctx);
        const options = who === null ? [] : player(s, who).field.filter((iid) => isCreature(s, iid) && !shieldedFrom(s, iid, ctx.controller));
        if (!options.length) {
          ctx.vars[e.as] = null;
          break;
        }
        queue.unshift({ do: 'chooseFrom', options, as: e.as, prompt: e.prompt });
        break;
      }
      case 'gainCountersFromEvent': {
        const iid = resolveRef(s, e.target, ctx);
        const c = ctx.event?.counters;
        const perm = iid ? s.perms[iid] : undefined;
        if (!perm || !c || !c.n) break;
        perm.counters += c.n;
        perm.counterAtk += c.atk;
        perm.counterDef += c.def;
        log(s, `${nameOf(s, iid)} takes ${c.n} counter${c.n === 1 ? '' : 's'}.`);
        break;
      }
      case 'discountAbilities': {
        player(s, ctx.controller).abilityDiscount += e.amount;
        log(s, `${pname(s, ctx.controller)}'s activated abilities cost ${e.amount} less this turn.`);
        break;
      }
      case 'offer': {
        const me = ctx.controller;
        const them = s.players.filter((p) => p.id !== me && !p.eliminated).map((p) => p.id);
        log(s, `${pname(s, me)} OFFERS: ${e.prompt}`);
        emit(s, { name: 'offered', player: me });
        const steps: Effect[] = [{ do: 'setVar', as: 'contracts', n: 0 }, { do: 'setP', as: 'offerer', player: me }, { do: 'finePrint' }];
        for (const o of them) steps.push({ do: 'setP', as: 'o', player: o }, { do: 'offerOne', player: o, prompt: e.prompt, gift: e.gift, denied: e.denied ?? [] });
        steps.push({ do: 'offerDone' }, ...(e.after ?? []));
        queue.unshift(...steps);
        break;
      }
      case 'offerOne': {
        const me = ctx.controller;
        const o = e.player;
        if (player(s, o).eliminated) break;
        // Fine Print: the OFFER is a COMMAND for this player.
        if (ctx.vars.fpAll === 1 || ctx.vars['p:fpOne'] === o) {
          log(s, `Fine Print: the OFFER is a COMMAND for ${pname(s, o)}.`);
          queue.unshift({ do: 'ctl', player: o }, ...e.gift, { do: 'ctl', player: me }, { do: 'contract', kind: 'command', who: 'pvar:o' }, { do: 'incVar', as: 'contracts' });
          break;
        }
        queue.unshift({
          do: 'ask',
          player: o,
          offerFrom: me,
          prompt: `${pname(s, me)} OFFERS you: ${e.prompt} Accept? (${pname(s, me)} gains 1 Soul.)`,
          then: [{ do: 'ctl', player: o }, ...e.gift, { do: 'ctl', player: me }, { do: 'contract', kind: 'offer', who: 'pvar:o' }, { do: 'incVar', as: 'contracts' }],
          else: [...e.denied, { do: 'offerDeniedBy', player: o }],
        });
        break;
      }
      case 'finePrint': {
        // Fine Print (once per round each): at 10 Souls, the OFFER is a COMMAND for one player; at 20, for everyone.
        const me = ctx.controller;
        const fp = player(s, me).field.find((iid) => s.cards[iid].cardId === 'fine-print');
        if (!fp) break;
        const used = (s.perms[fp].roundUsed ??= []);
        const souls = player(s, me).souls;
        const opps = alive(s).filter((p) => p !== me);
        if (opps.length === 0) break;
        const steps: Effect[] = [];
        if (souls >= 20 && !used.includes(101)) {
          steps.push({ do: 'may', prompt: 'Fine Print: make this OFFER a COMMAND for every player?', then: [{ do: 'setVar', as: 'fpAll', n: 1 }, { do: 'fpUse', n: 101 }] });
        }
        if (souls >= 10 && !used.includes(100)) {
          steps.push({
            do: 'if',
            cond: { not: { varIs: ['fpAll', 1] } },
            then: [{ do: 'may', prompt: 'Fine Print: make this OFFER a COMMAND for one player?', then: [{ do: 'choosePlayer', as: 'fpOne', prompt: 'Fine Print: COMMAND which player?', opponentsOnly: true }, { do: 'fpUse', n: 100 }] }],
          });
        }
        ctx.vars.fpSource = fp;
        queue.unshift(...steps);
        break;
      }
      case 'ask':
        s.decision = { kind: 'confirm', player: e.player, prompt: e.prompt, cost: 0, then: e.then, else: e.else, offerFrom: e.offerFrom, queue, ctx };
        return 'paused';
      case 'offerDone': {
        const n = Number(ctx.vars.contracts ?? 0);
        log(s, `${n} player${n === 1 ? '' : 's'} accepted.`);
        emit(s, { name: 'offerResolved', player: ctx.controller, n });
        break;
      }
      case 'asPlayer': {
        const who = resolvePlayer(s, e.who, ctx);
        if (who === null || player(s, who).eliminated) break;
        queue.unshift({ do: 'ctl', player: who }, ...e.effects, { do: 'ctl', player: ctx.controller });
        break;
      }
      case 'ctl':
        ctx.controller = e.player;
        break;
      case 'setP':
        ctx.vars[`p:${e.as}`] = e.player;
        break;
      case 'setVar':
        ctx.vars[e.as] = evalNum(s, e.n, ctx);
        break;
      case 'gainLife': {
        const n = evalNum(s, e.n, ctx);
        const p = player(s, ctx.controller);
        p.life += n;
        log(s, `${p.name} gains ${n} life (${p.life}).`);
        break;
      }
      case 'countThisTurn': {
        const key = `${ctx.source}:count:${e.key}`;
        const flags = player(s, ctx.controller).onceFlags;
        flags.push(key);
        ctx.vars[e.as] = flags.filter((f) => f === key).length;
        break;
      }
      case 'allowDiscardPlay': {
        const p = player(s, ctx.controller);
        p.discardPlays += e.n;
        log(s, `Until the End Phase, ${p.name} may play ${e.n === 1 ? 'a card' : `${e.n} cards`} from their discard pile (Corrupted Mana can help pay).`);
        break;
      }
      case 'incVar':
        ctx.vars[e.as] = Number(ctx.vars[e.as] ?? 0) + 1;
        break;
      case 'infect': {
        const iid = resolveRef(s, e.target, ctx);
        const perm = iid ? s.perms[iid] : undefined;
        if (!iid || !perm) break;
        perm.infectedBy = ctx.controller;
        perm.infectArmed = false;
        log(s, `${nameOf(s, iid)} is INFECTED by ${pname(s, ctx.controller)}.`);
        break;
      }
      case 'fadeOut': {
        const list = listMatching(s, { ...e.filter, zone: 'field' }, ctx.controller, ctx.source);
        for (const iid of list) fadeOut(s, iid);
        log(s, `${list.length} card${list.length === 1 ? '' : 's'} FADE OUT until the End Phase.`);
        break;
      }
      case 'extraAttack': {
        const iid = resolveRef(s, e.target, ctx);
        if (iid && s.perms[iid] && s.combat) (s.extraAttacks ??= []).push({ attacker: iid, target: s.combat.defender });
        break;
      }
      case 'shuffleDeck':
        shuffle(s, player(s, ctx.controller).deck);
        break;
      case 'repeat': {
        const n = evalNum(s, e.n, ctx);
        const copies: Effect[] = [];
        for (let i = 0; i < n; i++) copies.push(...e.effects);
        queue.unshift(...copies);
        break;
      }
      case 'if':
        queue.unshift(...(evalCondition(s, e.cond, ctx) ? e.then : (e.else ?? [])));
        break;
      case 'may': {
        if (player(s, ctx.controller).eliminated) break;
        const cost = e.cost === undefined ? 0 : evalNum(s, e.cost, ctx);
        if (cost > availableMana(s, ctx.controller)) {
          log(s, `${pname(s, ctx.controller)} can't pay ${cost} mana, so nothing happens.`);
          break;
        }
        s.decision = { kind: 'confirm', player: ctx.controller, prompt: e.prompt, cost, then: e.then, queue, ctx };
        return 'paused';
      }
      case 'fillOrb': {
        let n = evalNum(s, e.n, ctx);
        const p = player(s, ctx.controller);
        let filled = 0;
        for (const o of p.orbs) {
          if (n > 0 && !o.filled) {
            o.filled = true;
            n--;
            filled++;
          }
        }
        log(s, filled ? `${p.name} refills ${filled} Mana Orb${filled === 1 ? '' : 's'}.` : `${p.name} has no used Mana Orb to refill.`);
        break;
      }
      case 'destroyOrb': {
        const iid = resolveRef(s, e.target, ctx);
        if (iid) destroyOrb(s, iid);
        break;
      }
      case 'chargeCard': {
        const iid = resolveRef(s, e.target, ctx);
        if (iid && player(s, ctx.controller).hand.includes(iid)) chargeCard(s, ctx.controller, iid, 'hand');
        break;
      }
      case 'chargeFromDeck': {
        const top = player(s, ctx.controller).deck[0];
        if (top) chargeCard(s, ctx.controller, top, 'deck');
        else log(s, `${pname(s, ctx.controller)} has no cards in their deck to charge.`);
        break;
      }
      case 'copyToken': {
        const iid = resolveRef(s, e.target, ctx);
        if (!iid) break;
        const d = defOf(s, iid);
        if (d.type === 'Creature' || d.type === 'Artifact' || d.type === 'Anthem') {
          createTokens(s, ctx.controller, d.id, 1, [], inst(s, iid).override);
          log(s, `${pname(s, ctx.controller)} creates a token copy of ${d.name}.`);
          break;
        }
        if (d.type !== 'Spell' && d.type !== 'Incantation') break;
        // A copied Spell or Incantation goes on the stack (it isn't cast, so it costs nothing and ignores play conditions).
        const copy = newInstance(s, d.id, ctx.controller, true);
        const spec = d.script.targets?.[0];
        if (!spec) {
          queue.unshift({ do: 'stackCopy', iid: copy.iid });
          break;
        }
        const options = targetOptions(s, spec, ctx.controller);
        if (!options.length) {
          log(s, `The copy of ${d.name} has no legal target, so it does nothing.`);
          break;
        }
        queue.unshift({ do: 'chooseFrom', options, as: 'copyTarget', prompt: `Choose a target for the copy of ${d.name}` }, { do: 'stackCopy', iid: copy.iid, targetVar: 'copyTarget' });
        break;
      }
      case 'stackCopy': {
        const v = e.targetVar ? ctx.vars[e.targetVar] : null;
        const target = typeof v === 'string' ? v : null;
        s.stack.push({ id: s.nextId++, kind: 'card', iid: e.iid, controller: ctx.controller, targets: target ? [target] : [] });
        log(s, `A copy of ${nameOf(s, e.iid)} goes on the stack${target ? ` targeting ${nameOf(s, target)}` : ''}.`);
        break;
      }
      case 'fpUse': {
        const fp = ctx.vars.fpSource;
        if (typeof fp === 'string' && s.perms[fp]) (s.perms[fp].roundUsed ??= []).push(e.n);
        break;
      }
      case 'offerDeniedBy':
        emit(s, { name: 'offerDenied', player: ctx.controller, target: e.player });
        break;
      case 'offerTo': {
        const me = ctx.controller;
        const who = resolvePlayer(s, e.who, ctx);
        if (who === null || who === me || player(s, who).eliminated) {
          queue.unshift(...e.denied);
          break;
        }
        log(s, `${pname(s, me)} OFFERS ${pname(s, who)}: ${e.prompt}`);
        emit(s, { name: 'offered', player: me });
        ctx.vars['p:o'] = who;
        if (availableMana(s, who) < e.cost) {
          log(s, `${pname(s, who)} can't pay ${e.cost} mana.`);
          queue.unshift(...e.denied, { do: 'offerDeniedBy', player: who });
          break;
        }
        s.decision = {
          kind: 'confirm',
          player: who,
          prompt: `${pname(s, me)} OFFERS you: ${e.prompt} Pay ${e.cost} mana? (${pname(s, me)} gains 1 Soul.)`,
          cost: e.cost,
          then: [{ do: 'contract', kind: 'offer', who: 'pvar:o' }],
          else: [...e.denied, { do: 'offerDeniedBy', player: who }],
          offerFrom: me,
          queue,
          ctx,
        };
        return 'paused';
      }
      case 'moveToDiscard': {
        const iid = resolveRef(s, e.target, ctx);
        if (!iid) break;
        const c = inst(s, iid);
        const p = player(s, c.owner);
        if (s.perms[iid]) {
          leaveField(s, iid);
          break;
        }
        for (const zone of ['deck', 'hand'] as const) p[zone] = p[zone].filter((x) => x !== iid);
        p.discard.push(iid);
        log(s, `${nameOf(s, iid)} goes to ${p.name}'s discard pile.`);
        break;
      }
      case 'bounce': {
        const iid = resolveRef(s, e.target, ctx);
        if (iid && s.perms[iid]) bounceOne(s, iid);
        break;
      }
      case 'bounceAll': {
        const all = listMatching(s, { ...e.filter, zone: 'field' }, ctx.controller, ctx.source);
        log(s, `${all.length} card${all.length === 1 ? '' : 's'} return to their owners' hands.`);
        for (const iid of all) if (s.perms[iid]) bounceOne(s, iid);
        break;
      }
      case 'blink': {
        const iid = resolveRef(s, e.target, ctx);
        if (!iid || !s.perms[iid]) break;
        const name = nameOf(s, iid);
        fadeOut(s, iid);
        log(s, `${name} leaves the field until the End Phase.`);
        break;
      }
      case 'pumpAll': {
        const atk = evalNum(s, e.atk, ctx);
        const def = evalNum(s, e.def, ctx);
        const all = listMatching(s, { ...e.filter, zone: 'field' }, ctx.controller, ctx.source);
        for (const iid of all) s.perms[iid].mods.push({ atk, def, until: e.until });
        log(s, `${all.length} creature${all.length === 1 ? '' : 's'} get +${atk}/+${def}${e.until === 'permanent' ? '' : ` until the end of ${e.until}`}.`);
        break;
      }
      case 'swapStats': {
        const iid = resolveRef(s, e.target, ctx);
        const perm = iid ? s.perms[iid] : undefined;
        if (!iid || !perm || !isCreature(s, iid)) break;
        perm.swapped = !perm.swapped;
        log(s, `${nameOf(s, iid)}'s attack and defense switch (now ${attackOf(s, iid)}/${defenseOf(s, iid)}).`);
        break;
      }
      case 'becomeCopy': {
        const iid = resolveRef(s, e.target, ctx);
        const me = ctx.source;
        if (!iid || !s.perms[iid] || !s.perms[me]) break;
        const d = defOf(s, iid);
        const src = s.cards[iid].override?.scriptFrom;
        const creature = isCreature(s, iid);
        s.cards[me].override = {
          name: d.name,
          type: creature ? 'Creature' : d.type,
          tribe: d.tribe,
          attack: typeof d.attack === 'number' ? d.attack : creature ? attackOf(s, iid) : undefined,
          defense: typeof d.defense === 'number' ? d.defense : creature ? defenseOf(s, iid) : undefined,
          scriptFrom: src === undefined ? s.cards[iid].cardId : src,
          text: d.text,
          alsoArtifact: true,
          untilEndOfTurn: true,
        };
        // Not played this turn: the copy has no summoning sickness.
        if (s.perms[me].enteredTurn !== s.turn) s.perms[me].sick = false;
        log(s, `Shifting Relic becomes a copy of ${d.name} until the end of the turn.`);
        break;
      }
      case 'castCard': {
        const iid = resolveRef(s, e.target, ctx);
        if (!iid) break;
        const c = inst(s, iid);
        const p = player(s, c.owner);
        if (!p.discard.includes(iid) && !p.hand.includes(iid)) break;
        p.discard = p.discard.filter((x) => x !== iid);
        p.hand = p.hand.filter((x) => x !== iid);
        const d = defOf(s, iid);
        log(s, `${pname(s, ctx.controller)} plays ${d.name}.`);
        emit(s, { name: 'cardPlayed', subject: iid, player: ctx.controller });
        const spec = d.script.targets?.[0];
        if (!spec) {
          queue.unshift({ do: 'stackCopy', iid });
          break;
        }
        const options = targetOptions(s, spec, ctx.controller, iid);
        if (!options.length) {
          log(s, `${d.name} has no legal target, so it goes back to the discard pile.`);
          p.discard.push(iid);
          break;
        }
        queue.unshift({ do: 'chooseFrom', options, as: 'castTarget', prompt: `Choose a target for ${d.name}` }, { do: 'stackCopy', iid, targetVar: 'castTarget' });
        break;
      }
      case 'copyNext': {
        const p = player(s, ctx.controller);
        p.copyNext = (p.copyNext ?? 0) + 1;
        log(s, `${p.name}'s next Spell or Incantation will be copied.`);
        break;
      }
      case 'markDiscard': {
        const id = ctx.vars[e.as];
        const p = player(s, ctx.controller);
        if (typeof id !== 'string' || !p.discard.includes(id)) break;
        (p.marked ??= []).push({ iid: id, armed: false });
        log(s, `${p.name} marks ${nameOf(s, id)}: until their next End Phase they may play it from the discard pile by paying its cost.`);
        break;
      }
      case 'rainingArrows': {
        // X = the total attack of your creatures. A creature takes X damage; a player may block and boost.
        const me = ctx.controller;
        const x = player(s, me).field.filter((iid) => isCreature(s, iid)).reduce((n, iid) => n + Math.max(0, attackOf(s, iid)), 0);
        ctx.vars.x = x;
        log(s, `Raining Arrows: X = ${x}${x > 6 ? ' (CRITICAL)' : ''}.`);
        queue.unshift({
          do: 'chooseMode',
          prompt: `Raining Arrows (X = ${x}): target a creature or a player?`,
          modes: [
            {
              label: 'A creature',
              effects: [
                { do: 'choose', from: { zone: 'field', type: 'Creature', controller: 'any' }, as: 'arrowC', prompt: `Raining Arrows: choose a creature to take ${x} damage` },
                { do: 'damage', target: 'var:arrowC', n: { var: 'x' } },
              ],
            },
            {
              label: 'A player',
              effects: [
                { do: 'choosePlayer', as: 'arrowP', prompt: 'Raining Arrows: choose a player', opponentsOnly: true },
                {
                  do: 'asPlayer',
                  who: 'pvar:arrowP',
                  effects: [{ do: 'choose', from: { zone: 'field', type: 'Creature', controller: 'you', untapped: true }, as: 'arrowBlock', optional: true, prompt: `Raining Arrows (${x}${x > 6 ? ', CRITICAL' : ''}) is coming at you: block with a creature?` }],
                },
                { do: 'arrowsBoost' },
                { do: 'arrowsHit' },
              ],
            },
          ],
        });
        break;
      }
      case 'arrowsBoost': {
        // The blocking player may boost the block (+1 defense per creature, tapped), one creature at a time.
        const blk = ctx.vars.arrowBlock;
        const who = ctx.vars['p:arrowP'];
        if (typeof blk !== 'string' || typeof who !== 'number' || !s.perms[blk]) break;
        if (ctx.vars.arrowBlockTapped !== 1) {
          ctx.vars.arrowBlockTapped = 1;
          log(s, `${pname(s, who)} blocks Raining Arrows with ${nameOf(s, blk)}.`);
          tapPerm(s, blk);
        }
        const last = ctx.vars.arrowBooster;
        if (typeof last === 'string' && s.perms[last] && !s.perms[last].tapped) {
          tapPerm(s, last);
          ctx.vars.arrowBoosts = Number(ctx.vars.arrowBoosts ?? 0) + 1;
          log(s, `${nameOf(s, last)} boosts the block.`);
        }
        if (last === null) break; // they stopped boosting
        ctx.vars.arrowBooster = null;
        const more = player(s, who).field.some((iid) => iid !== blk && isCreature(s, iid) && !s.perms[iid].tapped);
        if (!more) break;
        queue.unshift(
          {
            do: 'asPlayer',
            who: 'pvar:arrowP',
            effects: [{ do: 'choose', from: { zone: 'field', type: 'Creature', controller: 'you', untapped: true }, as: 'arrowBooster', optional: true, prompt: 'Boost your block (+1 defense)? Choose a creature, or skip.' }],
          },
          { do: 'arrowsBoost' },
        );
        break;
      }
      case 'arrowsHit': {
        const who = ctx.vars['p:arrowP'];
        const x = Number(ctx.vars.x ?? 0);
        if (typeof who !== 'number' || player(s, who).eliminated) break;
        const critical = x > 6;
        const blk = ctx.vars.arrowBlock;
        const lose = (n: number) => {
          loseLife(s, who, n);
          if (critical) log(s, `CRITICAL: ${pname(s, who)} does not draw.`);
          else if (player(s, who).life > 0) drawCards(s, who, n);
        };
        if (typeof blk === 'string' && s.perms[blk]) {
          const def = defenseOf(s, blk) + Number(ctx.vars.arrowBoosts ?? 0);
          log(s, `Raining Arrows: ${x} against ${nameOf(s, blk)}'s defense of ${def}.`);
          if (x >= def) destroy(s, blk, 'destroyed by Raining Arrows');
          if (x > def) lose(1);
          else if (x < def) log(s, 'The block holds.');
        } else if (x > 0) {
          lose(x);
        }
        break;
      }
      case 'reveal': {
        const iid = resolveRef(s, e.target, ctx);
        if (iid) log(s, `${pname(s, ctx.controller)} reveals ${nameOf(s, iid)}.`);
        break;
      }
    }
  }
  return 'done';
}

/** A permanent goes back to its owner's hand; a token simply ceases to exist. */
function bounceOne(s: GameState, iid: Iid): void {
  const name = nameOf(s, iid);
  if (inst(s, iid).isToken) {
    leaveField(s, iid, 'none');
    log(s, `${name} (a token) leaves the field and ceases to exist.`);
    return;
  }
  moveToHand(s, iid, false);
  log(s, `${name} returns to its owner's hand.`);
}
