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
const fixture = path.join(root, 'test/fixtures/article-typography.md');
const hugo = process.env.HUGO_BIN || 'hugo';
let hugoAvailable = true;
try {
  execFileSync(hugo, ['version'], { stdio: 'ignore' });
} catch {
  hugoAvailable = false;
}

let tempRoot;
let publicDir;
let rendered;

const readRendered = async (file) => fs.readFile(path.join(publicDir, file), 'utf8');

before(async () => {
  if (!hugoAvailable) return;
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'along-article-rendering-'));
  const contentDir = path.join(tempRoot, 'content');
  publicDir = path.join(tempRoot, 'public');
  await fs.mkdir(path.join(contentDir, 'writing'), { recursive: true });
  await fs.copyFile(fixture, path.join(contentDir, 'writing/article-typography.md'));
  await fs.writeFile(path.join(contentDir, 'numbered.md'), [
    '---', 'title: Numbered', '---', '',
    '```js {linenos=table}', 'const value = "<&>";', 'console.log(value);', '```', '',
    '> [!NOTE] A & B', '> Custom title.', '',
  ].join('\n'));
  await fs.writeFile(
    path.join(contentDir, 'no-headings.md'),
    '---\ntitle: "No headings"\ndate: 2026-10-05\n---\n\nJust a paragraph.\n',
  );
  await execFileAsync(hugo, [
    '--source', root,
    '--contentDir', contentDir,
    '--destination', publicDir,
    '--quiet',
  ], { cwd: root });
  rendered = await readRendered('writing/把复杂的知识写成读得下去的文章/index.html');
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

const options = { skip: !hugoAvailable && 'Hugo is not installed; skipping integration render' };

test('renders escaped fenced JavaScript, all five callouts, and raw copy sources', options, () => {
  assert.equal((rendered.match(/class="article-callout"/g) || []).length, 5);
  assert.match(rendered, /class="code-block" data-code="async function publishArticle/);
  assert.match(rendered, /data-code="[^\"]*&lt;script&gt;alert\(&#39;escaped&#39;\)&lt;\/script&gt;/);
  assert.doesNotMatch(rendered, /data-code="[^\"]*<script>/);
  assert.equal((rendered.match(/class="code-block"/g) || []).length, 3);
});

test('renders scrollable tables with source-column alignments', options, () => {
  assert.equal((rendered.match(/class="table-scroll"/g) || []).length, 1);
  assert.match(rendered, /class="table-scroll"[^>]*tabindex="0"[^>]*role="region"/);
  assert.match(rendered, /<th style="text-align: center">输出<\/th>/);
  assert.match(rendered, /<td style="text-align: right">写作后<\/td>/);
});

test('gives mobile and desktop TOCs unique IDs and matching heading links', options, () => {
  assert.match(rendered, /id="TableOfContents-mobile"/);
  assert.match(rendered, /id="TableOfContents-desktop"/);
  assert.notEqual(
    rendered.match(/id="TableOfContents-(?:mobile|desktop)"/g)?.[0],
    rendered.match(/id="TableOfContents-(?:mobile|desktop)"/g)?.[1],
  );
  assert.match(rendered, /href="#从笔记到文章"/);
  assert.match(rendered, /<h2 id="从笔记到文章">/);
});

test('omits the TOC on a page with no headings', options, async () => {
  const noHeadings = await readRendered('no-headings/index.html');
  assert.doesNotMatch(noHeadings, /TableOfContents|article-toc/);
});

test('loads article CSS and JavaScript only for pages, not the homepage', options, async () => {
  assert.match(rendered, /href="\/css\/article\.css"/);
  assert.match(rendered, /src="\/js\/article\.js"/);
  const home = await readRendered('index.html');
  assert.doesNotMatch(home, /article\.css|article\.js/);
});

test('numbered code retains raw copy source and callout titles are escaped once', options, async () => {
  const numbered = await readRendered('numbered/index.html');
  assert.match(numbered, /class="lntable"/);
  assert.match(numbered, /data-code="const value = &#34;&lt;&amp;&gt;&#34;;\nconsole.log\(value\);"/);
  assert.match(numbered, /class="article-callout-title">A &amp; B<\/p>/);
  assert.doesNotMatch(numbered, /A &amp;amp; B/);
});

test('desktop TOC and search cards have a gap without changing narrow-screen spacing', async () => {
  const css = await fs.readFile(path.join(root, 'static/css/article.css'), 'utf8');
  assert.match(css, /@media \(min-width: 1081px\)\s*\{[^}]*\.sidebar-section-toc \+ \.search-shortcut\s*\{\s*margin-top: 24px;/);
});
