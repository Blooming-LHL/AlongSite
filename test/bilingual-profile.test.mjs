import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hugo = process.env.HUGO_BIN || 'hugo';
let available = true;
try { execFileSync(hugo, ['version'], { stdio: 'ignore' }); } catch { available = false; }
const options = { skip: !available && 'Hugo is not installed' };
let output;
let zh;
let en;
let cvZh;
let cvEn;

before(async () => {
  if (!available) return;
  output = await fs.mkdtemp(path.join(os.tmpdir(), 'along-bilingual-profile-'));
  await promisify(execFile)(hugo, ['--source', root, '--destination', output, '--quiet']);
  const read = file => fs.readFile(path.join(output, file), 'utf8');
  [zh, en, cvZh, cvEn] = await Promise.all(['about/index.html', 'en/about/index.html', 'cv/zh/index.html', 'cv/en/index.html'].map(read));
});
after(async () => { if (output) await fs.rm(output, { recursive: true, force: true }); });

test('both native-language routes have reciprocal switches and localized metadata', options, () => {
  assert.match(zh, /<html lang="zh-CN">/);
  assert.match(en, /<html lang="en">/);
  assert.match(en, /<meta property="og:locale" content="en_US">/);
  assert.match(en, /<link rel="canonical" href="https:\/\/alongsite\.netlify\.app\/en\/about\/">/);
  for (const html of [zh, en]) {
    assert.match(html, /hreflang="zh-CN" href="https:\/\/alongsite\.netlify\.app\/about\/"/);
    assert.match(html, /hreflang="en" href="https:\/\/alongsite\.netlify\.app\/en\/about\/"/);
    assert.match(html, /href="\/about\/" lang="zh-CN" hreflang="zh-CN"/);
    assert.match(html, /href="\/en\/about\/" lang="en" hreflang="en"/);
    for (const id of ['overview', 'projects', 'experience', 'education', 'skills', 'cv', 'contact']) {
      assert.match(html, new RegExp(`href="#${id}"`));
      assert.match(html, new RegExp(`id="${id}"`));
    }
  }
  assert.match(zh, /hreflang="zh-CN" aria-current="page">中文/);
  assert.match(en, /hreflang="en" aria-current="page">EN/);
  const englishText = en.replace(/<[^>]+>/g, '').replaceAll('中文', '');
  assert.doesNotMatch(englishText, /[\u3400-\u9fff]/, 'English copy must not fall back to Chinese UI or biography');
});

test('public profile and printable CV retain only the requested experience', options, () => {
  for (const html of [zh, en, cvZh, cvEn]) {
    assert.match(html, /OPPO/);
    assert.match(html, /阿里云|Alibaba Cloud/);
    assert.doesNotMatch(html, /心潮|Shopify|Klarna|13432003979|lhl1458169154|24岁|待补充|待上传/);
  }
  assert.match(zh, /2026\.07 — 至今/);
  assert.match(en, /Jul 2026 — Present/);
  assert.match(en, /May — Sep 2025/);
  assert.match(zh, /中山大学/);
  assert.match(en, /Sun Yat-sen University/);
  assert.match(en, /South China University of Technology/);
  assert.match(zh, /从数小时缩短至数分钟/);
  assert.match(en, /from hours to minutes/);
  assert.doesNotMatch(en, /granted patents|production users|millions of users/i);
});

test('both CV downloads resolve to actual updated PDFs with localized HTML equivalents', options, async () => {
  for (const [lang, html] of [['zh', zh], ['en', en]]) {
    assert.match(html, new RegExp(`href="/cv/liang-henglong-${lang}\\.pdf" download`));
    const file = await fs.readFile(path.join(output, 'cv', `liang-henglong-${lang}.pdf`));
    assert.equal(file.subarray(0, 5).toString(), '%PDF-');
    assert.ok(file.length > 10000);
  }
  assert.match(cvEn, /<html lang="en">/);
  assert.match(cvZh, /<html lang="zh-CN">/);
  assert.doesNotMatch(cvEn + cvZh, /data-pagefind-body/);
});
