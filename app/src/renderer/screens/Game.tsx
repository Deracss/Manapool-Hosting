import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ME, setSeat } from '../me';
import type { MouseEvent } from 'react';
import { Card, showDef, showInGame } from '../components/Card';
import { attackOf, boostValue, botAction, cardIdByName, chargesAllowed, createGame, defenseOf, getDef, hasKeyword, hasStatic, isCreature, newInstance, whoMustAct } from '../engine';
import { setHovered } from '../hover';
import type { Action, GameState, Iid, PlayerId } from '../engine';
import { fieldOptions, firstCombo, handOptions, nothingToRespondWith, targetPrompts, tryApply } from '../legal';
import type { FieldOption, HandOption } from '../legal';
import { BOT_DELAY, cardNumber, loadSettings, saveSettings } from '../storage';
import type { AutoPass, Settings } from '../storage';
import { ExpandedField, FieldScene, FxLayer, GroupedChoices, Icon, LogPanel, ManaBar, moodOf, PING_LABEL, PingLayer, sortField, sortHand, StackPanel, useTableFx } from './tableParts';
import type { Ping, PingKind } from './tableParts';
import type { OutInfo, PayPreview } from './tableParts';
import type { GameSetup, RematchMode } from './NewGame';
import { youify } from '../text';
import { configureSound, playSound } from '../sound';
import { EMOTES } from '../net';
import { playMusic, setMusicVolume, stopMusic } from '../music';
import { meaningOf } from '../glossary';
import { describeTarget, ifNobodyResponds, meaningfulLines, stackItemCards, stackItemTitle } from '../preview';


type Preview = { iid: Iid } | { def: string } | null;
type Popover =
  | { kind: 'hand'; iid: Iid; x: number; y: number; opts: HandOption }
  | { kind: 'field'; iid: Iid; x: number; y: number; above: number; opts: FieldOption };
/** Choosing targets: one slot at a time, in a popup. `done` turns the chosen targets into the action. */
type Drop = { ok: boolean; label: string; act?: () => void };
type Drag = {
  iid: Iid;
  from: 'hand' | 'field';
  sx: number;
  sy: number;
  x: number;
  y: number;
  started: boolean;
  over: Drop | null;
  zones: { field: boolean; mana: boolean; cards: Set<string>; players: Set<PlayerId> };
};
type Targeting = { title: string; prompts: string[]; slots: string[][]; picked: string[]; done: (targets: string[]) => Action };

function startGame(setup: GameSetup): GameState {
  return createGame({
    seed: setup.seed,
    startingPlayer: setup.first ?? 0,
    players: [setup.me, ...setup.bots].map((p) => ({ name: p.name, deck: p.deck, field: p.field })),
  });
}

/** An online game: the server owns the state; you send actions and get each new state back. */
export interface OnlineLink {
  seat: PlayerId;
  name: string;
  initial: GameState;
  isHost: boolean;
  subscribe: (cb: (s: GameState) => void) => () => void;
  act: (a: Action) => void;
  ping: (sel: string, kind: PingKind, label: string) => void;
  onPing: (cb: (from: PlayerId, sel: string, kind: PingKind) => void) => () => void;
  backToLobby: () => void;
  emote: (id: number) => void;
  onEmote: (cb: (from: PlayerId, id: number) => void) => () => void;
}

export function Game({ setup, online, onExit, onRematch }: { setup?: GameSetup; online?: OnlineLink; onExit: () => void; onRematch: (mode: RematchMode, first: PlayerId) => void }) {
  const [s, setS] = useState<GameState>(() => {
    setSeat(online ? online.seat : 0, online ? online.name : 'You');
    return online ? online.initial : startGame(setup!);
  });
  useEffect(() => (online ? online.subscribe(setS) : undefined), [online]);
  const autoSent = useRef<GameState | null>(null);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [preview, setPreview] = useState<Preview>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  // Keep a card's popup inside the window: if it would run off the bottom, open it above the card (or as low as fits).
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!el || !popover) return;
    const r = el.getBoundingClientRect();
    const room = window.innerHeight - 8;
    if (r.bottom <= room && r.top >= 8) return;
    if (popover.kind === 'field') {
      const top = popover.above - r.height >= 8 ? popover.above - r.height : Math.max(8, room - r.height);
      el.style.top = `${top}px`;
    } else if (r.top < 8) {
      el.style.bottom = 'auto';
      el.style.top = '8px';
    }
  }, [popover]);
  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const [picks, setPicks] = useState<Iid[]>([]);
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [discardOf, setDiscardOf] = useState<PlayerId | null>(null);
  const [expandPid, setExpandPid] = useState<PlayerId | null>(null);
  const [stackHidden, setStackHidden] = useState(false);
  const [highlight, setHighlight] = useState<Iid | null>(null);
  const [pay, setPay] = useState<PayPreview | null>(null);
  const [holdNext, setHoldNext] = useState(false);
  const [watching, setWatching] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const justDragged = useRef(false);
  const fx = useTableFx(s, true);
  const [result, setResult] = useState<{ id: number; title: string; lines: string[] } | null>(null);
  const prevS = useRef<GameState>(s);
  // Pings: middle-click something for a quick "Look", hold the middle button (or use the Ping button) for the wheel.
  const [pings, setPings] = useState<Ping[]>([]);
  const [pingMode, setPingMode] = useState(false);
  const [wheel, setWheel] = useState<{ x: number; y: number; sel: string; label: string } | null>(null);
  const pingTimes = useRef<number[]>([]);
  const midDown = useRef<{ timer: ReturnType<typeof setTimeout>; target: { sel: string; label: string }; x: number; y: number } | null>(null);
  // Concede (with a confirmation), the end-of-game effect, the hover preview and opened token stacks.
  const [confirmConcede, setConfirmConcede] = useState(false);
  const [endFx, setEndFx] = useState<'win' | 'lose' | null>(null);
  const [endReady, setEndReady] = useState(false);
  const [zoom, setZoom] = useState<{ iid: Iid; x: number; y: number } | null>(null);
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openStacks, setOpenStacks] = useState<Set<string>>(new Set());
  const [emoteMenu, setEmoteMenu] = useState(false);
  const [bubbles, setBubbles] = useState<Record<number, { id: number; key: number }>>({});
  const lastEmote = useRef(0);
  // Your hand's order on screen: the last "Sort hand" order, with cards drawn since then added on the right.
  const [handOrder, setHandOrder] = useState<Iid[]>([]);
  // Cards that just arrived in your hand glow for a moment in their sorted slot.
  const [newCards, setNewCards] = useState<Set<Iid>>(new Set());
  const prevHand = useRef<Iid[]>(s.players[ME].hand);

  const who = whoMustAct(s);
  const me = s.players[ME];
  const d = s.decision;
  const myDecision = d && d.player === ME ? d : null;
  const freeMain = s.phase === 'main' && s.active === ME && !s.window && !s.decision && !s.combat && s.stack.length === 0;
  const myPriority = !!s.window && s.window.holder === ME && !s.decision;

  // Hook for the automated click-through tests: read the game, or put a named card into your hand.
  useEffect(() => {
    (window as unknown as { __manapool: unknown }).__manapool = {
      state: () => s,
      giveCard: (name: string, rocks = 0, pid: PlayerId = ME) =>
        setS((prev) => {
          const next = structuredClone(prev);
          next.players[pid].hand.push(newInstance(next, cardIdByName(name), pid).iid);
          next.players[pid].rocks += rocks;
          return next;
        }),
      put: (name: string, pid: PlayerId, tapped = false) =>
        setS((prev) => {
          const next = structuredClone(prev);
          const c = newInstance(next, cardIdByName(name), pid, name.endsWith('Token'));
          next.players[pid].field.push(c.iid);
          next.perms[c.iid] = { iid: c.iid, controller: pid, tapped, sick: false, enteredTurn: next.turn, counters: 0, counterAtk: 0, counterDef: 0, countersFrom: {}, damage: 0, mods: [], flags: { boostedThisTurn: false, wasBoostedThisTurn: false, dealtPlayerDamageThisTurn: false }, abilitiesUsed: [], memo: [] };
          return next;
        }),
      setLife: (pid: PlayerId, n: number) =>
        setS((prev) => {
          const next = structuredClone(prev);
          next.players[pid].life = n;
          return next;
        }),
      edit: (fn: (g: GameState) => void) =>
        setS((prev) => {
          const next = structuredClone(prev);
          fn(next);
          return next;
        }),
      act: (a: Action) => setS((prev) => tryApply(prev, a).ok ? (tryApply(prev, a) as { state: GameState }).state : prev),
    };
  });

  const step = (a: Action) => {
    const r = tryApply(s, a);
    if (!r.ok) {
      setToast(youify(r.error));
      return;
    }
    if (online) online.act(a);
    else setS(r.state);
    setPopover(null);
    setTargeting(null);
    setPicks([]);
    setPay(null);
    setHoldNext(false);
  };

  // Which mana a card would spend: try playing it and compare the mana pool before and after.
  const previewPay = (iid: Iid) => {
    if (!(freeMain || myPriority) || !me.hand.concat(me.discard).includes(iid)) return setPay(null);
    const o = handOptions(s, ME, iid);
    if (!o.play.legal) return setPay(null);
    const r = tryApply(s, { type: 'play', player: ME, card: iid, targets: o.play.needsTarget ? (firstCombo(o.play.slots) ?? []) : undefined });
    if (!r.ok) return setPay(null);
    const a = s.players[ME];
    const b = r.state.players[ME];
    setPay({
      name: getDef(s.cards[iid].cardId).name,
      orbs: new Set(a.orbs.filter((x) => x.filled && b.orbs.some((y) => y.iid === x.iid && !y.filled)).map((x) => x.iid)),
      rocks: a.rocks - b.rocks,
      corrupted: a.corruptedRocks - b.corruptedRocks,
      floating: Math.max(0, a.floating - b.floating),
    });
  };

  // Should the game pass for you right now? (Auto-pass settings in the Game menu.)
  const autoPassNow = (() => {
    if (who !== ME || s.decision || !s.window || s.phase === 'over') return false;
    const ap = settings.autoPass;
    if (ap.passAll) return true;
    if (ap.skipOwnSteps && s.active === ME && !s.stack.length && (s.window.then === 'afterUpkeep' || s.window.then === 'afterDraw')) return true;
    if (!ap.skipNothing || !nothingToRespondWith(s, ME)) return false;
    if (ap.stopAttacked && s.combat?.defender === ME && s.window.then === 'afterBoost') return false;
    if (ap.stopOppEnd && s.phase === 'end' && s.active !== ME && !s.stack.length) return false;
    if (ap.stopTargeted) {
      const top = s.stack[s.stack.length - 1];
      const targets = top ? (top.kind === 'card' ? top.targets : top.ctx.targets) : [];
      if (targets.some((t) => s.perms[t]?.controller === ME)) return false;
    }
    return true;
  })();

  // Bots act on their own (after any play animation); your priority is skipped per your auto-pass settings.
  useEffect(() => {
    if (s.phase === 'over' || who === null || (!online && (menuOpen || fx.busy))) return;
    if (who !== ME) {
      if (online) return; // the server plays the bots; other people play for themselves
      let action: Action;
      try {
        action = botAction(s);
      } catch {
        action = { type: 'pass', player: who };
      }
      const delay = action.type === 'pass' ? Math.min(80, BOT_DELAY[settings.botSpeed]) : BOT_DELAY[settings.botSpeed];
      const t = setTimeout(() => {
        let r = tryApply(s, action);
        if (!r.ok) r = tryApply(s, { type: 'pass', player: who });
        if (r.ok) setS(r.state);
        else setToast(`A bot got stuck: ${r.error}`);
      }, delay);
      return () => clearTimeout(t);
    }
    if (autoPassNow) {
      if (holdNext) return;
      const t = setTimeout(() => {
        if (online) {
          if (autoSent.current === s) return;
          autoSent.current = s;
          online.act({ type: 'pass', player: ME });
          return;
        }
        const r = tryApply(s, { type: 'pass', player: ME });
        if (r.ok) setS(r.state);
      }, 160);
      return () => clearTimeout(t);
    }
  }, [s, who, settings, menuOpen, fx.busy, autoPassNow, holdNext]);

  // When something on the stack (or a combat) finishes, say what it did for a moment.
  useEffect(() => {
    const before = prevS.current;
    prevS.current = s;
    if (before === s) return;
    const top = before.stack[before.stack.length - 1];
    let title: string | null = null;
    if (top && !s.stack.some((it) => it.id === top.id) && s.log.length > before.log.length && s.log.slice(before.log.length).some((l) => l.includes('Resolving') || l.includes('negated') || l.includes('fizzles'))) title = stackItemTitle(before, before.stack.length - 1);
    else if (before.combat && !s.combat) title = `${before.combat.attackerController === ME ? 'Your' : `${s.players[before.combat.attackerController].name}'s`} attack`;
    if (!title) return;
    const lines = meaningfulLines(s.log.slice(before.log.length)).slice(0, 4);
    const id = Date.now();
    setResult({ id, title, lines: lines.length ? lines : ['Nothing visible happened.'] });
    const t = setTimeout(() => setResult((r) => (r?.id === id ? null : r)), 3800);
    return () => clearTimeout(t);
  }, [s]);

  useEffect(() => {
    const before = prevHand.current;
    prevHand.current = me.hand;
    if (s.phase === 'mulligan' || before === me.hand) return;
    const added = me.hand.filter((c) => !before.includes(c));
    if (!added.length) return;
    setNewCards(new Set(added));
    const t = setTimeout(() => setNewCards(new Set()), 1400);
    return () => clearTimeout(t);
  }, [me.hand]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dragRef.current) return;
        if (wheel || pingMode) {
          setWheel(null);
          setPingMode(false);
          return;
        }
        if (popover || targeting) {
          setPopover(null);
          setTargeting(null);
        } else if (discardOf !== null) setDiscardOf(null);
        else if (expandPid !== null) setExpandPid(null);
        else setMenuOpen((m) => !m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popover, targeting, discardOf, expandPid, wheel, pingMode]);

  useEffect(() => configureSound(settings.sound, settings.volume), [settings.sound, settings.volume]);
  // Your Field's music while the game is on.
  useEffect(() => {
    setMusicVolume(settings.music);
    if (s.phase !== 'over') playMusic(s.players[ME]?.fieldCard);
    else stopMusic();
  }, [settings.music, s.phase === 'over']);
  useEffect(() => () => stopMusic(), []);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  // ---------- derived view ----------
  const shownHand = [...handOrder.filter((c) => me.hand.includes(c)), ...me.hand.filter((c) => !handOrder.includes(c))];
  const handSorted = shownHand.join() === sortHand(s, me.hand).join();
  const playable = useMemo(() => {
    const set = new Set<Iid>();
    if (!(freeMain || myPriority)) return set;
    for (const c of me.hand) {
      const o = handOptions(s, ME, c);
      if (o.play.legal || o.charge.legal) set.add(c);
    }
    return set;
  }, [s]);

  const discardPlayable = useMemo(() => {
    if (!(freeMain || myPriority) || (!me.corruptedRocks && !me.discardPlays)) return 0;
    return me.discard.filter((c) => handOptions(s, ME, c).play.legal).length;
  }, [s]);

  const usable = useMemo(() => {
    const set = new Set<Iid>();
    if (!(freeMain || myPriority)) return set;
    for (const c of me.field) {
      const o = fieldOptions(s, ME, c);
      if (o.attackTargets.length || o.abilities.some((a) => a.legal)) set.add(c);
    }
    return set;
  }, [s]);

  // What happens if nobody responds to the top of the stack (or to the combat in progress).
  const outcome = useMemo(() => (myPriority && (s.stack.length || s.combat) ? ifNobodyResponds(s) : null), [s, myPriority]);

  // Spotlight: what the top of the stack would do to the cards on the table.
  const spot = useMemo(() => (s.stack.length ? ifNobodyResponds(s) : null), [s]);

  const pickDecision = myDecision && (myDecision.kind === 'block' || myDecision.kind === 'boostAttack' || myDecision.kind === 'boostDefense') ? myDecision : null;
  const decisionOptions = new Set<Iid>(pickDecision ? pickDecision.options : []);
  const dragTargets = drag?.started ? drag.zones.cards : null;
  const targetSet = new Set<string>(targeting ? targeting.slots[targeting.picked.length].filter((t) => !targeting.picked.includes(t)) : dragTargets ? [...dragTargets] : []);

  // ---------- drag to play, target, charge and attack ----------
  const startDrag = (iid: Iid, from: 'hand' | 'field', e: { clientX: number; clientY: number; button: number }) => {
    if (e.button !== 0 || targeting || myDecision || !(freeMain || myPriority)) return;
    const zones: Drag['zones'] = { field: false, mana: false, cards: new Set(), players: new Set() };
    if (from === 'hand') {
      const o = handOptions(s, ME, iid);
      zones.mana = o.charge.legal;
      if (o.play.legal && !o.play.needsTarget) zones.field = true;
      if (o.play.legal && o.play.needsTarget) for (const t of o.play.slots[0]) zones.cards.add(t);
    } else {
      const o = fieldOptions(s, ME, iid);
      for (const p of o.attackTargets) zones.players.add(p);
      for (const f of o.faceoffTargets) zones.cards.add(f.creature);
    }
    const d: Drag = { iid, from, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, started: false, over: null, zones };
    dragRef.current = d;
    setDrag(d);
  };

  const dropAt = (d: Drag, x: number, y: number): Drop | null => {
    const nm = (id: string) => (s.cards[id] ? getDef(s.cards[id].cardId).name : id);
    const card = nm(d.iid);
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest('.drag-ghost')) continue;
      const tgt = el.closest('[data-iid], [data-target]') as HTMLElement | null;
      const tid = tgt?.getAttribute('data-iid') ?? tgt?.getAttribute('data-target');
      if (tid && tid !== d.iid && (s.perms[tid] || s.stack.some((it) => it.kind === 'card' && it.iid === tid))) {
        const ok = d.zones.cards.has(tid);
        if (d.from === 'field') {
          return ok
            ? { ok, label: `Release: ${card} attacks ${describeTarget(s, tid)}`, act: () => step({ type: 'attack', player: ME, attacker: d.iid, target: s.perms[tid].controller, targetCreature: tid }) }
            : { ok, label: hasKeyword(s, d.iid, 'FACEOFF') ? `Can't attack ${describeTarget(s, tid)}` : 'Only creatures with FACEOFF can attack a creature' };
        }
        if (ok) {
          const o = handOptions(s, ME, d.iid);
          if (o.play.slots.length === 1) return { ok, label: `Release: ${card} → ${describeTarget(s, tid)}`, act: () => step({ type: 'play', player: ME, card: d.iid, targets: [tid] }) };
          return {
            ok,
            label: `Release: ${card} → ${describeTarget(s, tid)} (then choose the rest)`,
            act: () => setTargeting({ title: card, prompts: targetPrompts(s.cards[d.iid].cardId), slots: o.play.slots, picked: [tid], done: (targets) => ({ type: 'play', player: ME, card: d.iid, targets }) }),
          };
        }
        if (d.zones.cards.size) return { ok: false, label: `Can't target ${describeTarget(s, tid)}` };
      }
      const strip = el.closest('[data-strip]');
      if (strip) {
        const pid = Number(strip.getAttribute('data-strip'));
        if (d.from === 'field') return d.zones.players.has(pid) ? { ok: true, label: `Release: attack ${s.players[pid].name}`, act: () => step({ type: 'attack', player: ME, attacker: d.iid, target: pid }) } : { ok: false, label: `Can't attack ${s.players[pid].name} now` };
      }
      if (el.closest('[data-zone="mana"]') && d.from === 'hand') {
        return d.zones.mana ? { ok: true, label: 'Drop to charge as a Mana Orb', act: () => step({ type: 'charge', player: ME, card: d.iid }) } : { ok: false, label: youify(handOptions(s, ME, d.iid).charge.why ?? "Can't charge it now") };
      }
      if (el.closest('[data-zone="field"]') && d.from === 'hand') {
        const o = handOptions(s, ME, d.iid);
        if (d.zones.field) return { ok: true, label: `Drop to play${getDef(s.cards[d.iid].cardId).cost ? ` · ${getDef(s.cards[d.iid].cardId).cost} mana` : ''}`, act: () => step({ type: 'play', player: ME, card: d.iid }) };
        return { ok: false, label: o.play.needsTarget && o.play.legal ? 'Drop it on a target' : youify(o.play.why ?? "Can't play it now") };
      }
    }
    return null;
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: globalThis.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const started = d.started || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8;
      const next = { ...d, x: e.clientX, y: e.clientY, started, over: started ? dropAt(d, e.clientX, e.clientY) : null };
      if (started && !d.started) {
        setPopover(null);
        if (d.from === 'hand') previewPay(d.iid);
      }
      dragRef.current = next;
      setDrag(next);
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d?.started) return;
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
      setPay(null);
      if (d.over?.ok && d.over.act) d.over.act();
      else if (d.over && !d.over.ok) setToast(d.over.label);
    };
    const cancel = (e: KeyboardEvent | globalThis.MouseEvent) => {
      if ('key' in e && e.key !== 'Escape') return;
      e.preventDefault();
      dragRef.current = null;
      setDrag(null);
      setPay(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', cancel);
    window.addEventListener('contextmenu', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('contextmenu', cancel);
    };
  }, [drag !== null, s]);

  // While you could respond, your cards that can't do anything fade back and the usable ones glow.
  const responding = myPriority && !targeting && (s.stack.length > 0 || !!s.combat);
  // The top of the stack: its source and targets are highlighted on the table.
  const topCards = s.stack.length ? stackItemCards(s, s.stack.length - 1) : null;
  const topSet = new Set<string>(topCards ? [...topCards.targets, ...(topCards.source ? [topCards.source] : [])] : []);
  const inCombat = (iid: Iid) => !!s.combat && [s.combat.attacker, s.combat.blocker, s.combat.targetCreature].includes(iid);
  const dimFor = (iid: Iid): boolean =>
    (!!targeting && !targetSet.has(iid)) || (responding && s.perms[iid]?.controller === ME && !usable.has(iid) && !topSet.has(iid) && !inCombat(iid));
  const fxClass = (iid: Iid): string =>
    [fx.flash.entering.has(iid) && !fx.marks.token.has(iid) && !fx.marks.reform.has(iid) ? 'fx-enter' : '', fx.marks.token.has(iid) ? 'fx-token' : '', fx.marks.reform.has(iid) ? 'fx-reform' : '', fx.marks.hit.has(iid) ? 'fx-hit' : '', fx.marks.counter.has(iid) ? 'fx-counter' : '', fx.flash.lunge === iid ? 'fx-lunge' : '', highlight === iid ? 'fx-hl' : '', topSet.has(iid) ? (topCards?.targets.includes(iid) ? 'fx-target' : 'fx-source') : ''].filter(Boolean).join(' ');
  /** A label on a card saying what is about to happen to it, or what choosing it would do. */
  const tagFor = (iid: Iid): { text: string; tone: 'cyan' | 'red' | 'green' | 'gold' | 'grey' } | undefined => {
    if (targetSet.has(iid)) return { text: 'Target', tone: 'cyan' };
    const c = s.combat;
    // Choosing a blocker: what happens to each one.
    if (pickDecision?.kind === 'block' && combatInfo && decisionOptions.has(iid)) {
      const def = defenseOf(s, iid);
      const atk = combatInfo.atk;
      if (def > atk) return { text: 'Survives, no life lost', tone: 'green' };
      if (hasKeyword(s, iid, 'INDESTRUCTIBLE')) return { text: def === atk ? 'Survives, no life lost' : 'Survives, you lose 1 life', tone: 'green' };
      if (def === atk) return { text: 'Dies, no life lost', tone: 'gold' };
      return { text: 'Dies, and you still lose 1 life', tone: 'red' };
    }
    // Boosting: how far each booster gets you.
    if (pickDecision && pickDecision.kind !== 'block' && c && decisionOptions.has(iid)) {
      const defending = c.blocker ?? c.targetCreature;
      const atkSide = pickDecision.kind === 'boostAttack';
      const gain = atkSide ? boostValue(s, iid) : 1;
      if (!defending) return { text: `+${gain} ATK`, tone: 'gold' };
      const atk = attackOf(s, c.attacker) + (atkSide ? picks : c.atkBoosters).filter((b) => s.perms[b]).reduce((n, b) => n + boostValue(s, b), 0);
      const def = defenseOf(s, defending) + (atkSide ? 0 : picks.length);
      if (picks.includes(iid)) return { text: `+${gain} chosen`, tone: 'gold' };
      if (atkSide) return atk + gain >= def ? { text: `+${gain} · wins the clash`, tone: 'green' } : { text: `+${gain} · ${def - atk - gain} more needed`, tone: 'grey' };
      return def + 1 > atk ? { text: '+1 DEF · survives', tone: 'green' } : { text: `+1 DEF · ${atk - def} more needed`, tone: 'grey' };
    }
    // Something on the stack is about to change this card.
    if (spot && s.perms[iid] && (topSet.has(iid) || s.perms[iid].controller === ME)) {
      const after = spot.after;
      if (!after.perms[iid] || after.perms[iid].controller !== s.perms[iid].controller) return { text: !after.perms[iid] ? 'Would be destroyed' : 'Would change sides', tone: 'red' };
      if (isCreature(s, iid)) {
        const d0 = defenseOf(s, iid);
        const d1 = defenseOf(after, iid);
        const a0 = attackOf(s, iid);
        const a1 = attackOf(after, iid);
        if (d1 < d0) return { text: `Would survive with ${d1} DEF`, tone: 'gold' };
        if (d1 > d0 || a1 > a0) return { text: `Would get +${a1 - a0}/+${d1 - d0}`, tone: 'green' };
      }
    }
    return undefined;
  };
  const ringFor = (iid: Iid): 'select' | 'chosen' | 'attack' | undefined => {
    if (s.combat && (s.combat.attacker === iid)) return 'attack';
    if (picks.includes(iid)) return 'chosen';
    if (targetSet.has(iid)) return 'select';
    if (decisionOptions.has(iid)) return 'select';
    if (!myDecision && !targeting && (playable.has(iid) || usable.has(iid))) return 'select';
    return undefined;
  };

  // The game ends for you: a burst in your Field's style (or the table drains to grey), then the end screen.
  const someoneWon = s.phase === 'over' && s.winner !== null;
  // Once you're out, don't wait for banners forever (the others may keep playing fast).
  const [outWaited, setOutWaited] = useState(false);
  useEffect(() => {
    if (!me.eliminated && !someoneWon) return;
    const t = setTimeout(() => setOutWaited(true), 2500);
    return () => clearTimeout(t);
  }, [me.eliminated, someoneWon]);
  const endNow = (someoneWon || (me.eliminated && !watching)) && (!fx.busy || outWaited);
  useEffect(() => {
    if (!endNow || endReady || endFx) return;
    const won = someoneWon && s.winner === ME;
    setEndFx(won ? 'win' : 'lose');
    playSound(won ? 'deckComplete' : 'out');
    setTimeout(() => {
      setEndFx(null);
      setEndReady(true);
    }, won ? 1500 : 1300);
  }, [endNow]);

  // ---------- bigger preview on hover (after a short pause) ----------
  const zoomIn = (iid: Iid) => {
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
    zoomTimer.current = setTimeout(() => {
      if (dragRef.current) return;
      const el = document.querySelector(`.table [data-iid="${iid}"]`) ?? document.querySelector(`.hand [data-iid="${iid}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const W = 340 * 0.66;
      const H = 476 * 0.66;
      const right = r.right + 12 + W < window.innerWidth - 8;
      const x = right ? r.right + 12 : r.left - 12 - W;
      const y = Math.max(8, Math.min(window.innerHeight - H - 8, r.top + r.height / 2 - H / 2));
      setZoom({ iid, x, y });
    }, 250);
  };
  const zoomOut = () => {
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
    zoomTimer.current = null;
    setZoom(null);
  };

  // ---------- token stacks: identical tokens in the same state show as one card "×N" ----------
  const stackKey = (iid: Iid): string | null => {
    const c = s.cards[iid];
    const p = s.perms[iid];
    if (!c?.isToken || !p) return null;
    // Anything involved in what's happening right now stays on its own.
    if (inCombat(iid) || topSet.has(iid) || targetSet.has(iid) || decisionOptions.has(iid) || picks.includes(iid) || highlight === iid || (drag?.started && drag.zones.cards.has(iid))) return null;
    if (p.attachedTo || Object.values(s.perms).some((o) => o.attachedTo === iid)) return null;
    return JSON.stringify([p.controller, c.cardId, c.override ?? null, [...c.extraKeywords].sort(), p.tapped, p.sick, p.counters, p.counterAtk, p.counterDef, p.damage, p.mods, p.infectedBy ?? null]);
  };
  const stackUp = (ids: Iid[]): { iid: Iid; n: number; key: string; members: Iid[]; openKey?: string; lastOpen?: boolean }[] => {
    const out: { iid: Iid; n: number; key: string; members: Iid[]; openKey?: string; lastOpen?: boolean }[] = [];
    const at = new Map<string, number>();
    for (const iid of ids) {
      const k = stackKey(iid);
      if (!k) {
        out.push({ iid, n: 1, key: iid, members: [iid] });
        continue;
      }
      if (openStacks.has(k)) {
        out.push({ iid, n: 1, key: iid, members: [iid], openKey: k });
        continue;
      }
      const i = at.get(k);
      if (i !== undefined) {
        out[i].n++;
        out[i].members.push(iid);
      } else {
        at.set(k, out.length);
        out.push({ iid, n: 1, key: k, members: [iid] });
      }
    }
    // Mark the last card of each opened stack (it gets the Collapse button).
    const lastIdx = new Map<string, number>();
    out.forEach((x, i) => x.openKey && lastIdx.set(x.openKey, i));
    for (const i of lastIdx.values()) out[i].lastOpen = true;
    // An opened stack with only one card left closes itself.
    return out;
  };

  const wrapStack = (it: { iid: Iid; n: number; key: string; lastOpen?: boolean; openKey?: string }, card: JSX.Element): JSX.Element => {
    if (it.n > 1)
      return (
        <div
          key={it.key}
          className="tok-stack"
          title="Click to spread out"
          onClickCapture={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpenStacks((o) => new Set(o).add(it.key));
          }}
        >
          {card}
          <span className="tok-n">×{it.n}</span>
        </div>
      );
    if (it.lastOpen && it.openKey)
      return (
        <Fragment key={it.key}>
          {card}
          <button
            type="button"
            className="tok-collapse"
            onClick={(e) => {
              e.stopPropagation();
              setOpenStacks((o) => {
                const n = new Set(o);
                n.delete(it.openKey!);
                return n;
              });
            }}
          >
            Collapse
          </button>
        </Fragment>
      );
    return card;
  };

  // ---------- pings ----------
  const pingTargetOf = (el: Element | null): { sel: string; label: string } | null => {
    const t0 = pingTargetLocal(el);
    if (!t0 || !online) return t0;
    // Online, the log line is shared: name things the way everyone can read them (and never reveal a card in hand).
    const pn = (pid: PlayerId) => s.players[pid].name;
    const cid = el?.closest('[data-iid]')?.getAttribute('data-iid');
    let label = t0.label;
    if (cid && s.cards[cid]) label = me.hand.includes(cid) ? `a card in ${pn(ME)}'s hand` : s.perms[cid] ? `${pn(s.perms[cid].controller)}'s ${getDef(s.cards[cid].cardId).name}` : getDef(s.cards[cid].cardId).name;
    else if (t0.sel.startsWith('[data-orb')) label = `${pn(ME)}'s Mana Orb`;
    else if (t0.sel.startsWith('[data-stack')) label = 'the stack';
    else if (t0.sel.startsWith('[data-life') || t0.sel.startsWith('[data-strip')) label = pn(Number(t0.sel.replace(/\D/g, '')));
    else if (t0.sel.startsWith('[data-field')) {
      const pl = s.players[Number(t0.sel.replace(/\D/g, ''))];
      label = `${pl.name}'s Field (${getDef(pl.fieldCard!).name})`;
    }
    return { sel: t0.sel, label };
  };
  const pingTargetLocal = (el: Element | null): { sel: string; label: string } | null => {
    if (!el) return null;
    const card = el.closest('[data-iid]');
    const cid = card?.getAttribute('data-iid');
    if (cid && s.cards[cid]) {
      const name = getDef(s.cards[cid].cardId).name;
      return { sel: `[data-iid="${cid}"]`, label: me.hand.includes(cid) ? `your ${name} (in hand)` : describeTarget(s, cid) };
    }
    const orb = el.closest('[data-orb]')?.getAttribute('data-orb');
    if (orb) return { sel: `[data-orb="${orb}"]`, label: 'your Mana Orb' };
    const st = el.closest('[data-stack]')?.getAttribute('data-stack');
    if (st) {
      const i = s.stack.findIndex((it) => String(it.id) === st);
      if (i >= 0) return { sel: `[data-stack="${st}"]`, label: `the stack (${stackItemTitle(s, i)})` };
    }
    const fld = el.closest('[data-field]')?.getAttribute('data-field');
    if (fld !== null && fld !== undefined) {
      const pl = s.players[Number(fld)];
      if (pl?.fieldCard) return { sel: `[data-field="${fld}"]`, label: `${pl.id === ME ? 'your' : `${pl.name}'s`} Field (${getDef(pl.fieldCard).name})` };
    }
    const life = el.closest('[data-life]')?.getAttribute('data-life');
    if (life !== null && life !== undefined) return { sel: `[data-life="${life}"]`, label: Number(life) === ME ? 'yourself' : s.players[Number(life)].name };
    if (el.closest('.me-panel')) return { sel: `[data-life="${ME}"]`, label: 'yourself' };
    const strip = el.closest('[data-strip]')?.getAttribute('data-strip');
    if (strip !== null && strip !== undefined) return { sel: `[data-strip="${strip}"]`, label: s.players[Number(strip)].name };
    return null;
  };

  useEffect(
    () =>
      online?.onPing((from, sel, kind) => {
        const id = Date.now() + Math.random();
        setPings((ps) => [...ps.filter((p) => p.sel !== sel), { id, sel, kind, who: s.players[from]?.name ?? 'Someone' }]);
        setTimeout(() => setPings((ps) => ps.filter((p) => p.id !== id)), 4000);
      }),
    [online, s.players],
  );

  // ---------- quick emotes (online) ----------
  const showBubble = (pid: PlayerId, id: number) => {
    const key = Date.now() + Math.random();
    setBubbles((b) => ({ ...b, [pid]: { id, key } }));
    setTimeout(() => setBubbles((b) => (b[pid]?.key === key ? (({ [pid]: _, ...rest }) => rest)(b) : b)), 3000);
  };
  useEffect(
    () =>
      online?.onEmote((from, id) => {
        if (settings.muteEmotes) return;
        showBubble(from, id);
        playSound('counter');
      }),
    [online, settings.muteEmotes],
  );
  const sendEmote = (id: number) => {
    setEmoteMenu(false);
    if (!online) return;
    if (Date.now() - lastEmote.current < 3000) return setToast('One emote every 3 seconds.');
    lastEmote.current = Date.now();
    online.emote(id);
    showBubble(ME, id);
    playSound('counter');
  };

  const sendPing = (target: { sel: string; label: string }, kind: PingKind) => {
    setWheel(null);
    const now = Date.now();
    pingTimes.current = pingTimes.current.filter((t) => now - t < 5000);
    if (pingTimes.current.length >= 3) return setToast('Too many pings: wait a moment.');
    pingTimes.current.push(now);
    const id = now + Math.random();
    setPings((ps) => [...ps.filter((p) => p.sel !== target.sel), { id, sel: target.sel, kind, who: 'You' }]);
    setTimeout(() => setPings((ps) => ps.filter((p) => p.id !== id)), 4000);
    if (online) return online.ping(target.sel, kind, target.label);
    setS((prev) => {
      const next = { ...prev, log: [...prev.log, `[T${prev.turn}] You ping ${target.label}: ${PING_LABEL[kind]}`] };
      return next;
    });
  };

  useEffect(() => {
    const up = (e: globalThis.MouseEvent) => {
      if (e.button !== 1 || !midDown.current) return;
      clearTimeout(midDown.current.timer);
      sendPing(midDown.current.target, 'look');
      midDown.current = null;
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  });

  const onMiddleDown = (e: MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    const target = pingTargetOf(e.target as Element);
    if (!target) return;
    const x = e.clientX;
    const y = e.clientY;
    const timer = setTimeout(() => {
      midDown.current = null;
      setWheel({ x, y, ...target });
    }, 260);
    midDown.current = { timer, target, x, y };
  };

  const onPingModeClick = (e: MouseEvent) => {
    if (!pingMode || (e.target as Element).closest('.ping-btn, .ping-wheel')) return;
    e.stopPropagation();
    e.preventDefault();
    setPingMode(false);
    const target = pingTargetOf(e.target as Element);
    if (target) setWheel({ x: e.clientX, y: e.clientY, ...target });
    else setToast('Nothing to ping there.');
  };

  // ---------- clicks ----------
  const clickCard = (iid: Iid, e: MouseEvent) => {
    setPreview({ iid });
    if (targeting) return pickTarget(iid);
    if (pickDecision) {
      if (!decisionOptions.has(iid)) return;
      if (pickDecision.kind === 'block') setPicks(picks[0] === iid ? [] : [iid]);
      else setPicks(picks.includes(iid) ? picks.filter((p) => p !== iid) : [...picks, iid]);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(rect.left, window.innerWidth - 300);
    if (me.hand.includes(iid)) {
      if (!(freeMain || myPriority)) return;
      setPopover({ kind: 'hand', iid, x, y: rect.top, opts: handOptions(s, ME, iid) });
    } else if (s.perms[iid]?.controller === ME) {
      if (!(freeMain || myPriority)) return;
      setPopover({ kind: 'field', iid, x, y: rect.bottom + 8, above: rect.top - 8, opts: fieldOptions(s, ME, iid) });
    }
  };

  const pickTarget = (id: string) => {
    if (!targeting) return;
    if (!targetSet.has(id)) return setToast('Choose one of the cards in the popup, or press Cancel.');
    const picked = [...targeting.picked, id];
    if (picked.length < targeting.slots.length) return setTargeting({ ...targeting, picked });
    step(targeting.done(picked));
  };

  const playCard = (iid: Iid, opts: HandOption) => {
    setPopover(null);
    if (!opts.play.needsTarget) return step({ type: 'play', player: ME, card: iid });
    const cardId = s.cards[iid].cardId;
    setTargeting({ title: getDef(cardId).name, prompts: targetPrompts(cardId), slots: opts.play.slots, picked: [], done: (targets) => ({ type: 'play', player: ME, card: iid, targets }) });
  };

  const primary = (): { label: string; onClick?: () => void } => {
    if (s.phase === 'over') return { label: 'Game over' };
    if (s.phase === 'mulligan') return { label: who === ME ? 'Keep or mulligan' : online && who !== null ? `Waiting for ${s.players[who].name}` : 'Bots are deciding…' };
    if (targeting) return { label: 'Cancel', onClick: () => setTargeting(null) };
    if (myDecision) return { label: 'Answer the prompt' };
    if (freeMain) return { label: 'End Main phase', onClick: () => step({ type: 'pass', player: ME }) };
    if (myPriority && autoPassNow && !holdNext) return { label: 'Passing for you…' };
    if (myPriority) return { label: s.stack.length ? 'Pass (let it resolve)' : 'Pass priority', onClick: () => step({ type: 'pass', player: ME }) };
    return { label: `Waiting for ${who !== null ? s.players[who].name : '…'}` };
  };

  // ---------- pieces ----------
  const phaseNow = (() => {
    if (s.phase === 'upkeep') return s.window?.then === 'afterDraw' ? 'Draw' : 'Upkeep';
    if (s.phase === 'main') return s.combat ? 'Combat' : 'Main';
    if (s.phase === 'end') return 'End';
    return '';
  })();

  const combatInfo = (() => {
    const c = s.combat;
    if (!c || !s.perms[c.attacker]) return null;
    const defending = c.blocker && s.perms[c.blocker] ? c.blocker : c.targetCreature && s.perms[c.targetCreature] ? c.targetCreature : null;
    let atk = attackOf(s, c.attacker) + c.atkBoosters.filter((b) => s.perms[b]).reduce((n, b) => n + boostValue(s, b), 0);
    if (defending && hasStatic(s, c.attacker, 'clashDouble')) atk *= 2;
    const def = (defending ? defenseOf(s, defending) : 0) + c.defBoosters.filter((b) => s.perms[b]).length;
    const name = (iid: Iid) => getDef(s.cards[iid].cardId).name;
    return {
      text: youify(`${s.players[c.attackerController].name}'s ${name(c.attacker)} → ${c.defender === ME ? 'you' : s.players[c.defender].name}${defending ? ` (${name(defending)})` : ''}`),
      atk,
      def,
    };
  })();

  const previewShow = (() => {
    if (!preview) return null;
    if ('iid' in preview) return s.cards[preview.iid] ? showInGame(s, preview.iid) : null;
    return showDef(getDef(preview.def), cardNumber(preview.def));
  })();

  const promptBox = (() => {
    if (s.phase === 'over') return null;
    if (myDecision?.kind === 'block' && combatInfo) {
      const chosen = picks[0];
      return (
        <div className="prompt alert" role="alertdialog" aria-labelledby="pr-h">
          <h2 id="pr-h">{s.players[s.combat!.attackerController].name} attacks you</h2>
          <p>
            {getDef(s.cards[s.combat!.attacker].cardId).name} attacks with <b>ATK {combatInfo.atk}</b>. Click a glowing creature to block, or take the hit (lose 1 life, draw 1 card).
          </p>
          <div className="actions">
            <button type="button" className="btn primary" disabled={!chosen} onClick={() => step({ type: 'block', player: ME, blocker: chosen })}>
              {chosen ? `Block with ${getDef(s.cards[chosen].cardId).name}` : 'Block'}
            </button>
            <button type="button" className="btn ghost" onClick={() => step({ type: 'block', player: ME, blocker: null })}>
              Don't block
            </button>
          </div>
        </div>
      );
    }
    if (myDecision && (myDecision.kind === 'boostAttack' || myDecision.kind === 'boostDefense')) {
      const atk = myDecision.kind === 'boostAttack';
      const gain = atk ? picks.reduce((n, p) => n + boostValue(s, p), 0) : picks.length;
      return (
        <div className={`prompt${atk ? '' : ' alert'}`} role="alertdialog" aria-labelledby="pr-h">
          <h2 id="pr-h">{atk ? 'Boost your attack?' : 'Boost your defense?'}</h2>
          <p>
            {combatInfo ? `ATK ${combatInfo.atk} vs DEF ${combatInfo.def}. ` : ''}Click glowing creatures to tap them for +1 {atk ? 'attack' : 'defense'} each.
          </p>
          <div className="actions">
            <button type="button" className="btn primary" disabled={!picks.length} onClick={() => step({ type: 'boost', player: ME, creatures: picks })}>
              {picks.length ? `Boost +${gain}` : 'Boost'}
            </button>
            <button type="button" className="btn ghost" onClick={() => step({ type: 'boost', player: ME, creatures: [] })}>
              No boost
            </button>
          </div>
        </div>
      );
    }
    if (myDecision?.kind === 'confirm') {
      const src = myDecision.ctx.source;
      return (
        <div className="prompt" role="alertdialog" aria-labelledby="pr-h">
          <h2 id="pr-h">{myDecision.offerFrom !== undefined ? `OFFER from ${s.players[myDecision.offerFrom].name}` : src.startsWith('field:') ? 'Your Field' : getDef(s.cards[src].cardId).name}</h2>
          <p>{youify(myDecision.prompt)}</p>
          <div className="actions">
            <button type="button" className="btn primary" autoFocus onClick={() => step({ type: 'confirm', player: ME, accept: true })}>
              {myDecision.offerFrom !== undefined ? 'Accept' : myDecision.cost ? `Yes, pay ${myDecision.cost}` : 'Yes'}
            </button>
            <button type="button" className="btn ghost" onClick={() => step({ type: 'confirm', player: ME, accept: false })}>
              {myDecision.offerFrom !== undefined ? 'Refuse' : 'No'}
            </button>
          </div>
        </div>
      );
    }
    if (myPriority && (s.stack.length || s.combat)) {
      const i = s.stack.length - 1;
      const top = s.stack[i];
      const c = s.combat;
      const nm = (iid: Iid) => getDef(s.cards[iid].cardId).name;
      const title = top
        ? stackItemTitle(s, i)
        : c
          ? `${c.attackerController === ME ? 'Your' : `${s.players[c.attackerController].name}'s`} ${nm(c.attacker)} attacks ${c.defender === ME ? 'you' : s.players[c.defender].name}`
          : '';
      const targets = top ? stackItemCards(s, i).targets : c ? [c.blocker ?? c.targetCreature].filter((x): x is Iid => !!x) : [];
      const mineFirst = top ? top.controller === ME : c?.attackerController === ME;
      const threatened = !mineFirst && (outcome?.hurtsYou || targets.some((t) => s.perms[t]?.controller === ME) || c?.defender === ME);
      const tone = mineFirst ? 'mine' : threatened ? 'threat' : 'calm';
      const waiting = s.stack.slice(0, -1).reverse();
      const nothing = nothingToRespondWith(s, ME);
      return (
        <div className={`prompt respond ${tone}`} role="status" aria-labelledby="rp-h">
          <div className="rp-head">
            <span className="rp-icon">
              <Icon name={tone === 'threat' ? 'death' : top ? 'play' : 'attack'} />
            </span>
            <h2 id="rp-h">{title}</h2>
          </div>
          {targets.length > 0 && (
            <p className="rp-targets">
              {top ? 'Targets ' : 'Against '}
              {targets.map((t) => describeTarget(s, t)).join(', ')}
            </p>
          )}
          {c && !top && <p className="rp-targets">ATK {combatInfo?.atk} vs DEF {combatInfo?.def}</p>}
          <span className="label">IF NOBODY RESPONDS</span>
          <ul className="rp-lines">
            {(outcome?.lines.length ? outcome.lines.slice(0, 5) : ['Nothing visible happens.']).map((l, k) => (
              <li key={k}>
                <Glossed text={l} />
              </li>
            ))}
            {outcome && outcome.lines.length > 5 && <li className="muted">…and {outcome.lines.length - 5} more</li>}
          </ul>
          {waiting.length > 0 && (
            <p className="rp-more">
              Then {waiting.length} more waiting: {waiting.map((w) => (w.kind === 'card' ? nm(w.iid) : w.label)).join(', ')}
            </p>
          )}
          <p className={`rp-you${nothing ? ' none' : ''}`}>{nothing ? 'You have nothing to respond with.' : 'Glowing cards can respond. Everything else is faded.'}</p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => step({ type: 'pass', player: ME })}>
              {top ? 'Pass (let it resolve)' : 'Pass'}
            </button>
          </div>
        </div>
      );
    }
    return null;
  })();

  const choose = myDecision?.kind === 'choose' ? myDecision : null;
  const guide = myDecision?.kind === 'guide' ? myDecision : null;
  const modeDecision = myDecision?.kind === 'mode' ? myDecision : null;
  const playerDecision = myDecision?.kind === 'choosePlayer' ? myDecision : null;
  const mulligan = s.phase === 'mulligan' && who === ME;
  const winner = s.phase === 'over' && s.winner !== null ? s.players[s.winner] : null;
  const p = primary();

  const hint = (() => {
    if (s.phase === 'over') return '';
    if (freeMain) return 'Glowing cards can be used. Click a card in your hand to play or charge it; click your creature to attack. Hold Alt over a card for details.';
    if (myPriority) return 'You have priority: glowing cards can respond, or pass.';
    if (myDecision) return 'Answer the prompt above.';
    return online ? 'Waiting for the other players.' : 'Bots are taking their actions.';
  })();

  return (
    <div className={`game${me.life <= 2 && !me.eliminated && s.phase !== 'over' ? ' danger' : ''}${pingMode ? ' ping-mode' : ''}${targeting || myDecision ? ' calm' : ''}`} onClick={() => { if (popover) setPopover(null); if (emoteMenu) setEmoteMenu(false); }} onMouseDownCapture={onMiddleDown} onClickCapture={onPingModeClick} onAuxClick={(e) => e.button === 1 && e.preventDefault()}>
      <header className="topbar">
        <span style={{ fontFamily: 'var(--display)', fontWeight: 700, letterSpacing: '0.06em' }}>MANAPOOL</span>
        <span className="muted" style={{ fontSize: 15 }}>
          Turn {s.turn} · <b style={{ color: s.active === ME ? 'var(--gold)' : 'var(--text)' }}>{s.active === ME ? 'Your turn' : `${s.players[s.active].name}'s turn`}</b>
        </span>
        <ol className="phases" aria-label="Phase">
          {['Upkeep', 'Draw', 'Main', 'Combat', 'End'].map((ph) => (
            <li key={ph} aria-current={ph === phaseNow ? 'step' : undefined}>
              {ph}
            </li>
          ))}
        </ol>
        {online && (
          <span style={{ position: 'relative', marginLeft: 'auto' }}>
            <button type="button" className={`btn ping-btn${emoteMenu ? ' on' : ''}`} style={{ height: 36 }} aria-expanded={emoteMenu} onClick={(e) => { e.stopPropagation(); setEmoteMenu(!emoteMenu); }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2M9 9.5h.01M15 9.5h.01" /></svg>
              Emote
            </button>
            {emoteMenu && (
              <span className="emote-menu" role="menu">
                {EMOTES.map((e, i) => (
                  <button key={e} type="button" role="menuitem" onClick={(ev) => { ev.stopPropagation(); sendEmote(i); }}>
                    {e}
                  </button>
                ))}
              </span>
            )}
          </span>
        )}
        <button type="button" className={`btn ping-btn${pingMode ? ' on' : ''}`} style={{ height: 36, marginLeft: online ? undefined : 'auto' }} aria-pressed={pingMode} title="Ping: click this, then click anything on the table. Shortcut: middle-click for Look, hold the middle button for all pings." onClick={() => setPingMode(!pingMode)}>
          <Icon name="ping" /> {pingMode ? 'Click something…' : 'Ping'}
        </button>
        <button type="button" className="btn" style={{ height: 36 }} onClick={() => setMenuOpen(true)}>
          Menu
        </button>
      </header>

      <div className="table">
        <div className="table-main">
          <div className="opps">
            {[1, 2, 3].map((k) => s.players[(ME + k) % s.players.length]).filter(Boolean).map((o) => {
              const attacking = s.combat?.attackerController === o.id;
              const defending = s.combat?.defender === o.id;
              const hasPri = who === o.id;
              const cls = ['opp', drag?.started && drag.zones.players.has(o.id) ? 'drop-ok' : '', attacking ? 'attacking' : '', defending ? 'defending' : '', hasPri && !attacking ? 'priority' : '', o.eliminated ? 'out' : '', moodOf(o.fieldCard)].join(' ');
              const faded = (s.fadedOut ?? []).filter((x) => x.controller === o.id);
              return (
                <section key={o.id} className={cls} aria-label={o.name} data-strip={o.id} data-out={o.eliminated ? `OUT · TURN ${fx.outs.find((x) => x.pid === o.id)?.turn ?? s.turn}` : undefined} onClick={() => !targeting && setExpandPid(o.id)}>
                  <FieldScene field={o.fieldCard} />
                  {bubbles[o.id] && <span className="emote-bubble" key={bubbles[o.id].key}>{EMOTES[bubbles[o.id].id]}</span>}
                  <div className="opp-head">
                    <span className="nm">{o.name}</span>
                    <span className={`life${fx.marks.hurt.has(o.id) ? ' fx-hurt' : ''}${fx.marks.heal.has(o.id) ? ' fx-heal' : ''}`} data-life={o.id}>
                      LIFE <b>{o.life}</b>
                    </span>
                    {attacking && <span className="tag" style={{ color: 'var(--red)' }}>ATTACKING</span>}
                    {!attacking && hasPri && <span className="tag" style={{ color: 'var(--cyan)' }}>THINKING</span>}
                    {o.eliminated && <span className="tag muted">OUT</span>}
                    <span style={{ flex: 1 }} />
                    <button type="button" className="icon-btn sm" aria-label={`Expand ${o.name}'s field`} onClick={(e) => { e.stopPropagation(); setExpandPid(o.id); }}>
                      <Icon name="expand" />
                    </button>
                  </div>
                  <div className="opp-stats">
                    <span data-hand-count={o.id} className={fx.marks.bump.has(`hand:${o.id}`) ? 'fx-bump' : undefined}>Hand <b>{o.hand.length}</b></span>
                    <span data-deck={o.id}>Deck <b>{o.deck.length}</b></span>
                    <span data-orbs={o.id} className={fx.marks.bump.has(`orbs:${o.id}`) ? 'fx-bump' : undefined}>Orbs <b style={{ color: '#9be3f0' }}>{o.orbs.filter((x) => x.filled).length}/{o.orbs.length}</b></span>
                    {o.rocks > 0 && <span>Rocks <b style={{ color: '#c3c8f0' }}>{o.rocks}</b></span>}
                    {o.corruptedRocks > 0 && <span>Corrupted <b style={{ color: '#e3c4ea' }}>{o.corruptedRocks}</b></span>}
                    {o.souls > 0 && <span data-souls={o.id} className={fx.marks.bump.has(`souls:${o.id}`) ? 'fx-bump gold' : undefined}>Souls <b style={{ color: 'var(--gold)' }}>{o.souls}</b></span>}
                    <button type="button" data-discard={o.id} className={`link-btn${fx.marks.bump.has(`discard:${o.id}`) ? ' fx-bump' : ''}`} onClick={(e) => { e.stopPropagation(); setDiscardOf(o.id); }}>
                      Discard {o.discard.length}
                    </button>
                    {o.fieldCard && (
                      <span className={`field-link plaque ${moodOf(o.fieldCard)}`} data-field={o.id} onMouseEnter={() => setPreview({ def: o.fieldCard! })}>
                        {getDef(o.fieldCard).name}
                      </span>
                    )}
                  </div>
                  <div className="row-cards">
                    {stackUp(sortField(s, o.field)).map((it, idx) => {
                      const iid = it.iid;
                      return wrapStack(it, <Card
                        key={iid}
                        iid={iid}
                        tapDelay={s.phase === 'upkeep' && s.active === o.id && !s.perms[iid]?.tapped ? idx * 45 : undefined}
                        className={fxClass(iid)}
                        show={showInGame(s, iid)}
                        scale={0.27}
                        tapped={s.perms[iid]?.tapped}
                        ring={ringFor(iid)}
                        dim={dimFor(iid)}
                        tag={tagFor(iid)?.text}
                        tagTone={tagFor(iid)?.tone}
                        onHover={() => { setPreview({ iid }); zoomIn(iid); }}
                        onLeave={zoomOut}
                        onClick={targetSet.has(iid) ? (e) => { e.stopPropagation(); clickCard(iid, e); } : undefined}
                      />);
                    })}
                    {faded.map((perm) => (
                      <div key={perm.iid} className="card-box ghost" style={{ width: 92, height: 128 }}>
                        {getDef(s.cards[perm.iid].cardId).name}: back at End Phase
                      </div>
                    ))}
                    {!o.field.length && !faded.length && <span className="muted" style={{ fontSize: 13 }}>No cards on the field</span>}
                  </div>
                </section>
              );
            })}
          </div>

          <section className={`mine ${moodOf(me.fieldCard)}${myPriority || myDecision ? ' priority' : ''}${promptBox ? ' has-prompt' : ''}${drag?.started && drag.zones.field ? ' drop-ok' : ''}${drag?.started && drag.zones.mana ? ' drop-mana' : ''}`} aria-label="Your field" data-zone="field">
            <FieldScene field={me.fieldCard} />
            <div className="mine-head">
              <span className="label">YOUR FIELD</span>
              <button type="button" className="icon-btn sm" aria-label="Expand your field" onClick={() => setExpandPid(ME)}>
                <Icon name="expand" />
              </button>
              {me.fieldCard && (
                <>
                  <span className="muted" style={{ fontSize: 13 }}>
                    Field:{' '}
                    <span className={`field-link plaque ${moodOf(me.fieldCard)}`} data-field={ME} onMouseEnter={() => setPreview({ def: me.fieldCard! })}>
                      {getDef(me.fieldCard).name}
                    </span>
                  </span>
                  {(getDef(me.fieldCard).script.activated ?? []).map((ab, i) => {
                    const r = tryApply(s, { type: 'activate', player: ME, card: `field:${ME}`, ability: i });
                    return (
                      <button key={ab.label} type="button" className="btn" style={{ height: 28, padding: '0 10px', fontSize: 13 }} disabled={!r.ok} title={r.ok ? undefined : youify(r.error)} onClick={() => step({ type: 'activate', player: ME, card: `field:${ME}`, ability: i })}>
                        {ab.label}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
            <div className="row-cards">
              {stackUp(sortField(s, me.field)).map((it, idx) => {
                const iid = it.iid;
                return wrapStack(it, <Card
                  key={iid}
                  iid={iid}
                  tapDelay={s.phase === 'upkeep' && s.active === ME && !s.perms[iid]?.tapped ? idx * 45 : undefined}
                  className={fxClass(iid)}
                  show={showInGame(s, iid)}
                  scale={0.34}
                  tapped={s.perms[iid]?.tapped}
                  ring={ringFor(iid)}
                  dim={dimFor(iid)}
                  tag={tagFor(iid)?.text}
                  tagTone={tagFor(iid)?.tone}
                  onHover={() => { setPreview({ iid }); zoomIn(iid); }}
                  onLeave={zoomOut}
                  onPointerDown={(e) => startDrag(iid, 'field', e)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (justDragged.current) return;
                    clickCard(iid, e);
                  }}
                />);
              })}
              {(s.fadedOut ?? [])
                .filter((x) => x.controller === ME)
                .map((perm) => (
                  <div key={perm.iid} className="card-box ghost" style={{ width: 116, height: 162 }}>
                    {getDef(s.cards[perm.iid].cardId).name}
                    <br />
                    FADED OUT · back at the End Phase
                  </div>
                ))}
              {!me.field.length && <span className="muted">Your creatures, artifacts and anthems go here.</span>}
            </div>
            <ManaBar
              s={s}
              pay={pay}
              spent={fx.flash.spent}
              arriving={fx.flash.arriving}
              chargeText={(() => {
                const allowed = chargesAllowed(s, ME);
                const left = allowed - me.chargesThisTurn;
                return s.active !== ME ? 'on your turn' : left <= 0 ? 'used' : allowed > 1 ? `${left} of ${allowed} left` : 'available';
              })()}
              chargeOk={s.active === ME && chargesAllowed(s, ME) - me.chargesThisTurn > 0}
              onOrbEnter={(iid, filled) => {
                setPreview({ iid });
                setHovered({ ...showInGame(s, iid), notes: [`Charged as a Mana Orb, currently ${filled ? 'filled' : 'used (it refills in your Upkeep)'}.`] });
              }}
              onRockEnter={(c) => {
                const id = c ? 'corrupted-mana-rock' : 'mana-rock';
                setPreview({ def: id });
                setHovered(showDef(getDef(id)));
              }}
              onLeave={() => setHovered(null)}
            />
            {promptBox}
            {result && (
              <div className="result-note" key={result.id} role="status">
                <b>{result.title}</b>
                {result.lines.map((l, k) => (
                  <span key={k}>{l}</span>
                ))}
              </div>
            )}
          </section>

          <section className="hand-row" aria-label="Your hand">
            {me.hand.length > 1 && (
              <button
                type="button"
                className="hand-sort"
                disabled={handSorted}
                title="Sorts the cards in your hand now by cost, then type. Cards you draw later still go to the right."
                onClick={(e) => { e.stopPropagation(); setHandOrder(sortHand(s, me.hand)); }}
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h10M4 12h7M4 18h4M18 5v14M15 16l3 3 3-3" /></svg>
                {handSorted ? 'Hand sorted' : 'Sort hand'}
              </button>
            )}
            <div className="hand">
              {shownHand.map((iid, i) => {
                const mid = (me.hand.length - 1) / 2;
                const off = i - mid;
                return (
                  <div
                    key={iid}
                    className={`slot${popover?.iid === iid ? ' sel' : ''}${newCards.has(iid) ? ' new' : ''}${fx.marks.landing.has(iid) ? ' landing' : ''}`}
                    style={{ ['--land' as string]: `${fx.marks.landing.get(iid) ?? 0}ms`, ['--rot' as string]: `${off * Math.min(2.4, 16 / Math.max(1, me.hand.length))}deg`, ['--dy' as string]: `${Math.min(14, off * off * 0.9)}px`, zIndex: i + 1 }}
                  >
                    <Card
                      iid={iid}
                      show={showInGame(s, iid)}
                      scale={0.46}
                      ring={ringFor(iid)}
                      dim={(freeMain || myPriority) && !playable.has(iid)}
                      onHover={() => {
                        setPreview({ iid });
                        previewPay(iid);
                        zoomIn(iid);
                      }}
                      onLeave={() => {
                        setPay(null);
                        zoomOut();
                      }}
                      onPointerDown={(e) => startDrag(iid, 'hand', e)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (justDragged.current) return;
                        clickCard(iid, e);
                      }}
                    />
                  </div>
                );
              })}
              {!me.hand.length && <span className="muted">No cards in hand.</span>}
            </div>
            <div className="me-panel">
              {bubbles[ME] && <span className="emote-bubble mine" key={bubbles[ME].key}>{EMOTES[bubbles[ME].id]}</span>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="nm">You</span>
                <span className={`life big${me.life <= 2 && !me.eliminated ? ' danger' : ''}${fx.marks.hurt.has(ME) ? ' fx-hurt' : ''}${fx.marks.heal.has(ME) ? ' fx-heal' : ''}`} data-life={ME}>
                  LIFE <b>{me.life}</b>
                </span>
              </div>
              <span className="muted" style={{ fontSize: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span data-deck={ME}>Deck {me.deck.length}</span> ·
                <button type="button" data-discard={ME} className={`link-btn${fx.marks.bump.has(`discard:${ME}`) ? ' fx-bump' : ''}${me.discardPlays > 0 && discardPlayable ? ' unlock' : ''}`} onClick={(e) => { e.stopPropagation(); setDiscardOf(ME); }} style={discardPlayable ? { color: 'var(--green)', fontWeight: 700 } : undefined}>
                  Discard {me.discard.length}
                  {discardPlayable ? ` (${discardPlayable} playable)` : ''}
                </button>
                {me.souls > 0 && <span data-souls={ME} className={fx.marks.bump.has(`souls:${ME}`) ? 'fx-bump gold' : undefined}>· Souls <b style={{ color: 'var(--gold)' }}>{me.souls}</b></span>}
              </span>
              <button type="button" className="btn primary big" disabled={!p.onClick} onClick={(e) => { e.stopPropagation(); p.onClick?.(); }}>
                {p.label === 'Passing for you…' && <span className="pulse-dot" />}
                {p.label}
              </button>
              {s.phase !== 'over' && s.phase !== 'mulligan' && (
                <button
                  type="button"
                  className={`btn toggle${settings.autoPass.passAll ? ' on' : ''}`}
                  style={{ height: 34, fontSize: 13 }}
                  aria-pressed={settings.autoPass.passAll}
                  title="When on, the game passes every chance to respond for you, even when you could play something. Your own Main phase, blocks, boosts and choices still wait for you."
                  onClick={(e) => {
                    e.stopPropagation();
                    updateSettings({ ...settings, autoPass: { ...settings.autoPass, passAll: !settings.autoPass.passAll } });
                  }}
                >
                  {settings.autoPass.passAll ? 'Skipping all responses · ON' : 'Skip all responses · OFF'}
                </button>
              )}
              {(autoPassNow || who !== ME) && !settings.autoPass.passAll && s.phase !== 'over' && s.phase !== 'mulligan' && (
                <button type="button" className="btn ghost" style={{ height: 34, fontSize: 13 }} aria-pressed={holdNext} onClick={(e) => { e.stopPropagation(); setHoldNext(!holdNext); }}>
                  {holdNext ? 'Will stop at your next chance' : 'Stop at the next chance'}
                </button>
              )}
              <span className="hint">{hint}</span>
            </div>
          </section>
        </div>

        <aside className="side" aria-label="Details">
          <div className="preview-slot">{previewShow ? <Card show={previewShow} scale={0.7} badges={false} /> : <div className="preview-empty">Hover a card to read it here. Hold Alt for full details and keyword help.</div>}</div>
          <StackPanel
            s={s}
            who={who}
            hidden={stackHidden}
            setHidden={setStackHidden}
            targetSet={targetSet}
            onHover={(iid) => {
              if (iid) setPreview({ iid });
              setHighlight(iid);
            }}
            onPick={(iid) => {
              pickTarget(iid);
            }}
          />
          <LogPanel s={s} onHoverName={(iid) => { setHighlight(iid); if (iid) setPreview({ iid }); }} />
        </aside>
      </div>

      {drag?.started && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          <Card show={showInGame(s, drag.iid)} scale={0.3} badges={false} />
          {drag.over && <span className={`drag-label${drag.over.ok ? ' ok' : ' no'}`}>{drag.over.label}</span>}
        </div>
      )}

      <FxLayer fx={fx} label={combatInfo ? `ATK ${combatInfo.atk}  vs  DEF ${combatInfo.def}` : null} />
      <PingLayer pings={pings} onGone={(id) => setPings((ps) => ps.filter((p) => p.id !== id))} />
      {wheel && (
        <div className="ping-back" onClick={(e) => { e.stopPropagation(); setWheel(null); }} onContextMenu={(e) => { e.preventDefault(); setWheel(null); }}>
          <div className="ping-wheel" role="menu" aria-label={`Ping ${wheel.label}`} style={{ left: wheel.x, top: wheel.y }} onClick={(e) => e.stopPropagation()}>
            {(['look', 'careful', 'attack', 'help'] as PingKind[]).map((k) => (
              <button key={k} type="button" role="menuitem" className={`pw ${k}`} autoFocus={k === 'look'} onClick={() => sendPing(wheel, k)}>
                {PING_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      )}

      {expandPid !== null && (
        <ExpandedField
          s={s}
          pid={expandPid}
          setPid={setExpandPid}
          onClose={() => setExpandPid(null)}
          onHover={(iid) => setPreview({ iid })}
          onDiscard={(pid) => { setExpandPid(null); setDiscardOf(pid); }}
          ringFor={ringFor}
        />
      )}

      {popover && (
        <div ref={popRef} className="popover" style={{ left: popover.x, top: popover.kind === 'hand' ? undefined : popover.y, bottom: popover.kind === 'hand' ? window.innerHeight - popover.y + 8 : undefined }} onClick={(e) => e.stopPropagation()}>
          <span className="ttl">{getDef(s.cards[popover.iid].cardId).name}</span>
          {popover.kind === 'hand' ? (
            <>
              <button type="button" disabled={!popover.opts.play.legal} onClick={() => playCard(popover.iid, popover.opts)}>
                Play{getDef(s.cards[popover.iid].cardId).cost ? ` (${getDef(s.cards[popover.iid].cardId).cost} mana)` : ''}
              </button>
              {!popover.opts.play.legal && popover.opts.play.why && <span className="why">{youify(popover.opts.play.why)}</span>}
              <button type="button" disabled={!popover.opts.charge.legal} onClick={() => step({ type: 'charge', player: ME, card: popover.iid })}>
                Charge as a Mana Orb
              </button>
              {!popover.opts.charge.legal && popover.opts.charge.why && <span className="why">{youify(popover.opts.charge.why)}</span>}
            </>
          ) : (
            <>
              {popover.opts.attackTargets.map((t) => (
                <button key={t} type="button" onClick={() => step({ type: 'attack', player: ME, attacker: popover.iid, target: t })}>
                  Attack {s.players[t].name}
                </button>
              ))}
              {popover.opts.faceoffTargets.length > 0 && (
                <button type="button" onClick={() => { setPopover(null); const attacker = popover.iid;
                  setTargeting({
                    title: `${getDef(s.cards[attacker].cardId).name}: FACEOFF`,
                    prompts: ['Choose the creature to attack'],
                    slots: [popover.opts.faceoffTargets.map((f) => f.creature)],
                    picked: [],
                    done: ([c]) => ({ type: 'attack', player: ME, attacker, target: s.perms[c].controller, targetCreature: c }),
                  }); }}>
                  Attack a creature (FACEOFF)
                </button>
              )}
              {popover.opts.abilities.map((a) => (
                <div key={a.index} style={{ display: 'contents' }}>
                  <button type="button" disabled={!a.legal} onClick={() => step({ type: 'activate', player: ME, card: popover.iid, ability: a.index })}>
                    {a.label}
                  </button>
                  {!a.legal && a.why && <span className="why">{youify(a.why)}</span>}
                </div>
              ))}
              {!popover.opts.attackTargets.length && !popover.opts.abilities.length && (
                <span className="why">{isCreature(s, popover.iid) ? (s.perms[popover.iid]?.tapped ? 'Tapped.' : s.perms[popover.iid]?.sick ? 'Summoning sickness: it can attack next turn.' : 'It can only attack during your Main phase.') : 'Nothing to do with this card right now.'}</span>
              )}
            </>
          )}
        </div>
      )}

      {discardOf !== null && (
        <div className="modal-back" onClick={() => setDiscardOf(null)}>
          <div className="modal" role="dialog" aria-labelledby="dp-h" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <h2 id="dp-h">{discardOf === ME ? 'Your discard pile' : `${s.players[discardOf].name}'s discard pile`}</h2>
              <span className="muted">
                {s.players[discardOf].discard.length} card{s.players[discardOf].discard.length === 1 ? '' : 's'} · newest first · hold Alt over a card for details
              </span>
            </div>
            <div className="choices">
              {[...s.players[discardOf].discard].reverse().map((iid) => {
                const opts = discardOf === ME && (freeMain || myPriority) ? handOptions(s, ME, iid) : null;
                return (
                  <div key={iid} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                    <Card show={showInGame(s, iid)} scale={0.42} onHover={() => setPreview({ iid })} />
                    {opts?.play.legal && (
                      <button type="button" className="btn primary" style={{ height: 34, padding: '0 12px', fontSize: 13 }} onClick={() => { setDiscardOf(null); playCard(iid, opts); }}>
                        Play ({getDef(s.cards[iid].cardId).cost ?? 0})
                      </button>
                    )}
                  </div>
                );
              })}
              {!s.players[discardOf].discard.length && <p className="muted">Empty. Played Spells and Incantations, destroyed cards and destroyed Mana Orbs go here.</p>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn primary" autoFocus onClick={() => setDiscardOf(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {targeting && (
        <div className="modal-back">
          <div className="modal" role="dialog" aria-labelledby="tg-h" style={{ width: 'min(1100px, 94vw)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <h2 id="tg-h">{targeting.title}</h2>
              {targeting.slots.length > 1 && (
                <span className="muted">
                  Target {targeting.picked.length + 1} of {targeting.slots.length}
                </span>
              )}
            </div>
            <p style={{ fontSize: 17 }}>{targeting.prompts[targeting.picked.length]}</p>
            {targeting.picked.length > 0 && (
              <p className="muted">
                Chosen so far: {targeting.picked.map((t) => getDef(s.cards[t].cardId).name).join(', ')}
              </p>
            )}
            <GroupedChoices s={s} ids={[...targetSet]} chosen={[]} onPick={pickTarget} onHover={(o) => setPreview({ iid: o })} />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              {targeting.picked.length > 0 && (
                <button type="button" className="btn" onClick={() => setTargeting({ ...targeting, picked: targeting.picked.slice(0, -1) })}>
                  Back
                </button>
              )}
              <button type="button" className="btn" autoFocus onClick={() => setTargeting(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {choose && (
        <div className="modal-back">
          <div className="modal" role="dialog" aria-labelledby="ch-h">
            <h2 id="ch-h">{choose.prompt}</h2>
            <GroupedChoices s={s} ids={choose.options} chosen={picks} onPick={(o) => setPicks([o])} onHover={(o) => setPreview({ iid: o })} />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              {choose.optional && (
                <button type="button" className="btn" onClick={() => step({ type: 'choose', player: ME, choice: null })}>
                  Choose nothing
                </button>
              )}
              <button type="button" className="btn primary" disabled={!picks[0]} onClick={() => step({ type: 'choose', player: ME, choice: picks[0] })}>
                Choose
              </button>
            </div>
          </div>
        </div>
      )}

      {guide && <GuidePanel key={guide.cards.join()} s={s} cards={guide.cards} onHover={(iid) => setPreview({ iid })} onDone={(top, bottom) => step({ type: 'guide', player: ME, top, bottom })} />}

      {modeDecision && (
        <div className="modal-back">
          <div className="modal" role="dialog" aria-labelledby="mo-h" style={{ width: 520 }}>
            <h2 id="mo-h">{modeDecision.prompt}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {modeDecision.labels.map((l, i) => (
                <button key={l} type="button" className="btn" style={{ height: 52, fontSize: 17 }} autoFocus={i === 0} onClick={() => step({ type: 'mode', player: ME, index: i })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {playerDecision && (
        <div className="modal-back">
          <div className="modal" role="dialog" aria-labelledby="pl-h" style={{ width: 520 }}>
            <h2 id="pl-h">{playerDecision.prompt}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {playerDecision.options.map((pid) => (
                <button key={pid} type="button" className="btn" style={{ height: 52, fontSize: 17, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => step({ type: 'choosePlayer', player: ME, choice: pid })}>
                  <span>{pid === ME ? 'You' : s.players[pid].name}</span>
                  <span className="muted" style={{ fontSize: 14 }}>
                    {s.players[pid].life} life · {s.players[pid].hand.length} cards in hand · {s.players[pid].field.length} on the field
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mulligan && (
        <div className="modal-back">
          <div className="modal" role="dialog" aria-labelledby="mu-h">
            <h2 id="mu-h">Your opening hand</h2>
            <p className="muted">Keep these 7 cards, or shuffle them back and draw 6. You can mulligan once.</p>
            <div className="choices">
              {me.hand.map((iid) => (
                <Card key={iid} show={showInGame(s, iid)} scale={0.42} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" disabled={me.mulliganUsed} onClick={() => step({ type: 'mulligan', player: ME })}>
                Mulligan (draw 6)
              </button>
              <button type="button" className="btn primary" autoFocus onClick={() => step({ type: 'keep', player: ME })}>
                Keep
              </button>
            </div>
          </div>
        </div>
      )}

      {endFx && (
        <div className={`end-fx ${endFx} ${moodOf(me.fieldCard)}`} aria-hidden="true">
          {endFx === 'win' &&
            Array.from({ length: 46 }, (_, i) => (
              <i key={i} style={{ ['--x' as string]: `${(i * 37) % 100}%`, ['--dx' as string]: `${((i * 53) % 60) - 30}vw`, ['--dy' as string]: `${-20 - ((i * 29) % 60)}vh`, ['--r' as string]: `${(i * 71) % 360}deg`, animationDelay: `${(i % 9) * 40}ms` }} />
            ))}
        </div>
      )}

      {zoom && s.cards[zoom.iid] && !drag?.started && (
        <div className="zoom-card" style={{ left: zoom.x, top: zoom.y }} aria-hidden="true">
          <Card show={showInGame(s, zoom.iid)} scale={0.66} />
        </div>
      )}

      {confirmConcede && (
        <div className="modal-back" onClick={() => setConfirmConcede(false)}>
          <div className="modal" role="dialog" aria-labelledby="cc-h" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <h2 id="cc-h">Concede this game?</h2>
            <p className="muted" style={{ margin: 0 }}>{online ? "You're out of this game; the others keep playing." : "You're out; the bots keep playing and you can watch the rest."}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" autoFocus onClick={() => setConfirmConcede(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  setConfirmConcede(false);
                  setMenuOpen(false);
                  step({ type: 'concede', player: ME });
                }}
              >
                Concede
              </button>
            </div>
          </div>
        </div>
      )}

      {endNow && endReady && (
        <EndScreen
          s={s}
          outs={fx.outs}
          won={winner?.id === ME}
          over={!!winner}
          onExit={onExit}
          setup={setup}
          online={online}
          onRematch={(mode) => onRematch(mode, winner?.id === ME ? 1 + Math.floor(Math.random() * 3) : ME)}
          onWatch={() => setWatching(true)}
        />
      )}

      {menuOpen && (
        <div className="modal-back" onClick={() => setMenuOpen(false)}>
          <div className="modal" role="dialog" aria-labelledby="gm-h" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <h2 id="gm-h">Game menu</h2>
            <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <legend className="label" style={{ marginBottom: 8 }}>SOUND</legend>
              {online && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={!settings.muteEmotes} onChange={() => updateSettings({ ...settings, muteEmotes: !settings.muteEmotes })} />
                  <span>Show other players' emotes</span>
                </label>
              )}
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span style={{ width: 118 }}>Field music</span>
                <input type="range" min={0} max={100} step={5} aria-label="Music volume" value={Math.round(settings.music * 100)} onChange={(e) => updateSettings({ ...settings, music: Number(e.target.value) / 100 })} style={{ flex: 1 }} />
                <span className="muted" style={{ width: 40, textAlign: 'right' }}>{settings.music ? `${Math.round(settings.music * 100)}%` : 'Off'}</span>
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={settings.sound} onChange={() => updateSettings({ ...settings, sound: !settings.sound })} />
                  <span>Sound effects</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  aria-label="Volume"
                  disabled={!settings.sound}
                  value={Math.round(settings.volume * 100)}
                  onChange={(e) => updateSettings({ ...settings, volume: Number(e.target.value) / 100 })}
                  onPointerUp={() => playSound('charge')}
                  style={{ flex: 1 }}
                />
                <span className="muted" style={{ width: 40, textAlign: 'right' }}>{Math.round(settings.volume * 100)}%</span>
              </div>
            </fieldset>
            <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <legend className="label" style={{ marginBottom: 8 }}>BOT SPEED</legend>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['slow', 'normal', 'fast'] as const).map((sp) => (
                  <button key={sp} type="button" className="chip" aria-pressed={settings.botSpeed === sp} onClick={() => updateSettings({ ...settings, botSpeed: sp })}>
                    {sp[0].toUpperCase() + sp.slice(1)}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <legend className="label" style={{ marginBottom: 8 }}>AUTO-PASS</legend>
              {(
                [
                  ['skipNothing', "Skip when I can't do anything", 'No playable Incantation or ability: pass automatically.'],
                  ['stopAttacked', "Always stop when I'm attacked", 'Even with nothing to play, so you can watch the clash.'],
                  ['stopTargeted', 'Stop when a card targets my things', 'Your creature, artifact or anthem is the target.'],
                  ['stopOppEnd', "Stop at every opponent's End Phase", 'Your usual chance to use Incantations before your turn.'],
                  ['skipOwnSteps', 'Skip my own empty Upkeep and Draw', 'Go straight to your Main phase when nothing triggers.'],
                ] as [keyof AutoPass, string, string][]
              ).map(([k, title, note]) => (
                <label key={k} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={settings.autoPass[k]} onChange={(e) => updateSettings({ ...settings, autoPass: { ...settings.autoPass, [k]: e.target.checked } })} style={{ width: 18, height: 18, marginTop: 3, accentColor: 'var(--gold)' }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <b>{title}</b>
                    <span className="muted" style={{ fontSize: 14 }}>{note}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              {s.phase !== 'over' && !me.eliminated && s.phase !== 'mulligan' && (
                <button type="button" className="btn danger ghost" style={{ marginRight: 'auto' }} onClick={() => setConfirmConcede(true)}>
                  Concede
                </button>
              )}
              <button type="button" className="btn danger" onClick={onExit}>
                Leave game
              </button>
              <button type="button" className="btn primary" onClick={() => setMenuOpen(false)} autoFocus>
                Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="alert">
          {toast}
        </div>
      )}
    </div>
  );
}

/** GUIDE: look at the top cards of your deck; keep any on top in the order you choose, put the rest on the bottom. */
function GuidePanel({ s, cards, onHover, onDone }: { s: GameState; cards: Iid[]; onHover: (iid: Iid) => void; onDone: (top: Iid[], bottom: Iid[]) => void }) {
  const [top, setTop] = useState<Iid[]>(cards);
  const [bottom, setBottom] = useState<Iid[]>([]);
  const move = (list: Iid[], set: (l: Iid[]) => void, i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  const row = (list: Iid[], set: (l: Iid[]) => void, where: 'top' | 'bottom') => (
    <div className="choices" style={{ minHeight: 230 }}>
      {list.map((iid, i) => (
        <div key={iid} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          <Card show={showInGame(s, iid)} scale={0.42} onHover={() => onHover(iid)} />
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="btn" style={{ height: 34, padding: '0 10px' }} aria-label="Move left" disabled={i === 0} onClick={() => move(list, set, i, -1)}>
              ←
            </button>
            <button
              type="button"
              className="btn"
              style={{ height: 34, padding: '0 10px', fontSize: 13 }}
              onClick={() => {
                if (where === 'top') {
                  setTop(top.filter((x) => x !== iid));
                  setBottom([...bottom, iid]);
                } else {
                  setBottom(bottom.filter((x) => x !== iid));
                  setTop([...top, iid]);
                }
              }}
            >
              {where === 'top' ? 'To bottom' : 'To top'}
            </button>
            <button type="button" className="btn" style={{ height: 34, padding: '0 10px' }} aria-label="Move right" disabled={i === list.length - 1} onClick={() => move(list, set, i, 1)}>
              →
            </button>
          </div>
        </div>
      ))}
      {!list.length && <p className="muted">None</p>}
    </div>
  );
  return (
    <div className="modal-back">
      <div className="modal" role="dialog" aria-labelledby="gd-h" style={{ width: 'min(1000px, 94vw)' }}>
        <h2 id="gd-h">GUIDE {cards.length}</h2>
        <p className="muted">These are the top cards of your deck. Arrange them: the leftmost card on top goes back on top of your deck.</p>
        <span className="label">ON TOP (LEFT = TOP OF THE DECK)</span>
        {row(top, setTop, 'top')}
        <span className="label">ON THE BOTTOM (LEFT GOES DOWN FIRST)</span>
        {row(bottom, setBottom, 'bottom')}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn primary" autoFocus onClick={() => onDone(top, bottom)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** Text with keywords that show their meaning on hover. */
function Glossed({ text }: { text: string }) {
  const parts = text.split(/(\b[A-Z]{2,}[A-Z'-]*(?:\s+[A-Z]{2,}[A-Z'-]*)*\b)/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = i % 2 ? meaningOf(p) : null;
        return m ? (
          <abbr key={i} className="kw" title={m}>
            {p}
          </abbr>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </>
  );
}

/** Victory or defeat: how the game went. */
function EndScreen({ s, outs, won, over, setup, online, onExit, onRematch, onWatch }: { s: GameState; outs: OutInfo[]; won: boolean; over: boolean; setup?: GameSetup; online?: OnlineLink; onExit: () => void; onRematch: (mode: RematchMode) => void; onWatch: () => void }) {
  const tribe = (name: string) => name.replace(/\s*(precon|deck)$/i, '');
  const seats = setup ? [setup.me, ...setup.bots] : [];
  const options: { mode: RematchMode; title: string; sub: string }[] = !setup ? [] : [
    { mode: 'same', title: 'Same decks', sub: `${tribe(setup.me.deckName)} vs ${setup.bots.map((b) => tribe(b.deckName)).join(', ')} again` },
    { mode: 'swap', title: 'Swap decks', sub: `Every deck moves one seat left: you take ${seats[1].name}'s ${tribe(seats[1].deckName)}` },
    { mode: 'random', title: 'New random decks', sub: 'Everyone gets a random precon' },
  ];
  const me = s.players[ME];
  const winner = s.winner !== null ? s.players[s.winner] : null;
  const mineOut = outs.find((o) => o.pid === ME);
  const finished = outs.filter((o) => o.byPlayer === ME && o.pid !== ME).length;
  const played = s.log.filter((l) => /\] You plays? /.test(l)).length;
  const order = [...outs].reverse();
  const place = (pid: PlayerId) => s.players.length - outs.findIndex((o) => o.pid === pid);
  const lastOut = outs[outs.length - 1];
  return (
    <div className="modal-back">
      <div className={`modal endscreen${won ? ' won' : ''}`} role="dialog" aria-labelledby="go-h">
        <span className="es-kicker">{won ? 'YOU WIN' : winner ? `${winner.name.toUpperCase()} WINS` : 'THE GAME GOES ON'}</span>
        <h2 id="go-h" className="es-title">{won ? 'VICTORY' : 'DEFEATED'}</h2>
        {!won && mineOut && (
          <p className="es-sub">
            {place(ME)}
            {place(ME) === 2 ? 'nd' : place(ME) === 3 ? 'rd' : 'th'} place · out on turn {mineOut.turn}
            {mineOut.by ? ` to ${mineOut.by.replace(/^your /, 'your own ')}` : ''}
          </p>
        )}
        <div className="es-stats">
          <div><b>{s.turn}</b><span>turns</span></div>
          <div><b>{me.life}</b><span>life left</span></div>
          <div><b>{finished}</b><span>players you finished</span></div>
          <div><b>{played}</b><span>cards played</span></div>
        </div>
        {lastOut?.by && over && (
          <div className="es-row">
            <span className="label" style={{ color: 'var(--gold)' }}>FINAL BLOW</span>
            <span>
              {lastOut.by.replace(/^your /, 'Your ')} knocked out {lastOut.pid === ME ? 'you' : s.players[lastOut.pid].name}
            </span>
          </div>
        )}
        {order.length > 0 && (
          <div className="es-row">
            <span className="label">ORDER OUT</span>
            <span>{order.map((o) => `${place(o.pid)}${place(o.pid) === 2 ? 'nd' : place(o.pid) === 3 ? 'rd' : 'th'} ${o.pid === ME ? 'You' : s.players[o.pid].name} (turn ${o.turn})`).join(' · ')}</span>
          </div>
        )}
        {online && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn primary" autoFocus onClick={online.backToLobby}>
              Back to the lobby
            </button>
            <p className="muted" style={{ margin: 0 }}>Change decks there; the host starts the next game when everyone is ready.</p>
          </div>
        )}
        {!online && <span className="label" style={{ color: 'var(--gold)', marginTop: 6 }}>PLAY AGAIN</span>}
        {!online && <div className="es-rematch">
          {options.map((o, i) => (
            <button key={o.mode} type="button" className={`btn${i === 0 ? ' primary' : ''}`} onClick={() => onRematch(o.mode)} autoFocus={i === 0}>
              <b>{o.title}</b>
              <span>{o.sub}</span>
            </button>
          ))}
        </div>}
        {!online && <p className="muted" style={{ fontSize: 13, margin: 0 }}>{won ? 'A random opponent goes first.' : 'You go first.'}</p>}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button type="button" className="btn" onClick={onExit}>
            Main menu
          </button>
          {!over && (
            <button type="button" className="btn" onClick={onWatch}>
              Watch the rest
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
