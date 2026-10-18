import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMasonrySpan, startHomeMasonry } from '../static/js/home.js';

test('calculateMasonrySpan accounts for the row gap', () => {
  assert.equal(calculateMasonrySpan(8), 1);
  assert.equal(calculateMasonrySpan(32), 2);
  assert.equal(calculateMasonrySpan(65), 3);
});

test('masonry falls back to normal single-column layout', () => {
  const card = fakeCard(120);
  const grid = fakeGrid([card], '1fr');
  const root = fakeRoot([grid], { getComputedStyle: (element) => ({ gridTemplateColumns: element.columns }) });
  const stop = startHomeMasonry(root);
  assert.equal(grid.classList.has('is-masonry'), false);
  assert.equal(card.style.gridRowEnd, '');
  stop();
});

test('masonry responds to resize and image events without reordering cards', () => {
  const first = fakeCard(32);
  const second = fakeCard(80);
  const grid = fakeGrid([first, second], '1fr 1fr');
  const rafs = [];
  const win = {
    getComputedStyle: (element) => ({ gridTemplateColumns: element.columns, gridAutoRows: '8px', rowGap: '24px' }),
    requestAnimationFrame: (callback) => { rafs.push(callback); return rafs.length; },
    cancelAnimationFrame() {},
    addEventListener() {}, removeEventListener() {},
  };
  const root = fakeRoot([grid], win);
  const stop = startHomeMasonry(root);
  rafs.shift()();
  assert.equal(grid.classList.has('is-masonry'), true);
  assert.equal(first.style.gridRowEnd, 'span 2');
  assert.equal(second.style.gridRowEnd, 'span 4');
  assert.deepEqual(grid.children, [first, second]);
  first.height = 56;
  first.images[0].emit('load');
  rafs.shift()();
  assert.equal(first.style.gridRowEnd, 'span 3');
  stop();
});

test('ResizeObserver measures changed card heights at the same width and cleans up', () => {
  const card = fakeCard(32);
  const grid = fakeGrid([card], '1fr 1fr');
  grid.getBoundingClientRect = () => ({ width: 640 });
  const rafs = [];
  let observerCallback;
  const resizeListeners = [];
  const win = {
    getComputedStyle: (element) => ({ gridTemplateColumns: element.columns, gridAutoRows: '8px', rowGap: '24px' }),
    requestAnimationFrame(callback) { rafs.push(callback); return rafs.length; },
    cancelAnimationFrame() {},
    ResizeObserver: class { constructor(callback) { observerCallback = callback; } observe() {} disconnect() { this.disconnected = true; } },
    addEventListener(type, callback) { resizeListeners.push(callback); }, removeEventListener() {},
  };
  const stop = startHomeMasonry(fakeRoot([grid], win));
  rafs.shift()();
  assert.equal(card.style.gridRowEnd, 'span 2');
  card.height = 80;
  observerCallback([]);
  rafs.shift()();
  assert.equal(card.style.gridRowEnd, 'span 4');
  grid.columns = '1fr';
  resizeListeners[0]();
  rafs.shift()();
  assert.equal(grid.classList.has('is-masonry'), false);
  grid.columns = '1fr 1fr';
  resizeListeners[0]();
  rafs.shift()();
  assert.equal(grid.classList.has('is-masonry'), true);
  stop();
  assert.equal(resizeListeners.length, 1);
});

function fakeCard(height) {
  const image = { listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, removeEventListener() {}, emit(type) { this.listeners[type]?.(); } };
  return {
    height, images: [image], style: { gridRowEnd: '' }, classList: classSet(['card', 'article-card']),
    getBoundingClientRect() { return { height: this.height }; },
    querySelectorAll() { return this.images; },
  };
}
function fakeGrid(children, columns) { return { children, columns, classList: classSet(), }; }
function fakeRoot(grids, win = {}) { return { defaultView: win, querySelectorAll() { return grids; } }; }
function classSet(initial = []) { const values = new Set(initial); return { add: (v) => values.add(v), remove: (v) => values.delete(v), contains: (v) => values.has(v), has: (v) => values.has(v) }; }
