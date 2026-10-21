// Which seat you are sitting in. Against bots you're always seat 0; online it's the seat the server gave you.
import type { PlayerId } from './engine';

export let ME: PlayerId = 0;
/** Your name as the engine writes it in the log ("You" against bots; your chosen name online). */
export let MY_NAME = 'You';

export function setSeat(pid: PlayerId, name: string): void {
  ME = pid;
  MY_NAME = name;
}
