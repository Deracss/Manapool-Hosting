// Talking to the ManaPool online server (hosted on Render). The free plan sleeps when nobody plays,
// so before connecting we "wake" it by calling its health page until it answers.
import { EMOTES, PROTOCOL } from '../../../server/src/protocol.ts';
import type { ClientMsg, Loadout, ServerMsg } from '../../../server/src/protocol.ts';

export { EMOTES, PROTOCOL };
export type { Loadout, ServerMsg };

/** The game's built-in server. Players can point the game at another one under "Server" on the Play online screen. */
export const DEFAULT_SERVER = 'https://manapool-server.onrender.com';

const SERVER_KEY = 'manapool.server';
const NAME_KEY = 'manapool.onlineName';

export function loadServer(): string {
  try {
    return localStorage.getItem(SERVER_KEY) || DEFAULT_SERVER;
  } catch {
    return DEFAULT_SERVER;
  }
}
export function saveServer(url: string): void {
  try {
    if (url.trim() && url.trim() !== DEFAULT_SERVER) localStorage.setItem(SERVER_KEY, url.trim());
    else localStorage.removeItem(SERVER_KEY);
  } catch {
    /* ignore */
  }
}
export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}
export function saveName(n: string): void {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* ignore */
  }
}

const httpBase = (url: string) => url.trim().replace(/\/+$/, '').replace(/^ws/, 'http');
const wsBase = (url: string) => httpBase(url).replace(/^http/, 'ws');

/** Calls the server's health page until it answers (a sleeping free server takes up to about a minute). */
export async function wakeServer(url: string, onWait: (seconds: number) => void, cancelled: () => boolean): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (cancelled()) throw new Error('cancelled');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const r = await fetch(`${httpBase(url)}/health`, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (r.ok) {
        const body = (await r.json()) as { protocol?: number };
        if (body.protocol !== undefined && body.protocol !== PROTOCOL) throw new Error('The server runs a different version of ManaPool. Please update the game.');
        return;
      }
    } catch (e) {
      clearTimeout(t);
      if (e instanceof Error && e.message.includes('different version')) throw e;
    }
    const waited = Math.round((Date.now() - start) / 1000);
    if (waited > 150) throw new Error("The server didn't wake up. Check your internet connection and the server address, then try again.");
    onWait(waited);
    await new Promise((r) => setTimeout(r, 2500));
  }
}

/** One WebSocket connection to the server. */
export class Connection {
  private ws: WebSocket;
  private handlers = new Set<(m: ServerMsg) => void>();
  private closeHandlers = new Set<() => void>();
  closedByUs = false;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      for (const h of this.handlers) h(m);
    };
    ws.onclose = () => {
      for (const h of this.closeHandlers) h();
    };
  }

  static open(url: string): Promise<Connection> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsBase(url));
      const t = setTimeout(() => {
        ws.close();
        reject(new Error('Could not connect to the server.'));
      }, 15_000);
      ws.onopen = () => {
        clearTimeout(t);
        resolve(new Connection(ws));
      };
      ws.onerror = () => {
        clearTimeout(t);
        reject(new Error('Could not connect to the server.'));
      };
    });
  }

  send(m: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
  on(h: (m: ServerMsg) => void): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }
  onClose(h: () => void): () => void {
    this.closeHandlers.add(h);
    return () => this.closeHandlers.delete(h);
  }
  close(): void {
    this.closedByUs = true;
    try {
      this.send({ t: 'leave' });
    } catch {
      /* ignore */
    }
    this.ws.close();
  }
}
