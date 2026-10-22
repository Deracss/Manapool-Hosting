// Plain-language explanations for keywords and game terms, shown in the Alt inspect popup.
import { keywordGlossary } from './engine';

const ENGINE = keywordGlossary();

const TERMS: Record<string, string> = {
  ...ENGINE,
  // Clearer wording for players than the short rules-document versions.
  TRAMPLE: "When this creature's attack is higher than its blocker's defense, the extra attack also goes through to the defending player.",
  FLASH: "This card can be played at Incantation speed: any time you have priority, even on another player's turn.",
  RECONFIGURE: 'Once per round (from the start of your turn to your next), you may untap this card whenever you have priority.',
  CLASH: 'Combat between two creatures: an attacker and the creature defending against it (a blocker or a FACEOFF target).',
  EVASIVE: "Can't be blocked.",
  'DMG GAIN': 'If this creature survives a CLASH, it gets a +1/+1 counter.',
  CRITICAL: "When this creature makes a player lose life, that player doesn't draw a card for it.",
  'DOUBLE STRIKE': 'When this creature makes a player lose life, they lose 2 life instead of 1.',
  INDESTRUCTIBLE: "This creature can't take damage or be destroyed. Being sacrificed still removes it.",
  SACRIFICE: 'Destroy a creature you control as part of a cost. This works even on INDESTRUCTIBLE creatures.',
  // Game terms that appear on cards.
  ETB: 'Enters the battlefield: happens when this card comes onto the field.',
  'ON PLAY': 'Happens when this card is played and enters the field.',
  ON: 'An "ON …" ability happens whenever the named event occurs, during your turn and/or with your cards.',
  'ON ANY CLASH': 'Can only be played while a clash is happening (a creature is attacking and another is defending against it).',
  'WHILE ON FIELD': 'Works for as long as this card stays on the field.',
  TAP: "Turn this card sideways to use the ability. A tapped creature can't attack, block or boost until you untap at the start of your next turn. Attacking, blocking and boosting also tap a creature. Creatures with summoning sickness can't use TAP abilities unless they have HASTE.",
  UPKEEP: 'The step at the start of your turn, after you untap. Your Mana Orbs refill here.',
  'END PHASE': 'The last step of each turn, after the Main phase.',
  BOOST: 'During combat, tap an untapped creature to give the attacking creature, or the creature defending against it, +1. Creatures with summoning sickness can still boost.',
  SOULS: 'You gain 1 Soul for every contract you make with a player (an accepted OFFER, a COMMAND or a GIFT). Some cards reward you when you reach a number of Souls.',
  CHARGE: 'Put a card from your hand into your mana pool face down as a Mana Orb worth 1 mana. You can charge once per turn (some cards allow more). "On ManaCharge" abilities happen whenever you charge, including charges made by card effects.',
  'ON CHARGE THIS CARD': 'Happens when you charge this card into your mana pool.',
  'MANA ROCK': 'A token worth 1 mana. It stays in your mana pool until you spend it.',
  ILLUSION: 'A creature type conjured by spells.',
  EQUIP: 'Pay the cost in your Main phase to attach this Artifact to a creature you control; the creature gets the listed ability. Pay again to move it.',
  'COMBAT COUNTERS': 'Counters that change a creature\'s attack and defense, written as +X/+X. They stay until the creature leaves the field.',
};

const ALIASES: Record<string, string> = {
  DOUBLESTRIKE: 'DOUBLE STRIKE',
  'DAMAGE GAIN': 'DMG GAIN',
  BOOSTED: 'BOOST',
  BOOSTING: 'BOOST',
  CLASHING: 'CLASH',
  'CORRUPTED MANA ROCK': 'CORRUPTED MANA',
  SOUL: 'SOULS',
  MANACHARGE: 'CHARGE',
};

export const TYPE_HELP: Record<string, string> = {
  Creature: 'Creatures stay on the field. They can attack, block and boost. A new creature has summoning sickness: it can block and boost, but it can\'t attack or use TAP abilities until your next turn.',
  Token: 'A creature created by another card. When it leaves the field it is gone for good.',
  Artifact: 'Artifacts stay on the field and usually have abilities you can use.',
  Anthem: 'Anthems stay on the field and give you an ongoing effect.',
  Spell: 'Play only during your own Main phase, when nothing is waiting on the stack. Then it goes to your discard pile.',
  Incantation: 'Play any time you have priority, even on another player\'s turn or in response to another card. Then it goes to your discard pile.',
  Field: 'Chosen before the game. Its effects last all game.',
  'Mana Token': 'A token in your mana pool worth 1 mana.',
};

const PHRASE = /\b[A-Z]{2,}[A-Z'-]*(?:\s+[A-Z]{2,}[A-Z'-]*)*\b/g;

function lookup(key: string): string | null {
  const k = ALIASES[key] ?? key;
  return TERMS[k] ? k : null;
}

/** The keywords and game terms mentioned in a card's text, in the order they appear. */
export function termsIn(text: string): { term: string; meaning: string }[] {
  const found: string[] = [];
  const add = (k: string | null) => {
    if (k && !found.includes(k)) found.push(k);
  };
  for (const m of text.matchAll(PHRASE)) {
    const words = m[0].split(/\s+/);
    let i = 0;
    while (i < words.length) {
      let matched = false;
      for (let j = words.length; j > i; j--) {
        const k = lookup(words.slice(i, j).join(' '));
        if (k) {
          add(k);
          i = j;
          matched = true;
          break;
        }
      }
      if (!matched) {
        if (i === 0 && words[0] === 'ON' && words.length > 1) add('ON');
        i++;
      }
    }
  }
  if (/\bMana Rocks?\b/.test(text)) add('MANA ROCK');
  if (/\bCorrupted Mana\b/i.test(text)) add('CORRUPTED MANA');
  if (/\bEquip\b/i.test(text)) add('EQUIP');
  if (/\bboost/i.test(text)) add('BOOST');
  if (/\btap\s*[;:\-]/i.test(text) || /^tap\b/im.test(text)) add('TAP');
  if (/\bETB\b/.test(text)) add('ETB');
  if (/\bManaCharge\b|\bcharge\b/i.test(text)) add('CHARGE');
  if (/\bsouls?\b/i.test(text)) add('SOULS');
  if (/\bcounter\b/i.test(text) && /\+\d\/\+?\d counter/.test(text)) add('COMBAT COUNTERS');
  return found.map((term) => ({ term, meaning: TERMS[term] }));
}

/** The explanation of one keyword, if it has one. */
export function meaningOf(term: string): string | null {
  const k = lookup(term);
  return k ? TERMS[k] : null;
}
