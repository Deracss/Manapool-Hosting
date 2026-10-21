// What one player is allowed to see of the game (online play): every card that isn't public becomes a face-down
// placeholder. Public: the field, the stack, discard piles, cards faded out, and your own hand and Mana Orbs.
import { HIDDEN_CARD } from './cards/registry.ts';
import type { GameState, PlayerId } from './types.ts';

export function viewFor(s: GameState, pid: PlayerId): GameState {
  const v = structuredClone(s);
  const visible = new Set<string>(Object.keys(v.perms));
  for (const it of v.stack) if (it.kind === 'card') visible.add(it.iid);
  for (const p of v.players) for (const c of p.discard) visible.add(c);
  for (const f of v.fadedOut ?? []) visible.add(f.iid);
  const me = v.players[pid];
  if (me) {
    for (const c of me.hand) visible.add(c);
    for (const o of me.orbs) visible.add(o.iid);
  }
  for (const [iid, c] of Object.entries(v.cards)) {
    if (visible.has(iid)) continue;
    c.cardId = HIDDEN_CARD;
    c.override = undefined;
    c.extraKeywords = [];
  }
  // Nothing that would let a client predict the shuffle.
  v.rng = 0;
  return v;
}
