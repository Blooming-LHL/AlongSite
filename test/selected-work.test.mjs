import test, { after, before } from 'node:test';
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

const options = { skip: !hugoAvailable && 'Hugo is not installed; skipping integration render' };
let tempRoot;
let publicDir;
let english;
let chinese;

const page = (frontMatter, body = '') => `---\n${frontMatter}\n---\n\n${body}\n`;
const write = (file, value) => fs.mkdir(path.dirname(file), { recursive: true }).then(() => fs.writeFile(file, value));

before(async () => {
  if (!hugoAvailable) return;
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'along-selected-work-'));
  const content = path.join(tempRoot, 'content');
  publicDir = path.join(tempRoot, 'public');
  await write(path.join(content, '_index.md'), page('title: English profile\nprofile_language: en'));
  await write(path.join(content, 'about.md'), page('title: 中文简介\nurl: "/cn/about"\nlayout: about\nprofile_language: zh'));
  await write(path.join(content, 'projects/_index.md'), page('title: Projects'));
  await write(path.join(content, 'projects/alpha.md'), page(
    'title: "Alpha 项目"\nslug: alpha\ndescription: "原始中文描述"\nfeatured: true\nweight: 10\nstatus: "Active"\nstack: ["Go", "Hugo"]\ngithub: "https://github.com/example/alpha"',
  ));
  await write(path.join(content, 'projects/beta.md'), page(
    'title: "Beta 项目"\nslug: beta\ndescription: "第二个项目描述"\nfeatured: true\nweight: 20',
  ));
  await write(path.join(content, 'projects/hidden.md'), page(
    'title: "Hidden 项目"\ndescription: "不应出现在个人主页"\nfeatured: false\nweight: 1',
  ));
  await write(path.join(content, 'projects/unmarked.md'), page(
    'title: "Unmarked 项目"\ndescription: "也不应出现在个人主页"\nweight: 2',
  ));
  await execFileAsync(hugo, [
    '--source', root, '--contentDir', content, '--destination', publicDir, '--quiet',
  ], { cwd: root });
  english = await fs.readFile(path.join(publicDir, 'index.html'), 'utf8');
  chinese = await fs.readFile(path.join(publicDir, 'cn/about/index.html'), 'utf8');
});

after(async () => { if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true }); });

test('English and Chinese profiles restore only featured work in weight order', options, () => {
  for (const html of [english, chinese]) {
    const section = html.match(/<section[^>]*id="projects"[\s\S]*?<\/section>/)?.[0];
    assert.ok(section, 'profile has a projects section');
    assert.match(section, /Alpha 项目/);
    assert.match(section, /Beta 项目/);
    assert.doesNotMatch(section, /Hidden 项目|Unmarked 项目/);
    assert.ok(section.indexOf('Alpha 项目') < section.indexOf('Beta 项目'), 'projects are sorted by ascending weight');
    assert.match(section, /href="\/projects\/alpha\/"/);
    assert.match(section, /href="\/projects\/beta\/"/);
    assert.match(section, /原始中文描述/);
    assert.doesNotMatch(section, /DBStack|资源规划智能体|portfolio/);
    assert.doesNotMatch(section, /Coming soon|待补充|placeholder/i);
  }
});

test('selected work does not populate skills, CV, or contact UI', options, () => {
  for (const html of [english, chinese]) {
    for (const id of ['skills', 'cv']) {
      const section = html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?<\\/section>`))?.[0];
      assert.ok(section, `${id} section remains present`);
      assert.doesNotMatch(section, /<a |<p>|<ul|<button|<img/);
    }
    assert.doesNotMatch(html, /mailto:|href="\/cv\//);
  }
});

test('zero featured projects render no placeholder cards', options, async () => {
  const content = path.join(tempRoot, 'empty-content');
  const destination = path.join(tempRoot, 'empty-public');
  await write(path.join(content, '_index.md'), page('title: English profile\nprofile_language: en'));
  await write(path.join(content, 'about.md'), page('title: 中文简介\nurl: "/cn/about"\nlayout: about\nprofile_language: zh'));
  await write(path.join(content, 'projects/_index.md'), page('title: Projects'));
  await write(path.join(content, 'projects/not-featured.md'), page('title: Not featured\nfeatured: false'));
  await execFileAsync(hugo, [
    '--source', root, '--contentDir', content, '--destination', destination, '--quiet',
  ], { cwd: root });
  for (const file of ['index.html', 'cn/about/index.html']) {
    const html = await fs.readFile(path.join(destination, file), 'utf8');
    assert.doesNotMatch(html, /class="project-card"/);
    assert.doesNotMatch(html, /Not featured|Coming soon|待补充|placeholder/i);
  }
});
