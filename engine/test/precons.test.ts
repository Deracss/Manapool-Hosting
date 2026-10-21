import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allDefs, getDef, PRECON_DEFS, PRECON_ESSENTIALS, preconCards, validateDeck } from '../src/index.ts';

test('every precon is a legal 60-card deck with all essentials and its whole tribe', () => {
  assert.equal(PRECON_ESSENTIALS.length, 39);
  for (const p of PRECON_DEFS) {
    const cards = preconCards(p);
    assert.deepEqual(validateDeck(cards), [], p.name);
    for (const id of PRECON_ESSENTIALS) assert.ok(cards.includes(id), `${p.name} is missing essential ${id}`);
    for (const d of allDefs().filter((x) => x.tribe === p.tribe && x.type === 'Creature')) assert.ok(cards.includes(d.id), `${p.name} is missing ${d.name}`);
    for (const id of p.support) assert.ok(['Anthem', 'Artifact', 'Spell', 'Incantation'].includes(getDef(id).type), `${id} is not a support card type`);
    for (const l of p.leftOut) assert.ok(!cards.includes(l.id));
    if (p.field) assert.equal(getDef(p.field).type, 'Field');
  }
});
