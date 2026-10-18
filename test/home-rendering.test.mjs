import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hugo = process.env.HUGO_BIN || 'hugo';
let hugoAvailable = true;
try { execFileSync(hugo, ['version'], { stdio: 'ignore' }); } catch { hugoAvailable = false; }

let tempRoot;
let publicDir;
let home;
let article;
let section;
const options = { skip: !hugoAvailable && 'Hugo is not installed; skipping integration render' };

const write = (dir, name, value) => fs.writeFile(path.join(dir, name), value);
const page = (frontMatter, body = '') => `---\n${frontMatter}\n---\n\n${body}\n`;

before(async () => {
  if (!hugoAvailable) return;
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'along-home-rendering-'));
  const content = path.join(tempRoot, 'content');
  publicDir = path.join(tempRoot, 'public');
  await fs.mkdir(path.join(content, 'writing', 'engineering'), { recursive: true });
  await write(content, '_index.md', page('title: Home'));
  await write(content, 'now.md', page('title: Now\ndescription: Building a calmer internet.'));
  await write(path.join(content, 'writing'), '_index.md', page('title: Writing'));
  await write(content, 'writing/engineering/_index.md', page('title: Engineering'));
  await write(content, 'writing/engineering/newest.md', page(
    'title: Newest & safest\nslug: newest\ndate: 2026-10-17\ncategories: [Engineering]\ntags: [safe]\ncover: "https://cdn.example.test/explicit.png?x=1&y=2"',
    '## Heading\n\n![banner body image](/images/body.png)\n\nNewest copy.',
  ));
  await write(content, 'writing/engineering/relative.md', page(
    'title: Relative cover\nslug: relative\ndate: 2026-10-16\ncategories: [Engineering]\ncover: "cover.png"',
    'Relative copy.',
  ));
  await write(content, 'writing/engineering/body-banner.md', page(
    'title: Body banner\nslug: body-banner\ndate: 2026-10-15\ncategories: [Essays]',
    '![banner banner-fade](/images/cover%20test.png)\n\nBody cover copy.',
  ));
  await write(content, 'writing/engineering/plain.md', page(
    'title: Plain card\nslug: plain\ndate: 2026-10-14\ncategories: [Essays]',
    '![diagram](/images/diagram.svg)\n\nThis image is not a cover.',
  ));
  await write(content, 'writing/engineering/unsafe.md', page(
    'title: Unsafe image\nslug: unsafe\ndate: 2026-10-13\ncover: "javascript:alert(1)"',
    'No executable image.',
  ));
  await execFileAsync(hugo, [
    '--source', root, '--contentDir', content, '--destination', publicDir, '--quiet',
  ], { cwd: root });
  const read = (file) => fs.readFile(path.join(publicDir, file), 'utf8');
  home = await read('index.html');
  article = await read('writing/engineering/newest/index.html');
  section = await read('writing/engineering/index.html');
});

after(async () => { if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true }); });

test('homepage has one left-rail information set and no right rail', options, () => {
  assert.match(home, /class="site-layout site-layout-home"/);
  assert.doesNotMatch(home, /site-sidebar-right|right-sidebar-inner|article-toc/);
  assert.equal((home.match(/id="recent-heading"/g) || []).length, 1);
  assert.equal((home.match(/id="category-heading"/g) || []).length, 1);
  assert.equal((home.match(/id="tag-heading"/g) || []).length, 1);
  assert.equal((home.match(/class="sidebar-now"/g) || []).length, 1);
  assert.equal((home.match(/class="sidebar-links home-sidebar-links"/g) || []).length, 1);
  assert.equal((home.match(/href="\/search\/"/g) || []).length, 1);
});

test('homepage keeps helper regions after main in rendered DOM and grid placement', options, async () => {
  const regions = [
    '<aside class="site-sidebar site-sidebar-left"',
    '<main id="main-content"',
    '<aside class="home-sidebar-information"',
    '<div class="sidebar-links home-sidebar-links"',
  ].map((marker) => home.indexOf(marker));
  assert.ok(regions.every((index) => index >= 0));
  assert.deepEqual(regions, [...regions].sort((a, b) => a - b));

  const css = await fs.readFile(path.join(root, 'static/css/home.css'), 'utf8');
  assert.match(css, /\.site-layout-home \.site-sidebar-left\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;/s);
  assert.match(css, /\.site-layout-home \.site-main\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1\s*\/\s*4;/s);
  assert.match(css, /\.site-layout-home \.home-sidebar-information\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*2;/s);
  assert.match(css, /\.site-layout-home \.home-sidebar-links\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*3;/s);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.site-layout-home \.site-main\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*2;/s);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.site-layout-home \.home-sidebar-information\s*\{[^}]*grid-row:\s*3;/s);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.site-layout-home \.home-sidebar-links\s*\{[^}]*grid-row:\s*4;/s);
});

test('home and article assets are layout-specific', options, () => {
  assert.match(home, /href="\/css\/home\.css"/);
  assert.match(home, /src="\/js\/home\.js"/);
  assert.doesNotMatch(home, /href="\/css\/article\.css"|src="\/js\/article\.js"/);
  assert.match(article, /href="\/css\/article\.css"/);
  assert.match(article, /src="\/js\/article\.js"/);
  assert.doesNotMatch(article, /href="\/css\/home\.css"|src="\/js\/home\.js"/);
  assert.doesNotMatch(section, /href="\/css\/home\.css"|src="\/js\/home\.js"/);
});

test('home article cards are chronological and preserve card cover rules', options, () => {
  const titles = [...home.matchAll(/class="card-content"[\s\S]*?<h3><a[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
  assert.deepEqual(titles.slice(0, 4), ['Newest &amp; safest', 'Relative cover', 'Body banner', 'Plain card']);
  const cards = [...home.matchAll(/<article class="card article-card(?: card-has-cover)?">[\s\S]*?<\/article>/g)].map((m) => m[0]);
  const newest = cards[0];
  assert.ok(newest);
  assert.match(newest, /src="https:\/\/cdn\.example\.test\/explicit\.png\?x=1&amp;y=2"/);
  assert.doesNotMatch(newest, /body\.png/);
  assert.match(newest, /width="900" height="600" loading="lazy" decoding="async"/);
  const relative = cards.find((card) => card.includes('Relative cover'));
  assert.match(relative, /src="\/writing\/engineering\/relative\/cover\.png"/);
  const body = cards.find((card) => card.includes('Body banner'));
  assert.match(body, /cover%20test\.png/);
  const plain = cards.find((card) => card.includes('Plain card'));
  assert.ok(plain);
  assert.doesNotMatch(plain, /card-cover/);
  assert.doesNotMatch(home, /javascript:/i);
});

test('article keeps desktop TOC and right sidebar', options, () => {
  assert.match(article, /class="site-sidebar site-sidebar-right"/);
  assert.match(article, /id="TableOfContents-desktop"/);
  assert.match(article, /id="TableOfContents-mobile"/);
});

test('homepage CSS keeps helper blocks below main content on mobile without sticky rail', options, async () => {
  const css = await fs.readFile(path.join(root, 'static/css/home.css'), 'utf8');
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /\.site-layout-home \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.site-layout-home \.home-sidebar-information \{[\s\S]*grid-row: 3/);
  assert.doesNotMatch(css, /\.site-layout-home[^{]*\{[^}]*position:\s*sticky/);
});

test('homepage quote uses the widened hero instead of the old 590px text column', async () => {
  const css = await fs.readFile(path.join(root, 'static/css/home.css'), 'utf8');
  assert.match(css, /\.site-layout-home \.hero-quote\s*\{[^}]*max-width:\s*none;[^}]*width:\s*100%;[^}]*text-wrap:\s*wrap;/s);
});
