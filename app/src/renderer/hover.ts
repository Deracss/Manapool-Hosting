// Which card the mouse is over, for the Alt inspect popup.
import type { CardShow } from './components/Card';

let hovered: CardShow | null = null;
const listeners = new Set<() => void>();

export function setHovered(c: CardShow | null): void {
  if (hovered === c) return;
  hovered = c;
  for (const l of listeners) l();
}

export function getHovered(): CardShow | null {
  return hovered;
}

export function subscribeHovered(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
