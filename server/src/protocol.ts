// Messages between the ManaPool app and the online game server (JSON over a WebSocket).
import type { Action, GameState, PlayerId } from '../../engine/src/index.ts';

/** Bumped whenever the messages change, so old apps get a clear "please update" instead of odd errors. */
export const PROTOCOL = 1;

export interface SeatInfo {
  name: string;
  kind: 'human' | 'bot' | 'open';
  deckName?: string;
  connected?: boolean;
}

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
  | { t: 'start' }
  | { t: 'act'; action: Action }
  | { t: 'ping'; sel: string; kind: string; label: string }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'room'; code: string; seat: PlayerId; token: string; host: boolean; hostSeat: PlayerId; seats: SeatInfo[]; playing: boolean }
  | { t: 'state'; state: GameState; game: number }
  | { t: 'ping'; from: PlayerId; sel: string; kind: string }
  | { t: 'error'; msg: string }
  | { t: 'closed'; msg: string };
