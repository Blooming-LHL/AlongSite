import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isRealDate, validateManifestPath } from '../scripts/validate-content.mjs';

const exec = promisify(execFile);
const script = path.resolve('scripts/publish-content.mjs');

async function workspace() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'along-phase2-'));
  const vault = path.join(base, 'vault');
  const repo = path.join(base, 'repo');
  await fs.mkdir(path.join(vault, 'Blog'), { recursive: true });
  await fs.mkdir(path.join(repo, 'content', 'writing'), { recursive: true });
  await fs.mkdir(path.join(repo, 'content', 'projects'), { recursive: true });
  await fs.mkdir(path.join(repo, 'static', 'images', 'published'), { recursive: true });
  await fs.writeFile(path.join(repo, 'content', 'writing', '_index.md'), 'writing-index');
  await fs.writeFile(path.join(repo, 'content', 'projects', 'keep.md'), 'project-sentinel');
  return { base, vault, repo, blog: path.join(vault, 'Blog') };
}

async function note(blog, relative, frontMatter, body = '') {
  const file = path.join(blog, ...relative.split('/'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `---\n${frontMatter}\n---\n${body}`);
  return file;
}

function validFront({ title = 'Note', description = 'Description', created = '2026-09-28', category = 'topic', publicValue = 'true', extra = '' } = {}) {
  return `title: ${title}\ndescription: ${description}\ncreated: ${created}\ncategory: ${category}\npublic: ${publicValue}${extra ? `\n${extra}` : ''}`;
}

async function run(ctx, mode, extraEnv = {}) {
  const env = { ...process.env, OBSIDIAN_VAULT_PATH: ctx.vault, ...extraEnv };
  delete env.CONTENT_SENSITIVE_WORDS_PATH;
  Object.assign(env, extraEnv);
  return exec(process.execPath, [script, mode], { cwd: ctx.repo, env });
}

async function fail(ctx, mode = '--dry-run', extraEnv = {}) {
  try {
    await run(ctx, mode, extraEnv);
    assert.fail('publisher unexpectedly succeeded');
  } catch (error) {
    assert.equal(error.code, 1);
    return error.stdout;
  }
}

test('publishes nested notes, links and attachments while check/dry-run remain read-only', async () => {
  const ctx = await workspace();
  const topic = path.join(ctx.blog, 'deep', 'topic');
  await fs.mkdir(topic, { recursive: true });
  await fs.writeFile(path.join(topic, 'photo #1(2)?.png'), 'image-bytes');
  await note(ctx.blog, 'deep/topic/one.md', validFront({ title: 'One', extra: 'custom:\n  nested: preserved\ntags: [alpha]\nurl: https://podcasts.example.com/episode/1' }), [
    'Before [[Two#A Heading|read two]] and ![[photo%20%231%282%29%3F.png|photo]].',
    '![remote](https://example.com/image.png)',
    '`[[inline-code]]`',
    '```mermaid',
    'graph TD; [[fenced-code]]',
    '```',
  ].join('\n'));
  await note(ctx.blog, 'deep/topic/two.md', validFront({ title: 'Two' }), 'Second.');
  await note(ctx.blog, 'false.md', 'public: false', 'private');
  await note(ctx.blog, 'string.md', 'public: "true"', 'private');
  await note(ctx.blog, 'missing.md', 'title: Missing public', 'private');
  await note(ctx.blog, 'legacy.md', 'publish: true', 'private');

  const before = await fs.readdir(ctx.blog);
  const checked = await run(ctx, '--check');
  assert.match(checked.stdout, /added: 2/);
  assert.match(checked.stdout, /skipped: 4/);
  assert.deepEqual(await fs.readdir(ctx.blog), before);
  assert.equal(await fs.stat(path.join(ctx.repo, '.publish-manifest.json')).then(() => true, () => false), false);

  await run(ctx, '--dry-run');
  assert.equal(await fs.stat(path.join(ctx.blog, 'Public')).then(() => true, () => false), false);
  await run(ctx, '--write');

  const output = await fs.readFile(path.join(ctx.repo, 'content/writing/deep/topic/one.md'), 'utf8');
  assert.match(output, /created: 2026-09-28/);
  assert.match(output, /date: 2026-09-28/);
  assert.match(output, /nested: preserved/);
  assert.match(output, /source_url: https:\/\/podcasts\.example\.com\/episode\/1/);
  assert.doesNotMatch(output, /^url:/m);
  assert.match(output, /\[read two\]\(\{\{< ref "\/writing\/deep\/topic\/two\.md" >\}\}#a-heading\)/);
  assert.match(output, /!\[photo\]\(\/images\/published\/deep\/topic\/one\/photo%20%231%282%29%3F\.png\)/);
  assert.match(output, /`\[\[inline-code\]\]`/);
  assert.match(output, /\[\[fenced-code\]\]/);
  assert.match(output, /https:\/\/example\.com\/image\.png/);
  assert.equal(await fs.readFile(path.join(ctx.repo, 'static/images/published/deep/topic/one/photo #1(2)?.png'), 'utf8'), 'image-bytes');
  assert.equal(await fs.readFile(path.join(ctx.blog, 'Public/images/published/deep/topic/one/photo #1(2)?.png'), 'utf8'), 'image-bytes');

  const manifestText = await fs.readFile(path.join(ctx.repo, '.publish-manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.articles.length, 2);
  assert.equal(manifest.articles[0].url, '/writing/deep/one/');
  assert.equal(manifestText.includes(ctx.base), false);
  assert.equal(manifestText.includes('/Users/'), false);
  assert.equal(await fs.readFile(path.join(ctx.repo, 'content/projects/keep.md'), 'utf8'), 'project-sentinel');

  const second = await run(ctx, '--write');
  assert.match(second.stdout, /unchanged: 2/);
  assert.match(second.stdout, /added: 0/);
  assert.match(second.stdout, /updated: 0/);
});

test('accepts OBSIDIAN_VAULT_PATH as either the vault root or the Blog directory itself', async () => {
  const ctx = await workspace();
  await note(ctx.blog, 'topic/a.md', validFront({ title: 'A' }), 'Body');
  const fromVault = await run(ctx, '--check');
  const fromBlog = await run(ctx, '--check', { OBSIDIAN_VAULT_PATH: ctx.blog });
  assert.match(fromVault.stdout, /added: 1/);
  assert.match(fromBlog.stdout, /added: 1/);
  assert.equal(await fs.stat(path.join(ctx.blog, 'Public')).then(() => true, () => false), false);
});

test('rejects invalid dates, duplicate final URLs and unresolved or ambiguous wiki links', async () => {
  const invalid = await workspace();
  await note(invalid.blog, 'topic/bad.md', validFront({ created: '2026-02-31' }));
  assert.match(await fail(invalid), /real YYYY-MM-DD date/);

  const duplicate = await workspace();
  await note(duplicate.blog, 'topic/a.md', validFront({ title: 'A', extra: 'slug: same' }));
  await note(duplicate.blog, 'topic/b.md', validFront({ title: 'B', extra: 'slug: same' }));
  assert.match(await fail(duplicate), /final URL duplicates/);

  const aliasCollision = await workspace();
  await note(aliasCollision.blog, 'topic/a.md', validFront({ title: 'A', extra: 'aliases: [/writing/topic/b/index.html]' }));
  await note(aliasCollision.blog, 'topic/b.md', validFront({ title: 'B' }));
  assert.match(await fail(aliasCollision), /alias duplicates a route/);

  const routeOverride = await workspace();
  await note(routeOverride.blog, 'topic/a.md', validFront({ title: 'A', extra: 'url: /forced/path/' }));
  assert.match(await fail(routeOverride), /url is reserved by Hugo/);

  const unresolved = await workspace();
  await note(unresolved.blog, 'topic/a.md', validFront({ title: 'A' }), '[[No Such Published Note]]');
  assert.match(await fail(unresolved), /cannot be resolved/);

  const ambiguous = await workspace();
  await note(ambiguous.blog, 'one/a.md', validFront({ title: 'Same', category: 'one' }));
  await note(ambiguous.blog, 'two/b.md', validFront({ title: 'Same', category: 'two' }));
  await note(ambiguous.blog, 'three/c.md', validFront({ title: 'C', category: 'three' }), '[[Same]]');
  assert.match(await fail(ambiguous), /wiki link is ambiguous/);
});

test('rejects missing, absolute, traversal, ambiguous and symlink-escaping attachments', async () => {
  for (const body of ['![[missing.png]]', '![](/etc/passwd)', '![[../outside.png]]', '![](file:///tmp/private.png)']) {
    const ctx = await workspace();
    await note(ctx.blog, 'topic/a.md', validFront({ title: 'A' }), body);
    assert.match(await fail(ctx), /attachment|sensitive/);
  }

  const ambiguous = await workspace();
  await fs.mkdir(path.join(ambiguous.blog, 'assets/a'), { recursive: true });
  await fs.mkdir(path.join(ambiguous.blog, 'assets/b'), { recursive: true });
  await fs.writeFile(path.join(ambiguous.blog, 'assets/a/photo.png'), 'a');
  await fs.writeFile(path.join(ambiguous.blog, 'assets/b/photo.png'), 'b');
  await note(ambiguous.blog, 'topic/a.md', validFront({ title: 'A' }), '![[photo.png]]');
  assert.match(await fail(ambiguous), /ambiguous/);

  const symlink = await workspace();
  const outside = path.join(symlink.base, 'outside.png');
  await fs.writeFile(outside, 'private');
  await fs.mkdir(path.join(symlink.blog, 'topic'), { recursive: true });
  await fs.symlink(outside, path.join(symlink.blog, 'topic/link.png'));
  await note(symlink.blog, 'topic/a.md', validFront({ title: 'A' }), '![[link.png]]');
  assert.match(await fail(symlink), /attachment/);

  const privateNote = await workspace();
  await note(privateNote.blog, 'topic/private.md', 'title: Private\npublic: false', 'secret private body');
  await note(privateNote.blog, 'topic/public.md', validFront({ title: 'Public' }), '![[private.md]]');
  assert.match(await fail(privateNote), /Markdown notes cannot be published as attachments/);
  assert.equal(await fs.stat(path.join(privateNote.repo, 'static/images/published/topic/public/private.md')).then(() => true, () => false), false);
});

test('detects built-in and custom sensitive values without echoing the value', async () => {
  const builtIn = await workspace();
  const secret = 'ghp_abcdefghijklmnopqrstuvwxyz123456';
  await note(builtIn.blog, 'topic/a.md', validFront({ title: 'A' }), `token ${secret}`);
  const output = await fail(builtIn);
  assert.match(output, /sensitive content detected/);
  assert.equal(output.includes(secret), false);

  const custom = await workspace();
  const words = path.join(custom.base, 'words.txt');
  await fs.writeFile(words, '# ignored comment\n\nInternalProjectZephyr\n');
  await note(custom.blog, 'topic/a.md', validFront({ title: 'A' }), 'InternalProjectZephyr details');
  assert.match(await fail(custom, '--check', { CONTENT_SENSITIVE_WORDS_PATH: words }), /custom sensitive word/);

  const malformed = await workspace();
  const leaked = 'Secret12';
  await note(malformed.blog, 'topic/a.md', `title: [password: ${leaked}\npublic: true`);
  const malformedOutput = await fail(malformed);
  assert.match(malformedOutput, /invalid YAML at line/);
  assert.equal(malformedOutput.includes(leaked), false);
});

test('refuses unmanaged Public files and unmanaged Hugo target conflicts', async () => {
  const publicConflict = await workspace();
  await fs.mkdir(path.join(publicConflict.blog, 'Public'), { recursive: true });
  await fs.writeFile(path.join(publicConflict.blog, 'Public/manual.md'), 'manual');
  await note(publicConflict.blog, 'topic/a.md', validFront({ title: 'A' }));
  assert.match(await fail(publicConflict), /not managed by the manifest/);
  assert.equal(await fs.readFile(path.join(publicConflict.blog, 'Public/manual.md'), 'utf8'), 'manual');

  const hugoConflict = await workspace();
  await note(hugoConflict.blog, 'topic/a.md', validFront({ title: 'A' }));
  await fs.mkdir(path.join(hugoConflict.repo, 'content/writing/topic'), { recursive: true });
  await fs.writeFile(path.join(hugoConflict.repo, 'content/writing/topic/a.md'), 'manual');
  assert.match(await fail(hugoConflict, '--write'), /overwrite an unmanaged file/);
  assert.equal(await fs.readFile(path.join(hugoConflict.repo, 'content/writing/topic/a.md'), 'utf8'), 'manual');

  const publicSymlink = await workspace();
  const publicOutside = path.join(publicSymlink.base, 'outside.md');
  await fs.writeFile(publicOutside, 'outside');
  await fs.mkdir(path.join(publicSymlink.blog, 'Public'), { recursive: true });
  await fs.symlink(publicOutside, path.join(publicSymlink.blog, 'Public/link.md'));
  await note(publicSymlink.blog, 'topic/a.md', validFront({ title: 'A' }));
  assert.match(await fail(publicSymlink, '--write'), /must not contain symbolic links/);
  assert.equal(await fs.readFile(publicOutside, 'utf8'), 'outside');

  const outputSymlink = await workspace();
  const outputOutside = path.join(outputSymlink.base, 'outside-dir');
  await fs.mkdir(outputOutside);
  await fs.symlink(outputOutside, path.join(outputSymlink.repo, 'content/writing/topic'));
  await note(outputSymlink.blog, 'topic/a.md', validFront({ title: 'A' }));
  assert.match(await fail(outputSymlink, '--write'), /contains a symbolic link/);
  assert.deepEqual(await fs.readdir(outputOutside), []);
});

test('failed validation preserves the last release and cancellation deletes only managed files', async () => {
  const ctx = await workspace();
  const source = await note(ctx.blog, 'topic/a.md', validFront({ title: 'A' }), 'safe body');
  await fs.writeFile(path.join(ctx.blog, 'topic/photo.png'), 'photo');
  await fs.appendFile(source, '\n![[photo.png]]');
  await fs.writeFile(path.join(ctx.repo, 'content/writing/manual.md'), 'unmanaged');
  await run(ctx, '--write');
  const manifestBefore = await fs.readFile(path.join(ctx.repo, '.publish-manifest.json'), 'utf8');
  const generatedBefore = await fs.readFile(path.join(ctx.repo, 'content/writing/topic/a.md'), 'utf8');

  await fs.appendFile(source, '\npassword = SuperSecret123');
  assert.match(await fail(ctx, '--write'), /sensitive content/);
  assert.equal(await fs.readFile(path.join(ctx.repo, '.publish-manifest.json'), 'utf8'), manifestBefore);
  assert.equal(await fs.readFile(path.join(ctx.repo, 'content/writing/topic/a.md'), 'utf8'), generatedBefore);

  await fs.writeFile(source, `---\ntitle: A\npublic: false\n---\nprivate`);
  await run(ctx, '--write');
  assert.equal(await fs.stat(path.join(ctx.repo, 'content/writing/topic/a.md')).then(() => true, () => false), false);
  assert.equal(await fs.stat(path.join(ctx.repo, 'static/images/published/topic/a/photo.png')).then(() => true, () => false), false);
  assert.equal(await fs.readFile(path.join(ctx.repo, 'content/writing/manual.md'), 'utf8'), 'unmanaged');
  assert.equal(await fs.readFile(path.join(ctx.repo, 'content/writing/_index.md'), 'utf8'), 'writing-index');
  assert.equal(await fs.readFile(path.join(ctx.repo, 'content/projects/keep.md'), 'utf8'), 'project-sentinel');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(ctx.repo, '.publish-manifest.json'), 'utf8')).articles, []);
});

test('refuses to overwrite or delete a managed file that was edited by hand', async () => {
  const ctx = await workspace();
  await note(ctx.blog, 'topic/a.md', validFront({ title: 'A' }), 'source body');
  await run(ctx, '--write');
  const generated = path.join(ctx.repo, 'content/writing/topic/a.md');
  await fs.writeFile(generated, 'manual emergency edit');
  const output = await fail(ctx, '--write');
  assert.match(output, /managed file was modified outside the publisher/);
  assert.equal(await fs.readFile(generated, 'utf8'), 'manual emergency edit');
});

test('transaction fault rolls back, and an incomplete rollback retains an indexed backup', async () => {
  const rollback = await workspace();
  const rollbackSource = await note(rollback.blog, 'topic/a.md', validFront({ title: 'A' }), 'version one');
  await run(rollback, '--write');
  const generated = path.join(rollback.repo, 'content/writing/topic/a.md');
  const publicGenerated = path.join(rollback.blog, 'Public/topic/a.md');
  const manifestPath = path.join(rollback.repo, '.publish-manifest.json');
  const before = await Promise.all([generated, publicGenerated, manifestPath].map(file => fs.readFile(file, 'utf8')));
  await fs.appendFile(rollbackSource, '\nversion two');
  assert.match(await fail(rollback, '--write', { NODE_ENV: 'test', ALONG_PUBLISH_TEST_FAIL_AFTER: '1' }), /transaction rolled back/);
  assert.deepEqual(await Promise.all([generated, publicGenerated, manifestPath].map(file => fs.readFile(file, 'utf8'))), before);
  assert.equal(await fs.stat(path.join(rollback.repo, '.publish.lock')).then(() => true, () => false), false);

  const incomplete = await workspace();
  const incompleteSource = await note(incomplete.blog, 'topic/a.md', validFront({ title: 'A' }), 'version one');
  await run(incomplete, '--write');
  await fs.appendFile(incompleteSource, '\nversion two');
  const output = await fail(incomplete, '--write', {
    NODE_ENV: 'test',
    ALONG_PUBLISH_TEST_FAIL_AFTER: '1',
    ALONG_PUBLISH_TEST_FAIL_ROLLBACK: '1',
  });
  const match = output.match(/backup retained at ([^;\n]+)/);
  assert.ok(match, output);
  const backup = match[1];
  const recovery = JSON.parse(await fs.readFile(path.join(backup, 'recovery-index.json'), 'utf8'));
  assert.ok(recovery.some(entry => entry.target.endsWith('content/writing/topic/a.md')));
  await fs.rm(backup, { recursive: true, force: true });
});

test('rejects malicious old manifest paths before deleting anything', async () => {
  const ctx = await workspace();
  const outside = path.join(ctx.vault, 'Work', 'secret.md');
  await fs.mkdir(path.dirname(outside), { recursive: true });
  await fs.writeFile(outside, 'do-not-delete');
  await fs.writeFile(path.join(ctx.repo, '.publish-manifest.json'), JSON.stringify({
    schemaVersion: 1,
    articles: [{
      source: 'Blog/a.md',
      public: 'Blog/Public/../../Work/secret.md',
      hugo: 'content/writing/a.md',
      url: '/writing/a/',
      hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      attachments: [],
    }],
  }));
  assert.match(await fail(ctx, '--write'), /unsafe manifest path/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'do-not-delete');

  const attachmentAttack = await workspace();
  await fs.writeFile(path.join(attachmentAttack.repo, '.publish-manifest.json'), JSON.stringify({
    schemaVersion: 1,
    articles: [{
      source: 'Blog/a.md',
      public: 'Blog/Public/a.md',
      hugo: 'content/writing/a.md',
      url: '/writing/a/',
      hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      attachments: [{
        source: 'Blog/a.png',
        public: 'Blog/Public/images/published/a.png',
        hugo: 'static/images/published/../../favicon.svg',
        hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }],
    }],
  }));
  assert.match(await fail(attachmentAttack, '--write'), /unsafe manifest path/);

  const reserved = await workspace();
  const reservedIndex = path.join(reserved.repo, 'content/writing/_index.md');
  await fs.writeFile(path.join(reserved.repo, '.publish-manifest.json'), JSON.stringify({
    schemaVersion: 1,
    articles: [{
      source: 'Blog/_index.md',
      public: 'Blog/Public/_index.md',
      hugo: 'content/writing/_index.md',
      url: '/writing/index/',
      hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      attachments: [],
    }],
  }));
  assert.match(await fail(reserved, '--write'), /publishable Markdown file/);
  assert.equal(await fs.readFile(reservedIndex, 'utf8'), 'writing-index');
});

test('validation helpers reject calendar and manifest traversal edge cases', () => {
  assert.equal(isRealDate('2024-02-29'), true);
  assert.equal(isRealDate('2026-02-29'), false);
  assert.throws(() => validateManifestPath('Blog/Public/../../Work/a.md', 'Blog/Public'));
  assert.throws(() => validateManifestPath('Blog/Public\\..\\Work\\a.md', 'Blog/Public'));
  assert.equal(validateManifestPath('Blog/Public/topic/a.md', 'Blog/Public'), 'topic/a.md');
});
