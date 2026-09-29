import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFile(path.join(root, file), 'utf8');

test('production build runs Hugo before the pinned CJK-capable Pagefind CLI', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.devDependencies.pagefind, '1.5.2');
  assert.match(pkg.scripts['build:hugo'], /--cleanDestinationDir/);
  assert.equal(pkg.scripts['build:search'], 'pagefind --site public --force-language zh');
  assert.match(pkg.scripts['preview:search'], /pagefind .* --serve/);
  assert.equal(pkg.scripts.build, 'npm run build:hugo && npm run build:search');
});

test('search UI is isolated to the search page and content is the Pagefind body', async () => {
  const search = await read('themes/along/layouts/search/list.html');
  const page = await read('themes/along/layouts/page.html');
  const home = await read('themes/along/layouts/home.html');
  assert.match(search, /pagefind\/pagefind-ui\.css/);
  assert.match(search, /pagefind\/pagefind-ui\.js/);
  assert.match(search, /data-pagefind-ignore/);
  assert.match(search, /typeof PagefindUI/);
  assert.match(page, /data-pagefind-body/);
  assert.doesNotMatch(home, /pagefind-ui|pagefind-ui\.js/);
});

test('Netlify uses reproducible Hugo and Node versions', async () => {
  const netlify = await read('netlify.toml');
  assert.match(netlify, /command = "npm ci && npm run build"/);
  assert.match(netlify, /publish = "public"/);
  assert.match(netlify, /HUGO_VERSION = "0\.161\.1"/);
  assert.match(netlify, /NODE_VERSION = "22\.17\.0"/);
});
