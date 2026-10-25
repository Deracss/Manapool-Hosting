// Messages between the ManaPool app and the online game server (JSON over a WebSocket).
import type { Action, GameState, PlayerId } from '../../engine/src/index.ts';

/** Bumped whenever the messages change, so old apps get a clear "please update" instead of odd errors. */
export const PROTOCOL = 6;

export interface SeatInfo {
  name: string;
  kind: 'human' | 'bot' | 'open';
  deckName?: string;
  field?: string | null;
  connected?: boolean;
  ready?: boolean;
  botDeck?: string | null; // open / bot seats: the precon the host picked (null = random)
}

/** Quick emotes (online). */
export const EMOTES = ['Good game', 'Nice!', 'Oops', 'Thinking…', 'Well played', 'Hello!'] as const;

export interface Loadout {
  name: string;
  deck: string[];
  deckName: string;
  field: string;
}

export type ClientMsg =
  | ({ t: 'create'; v: number } & Loadout)
  | ({ t: 'join'; v: number; code: string } & Loadout)
  | { t: 'rejoin'; v: number; code: string; token: string }
  | { t: 'restore'; v: number; token: string; blob: string } // bring back a game the server lost (restart), from a sealed snapshot
  | { t: 'start' }
  | { t: 'act'; action: Action }
  | { t: 'ping'; sel: string; kind: string; label: string }
  | { t: 'emote'; id: number }
  | { t: 'react'; iid: string; code: string } // the owner's reaction to a cast (checked against OWNER_HASH)
  | ({ t: 'loadout' } & Omit<Loadout, 'name'>)
  | { t: 'botDeck'; seat: PlayerId; deck: string | null }
  | { t: 'ready'; ready: boolean }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'room'; code: string; seat: PlayerId; token: string; host: boolean; hostSeat: PlayerId; seats: SeatInfo[]; playing: boolean }
  | { t: 'state'; state: GameState; game: number }
  | { t: 'ping'; from: PlayerId; sel: string; kind: string }
  | { t: 'emote'; from: PlayerId; id: number }
  | { t: 'react'; from: PlayerId; iid: string }
  | { t: 'error'; msg: string }
  | { t: 'closed'; msg: string }
  | { t: 'snapshot'; code: string; blob: string }; // sealed copy of the whole game (only the server can open it), kept by players in case the server restarts
