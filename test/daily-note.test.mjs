import test from 'node:test';
import assert from 'node:assert/strict';
import { localDayKey, normalizeQuote, startDailyNote } from '../static/js/daily-note.js';

test('daily note cache key follows the visitor local calendar day', () => {
  assert.equal(localDayKey(new Date(2026, 9, 1)), '2026-10-01');
  assert.equal(localDayKey(new Date(2026, 0, 2)), '2026-01-02');
});

test('daily note accepts only bounded plain-text content and safe UUIDs', () => {
  assert.deepEqual(normalizeQuote({ hitokoto: '  今天也值得期待。  ', from: '一本书', uuid: '75a45fd4-4f2f-45eb-80cb-6f0a7bcdfaf2' }), {
    quote: '今天也值得期待。', source: '一本书', uuid: '75a45fd4-4f2f-45eb-80cb-6f0a7bcdfaf2',
  });
  assert.equal(normalizeQuote({ hitokoto: ' ' }), null);
  assert.equal(normalizeQuote({ hitokoto: 'a'.repeat(101) }), null);
  assert.equal(normalizeQuote(null), null);
  assert.equal(normalizeQuote({ hitokoto: '安全', uuid: 'javascript:alert(1)' }).uuid, '');
});

test('daily note fetches once per local day, reuses cache, and keeps fallback on failure', async () => {
  const original = { document: globalThis.document, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  const nodes = new Map(['#daily-note-quote', '#daily-note-source', '#daily-note-date'].map((selector) => [selector, { textContent: '', href: '', dataset: { fallbackHref: '/writing/' }, removeAttribute() {} }]));
  const values = new Map();
  let requests = 0;
  globalThis.document = { querySelector: (selector) => nodes.get(selector) };
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  globalThis.fetch = async () => {
    requests += 1;
    return { ok: true, json: async () => ({ hitokoto: '每日新句', from: '测试来源', uuid: '75a45fd4-4f2f-45eb-80cb-6f0a7bcdfaf2' }) };
  };
  try {
    await startDailyNote();
    assert.equal(nodes.get('#daily-note-quote').textContent, '每日新句');
    assert.equal(nodes.get('#daily-note-source').href, 'https://hitokoto.cn/?uuid=75a45fd4-4f2f-45eb-80cb-6f0a7bcdfaf2');
    assert.equal(nodes.get('#daily-note-date').dateTime, localDayKey());
    await startDailyNote();
    assert.equal(requests, 1);

    values.clear();
    globalThis.fetch = async () => { throw new Error('offline'); };
    await startDailyNote();
    assert.equal(nodes.get('#daily-note-quote').textContent, '把好奇留给今天，让灵感自然发生。');
    assert.equal(nodes.get('#daily-note-source').href, '/writing/');
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
