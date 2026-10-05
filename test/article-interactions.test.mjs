import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../static/js/article.js', import.meta.url), 'utf8');

function setup({ clipboardFails = false } = {}) {
  const headings = [{ id: '中文标题', top: 24 }, { id: '代码', top: 500 }];
  const links = headings.map((heading) => ({
    hash: `#${encodeURIComponent(heading.id)}`,
    attrs: {}, active: false,
    classList: { toggle(_, active) { this.owner.active = active; } },
    setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this.attrs[key]; },
  }));
  links.forEach((link) => { link.classList.owner = link; });
  headings.forEach((heading) => { heading.getBoundingClientRect = () => ({ top: heading.top }); });
  const listeners = {}, resets = [], copied = [];
  const status = { textContent: '' };
  const button = {
    hidden: true, attrs: {}, textContent: '复制',
    parentElement: { querySelector: () => status },
    addEventListener(_, fn) { this.click = fn; },
    setAttribute(key, value) { this.attrs[key] = value; },
    focus() { this.focused = true; },
  };
  const raw = 'const text = "<script>&中文</script>";\nconsole.log(text);\n';
  const block = { dataset: { code: raw }, querySelector: (selector) => selector === '.code-copy' ? button : { textContent: '1\n2\n' } };
  let area;
  const document = {
    querySelectorAll: (selector) => selector === '.code-block' ? [block] : links,
    getElementById: (id) => headings.find((heading) => heading.id === id),
    createElement: () => (area = { style: {}, setAttribute() {}, select() {}, remove() { this.removed = true; } }),
    body: { appendChild() {} },
    execCommand: () => { copied.push(area.value); return true; },
  };
  const window = {
    isSecureContext: true, location: { hash: '' },
    setTimeout: (fn) => resets.push(fn),
    requestAnimationFrame: (fn) => { fn(); },
    addEventListener: (event, fn) => { listeners[event] = fn; },
  };
  const navigator = { clipboard: { async writeText(value) { if (clipboardFails) throw new Error('denied'); copied.push(value); } } };
  vm.runInNewContext(source, { document, window, navigator });
  return { links, headings, button, status, resets, listeners, copied, raw, get area() { return area; } };
}

test('Chinese TOC follows passed headings and hash changes, including gaps between headings', () => {
  const ui = setup();
  assert.equal(ui.links[0].attrs['aria-current'], 'location');
  ui.headings[0].top = -1000;
  ui.headings[1].top = 24;
  ui.listeners.scroll();
  assert.equal(ui.links[0].active, false);
  assert.equal(ui.links[1].active, true);
  ui.headings[1].top = -600;
  ui.listeners.hashchange();
  assert.equal(ui.links[1].active, true);
});

for (const clipboardFails of [false, true]) {
  test(`copy preserves raw source, not line numbers (${clipboardFails ? 'fallback' : 'clipboard'})`, async () => {
    const ui = setup({ clipboardFails });
    assert.equal(ui.button.hidden, false);
    await ui.button.click();
    assert.deepEqual(ui.copied, [ui.raw]);
    assert.equal(ui.status.textContent, '已复制');
    assert.equal(ui.button.focused, true);
    if (clipboardFails) assert.equal(ui.area.removed, true);
    ui.resets[0]();
    assert.equal(ui.status.textContent, '');
    assert.equal(ui.button.attrs['aria-label'], '复制代码');
  });
}
