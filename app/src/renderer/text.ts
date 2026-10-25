// The engine writes messages with player names ("Ben draws 1 card."). The human's seat is named "You",
// so this fixes the grammar: "You draws" → "You draw", "You's" → "Your", "attacks You" → "attacks you".
const IRREGULAR: Record<string, string> = { does: 'do', is: 'are', has: 'have', goes: 'go' };

import { MY_NAME } from './me';

export function youify(text: string): string {
  // Online, the engine uses your real name: read it as "You".
  const src = MY_NAME !== 'You' ? text.replace(new RegExp(`\\b${MY_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), 'You') : text;
  let t = src
    .replace(/\bYou's\b/g, 'Your')
    .replace(/\bYou (does|is|has|goes)\b/g, (_m, v: string) => `You ${IRREGULAR[v]}`)
    .replace(/\bYou ([a-z]+)s\b/g, (_m, w: string) => `You ${w}`)
    .replace(/(\S) You\b/g, '$1 you')
    .replace(/(\S) Your\b/g, '$1 your')
    .replace(/\bYour'?s turn\b/, 'Your turn');
  if (/^You\b/.test(t)) t = t.replace(/\btheir\b/g, 'your').replace(/ and wins!/, ' and win!').replace(/ but has /, ' but have ');
  return t;
}
