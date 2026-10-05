import test from 'node:test';
import assert from 'node:assert/strict';
import { dateText, isRealDate, validateDocument } from '../scripts/validate-content.mjs';

test('Obsidian timestamps retain their written calendar date when published', () => {
  const created = '2026-10-03T00:42:41+08:00';
  assert.equal(dateText(created), '2026-10-03');
  assert.equal(isRealDate(created), true);
  assert.equal(validateDocument({ title: 'Note', description: 'Description', category: 'topic', created }), null);
  assert.equal(dateText('2026-10-03'), '2026-10-03');
});

test('invalid calendar dates or timestamp times remain invalid', () => {
  for (const created of [
    '2026-02-30T11:42:41+08:00',
    '2026-10-03T25:42:41+08:00',
    '2026-10-03T11:60:41+08:00',
    '2026-10-03T11:42:41',
    'not a date',
  ]) assert.equal(isRealDate(created), false, created);
});
