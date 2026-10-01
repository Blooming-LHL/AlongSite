#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';
import { transformMarkdown } from './transform-obsidian.mjs';
import { resolveVaultPath } from './resolve-vault-path.mjs';
import {
  createAttachmentResolver,
  dateText,
  isWithin,
  listFiles,
  parseFrontMatter,
  scanSensitive,
  toPosix,
  validateDocument,
  validateManifestPath,
} from './validate-content.mjs';

const MODES = new Set(['--check', '--dry-run', '--write']);
const args = process.argv.slice(2);
if (args.length !== 1 || !MODES.has(args[0])) {
  console.error('Usage: node scripts/publish-content.mjs --check|--dry-run|--write');
  process.exit(2);
}

const mode = args[0];
const root = await fs.realpath(process.cwd());
const report = { added: [], updated: [], unchanged: [], deleted: [], skipped: [], warnings: [], failures: [] };

let releaseLock = async () => {};
try {
  if (mode === '--write') releaseLock = await acquireLock(path.join(root, '.publish.lock'));
  await run();
  printReport();
} catch (error) {
  if (error.message !== 'validation failed') report.failures.push(safeMessage(error));
  printReport();
  process.exitCode = 1;
} finally {
  await releaseLock();
}

async function run() {
  const vault = await resolveVaultPath();
  const blog = await resolveBlogDirectory(vault);

  const roots = {
    blog,
    public: path.join(blog, 'Public'),
    writing: path.join(root, 'content', 'writing'),
    images: path.join(root, 'static', 'images', 'published'),
    manifest: path.join(root, '.publish-manifest.json'),
  };
  const blogReal = blog;
  const wordsFile = process.env.CONTENT_SENSITIVE_WORDS_PATH
    ? path.resolve(process.env.CONTENT_SENSITIVE_WORDS_PATH)
    : path.join(root, '.content-sensitive-words');

  const oldManifest = await readManifest(roots.manifest);
  const oldTargets = materializeManifestTargets(oldManifest, roots);
  await assertPublicIsManaged(roots.public, oldTargets);

  const markdown = (await listFiles(blog, { skipDirectory: (_relative, name) => name === 'Public' }))
    .filter(file => file.relative.toLowerCase().endsWith('.md'));
  const documents = [];
  for (const source of markdown) {
    try {
      const parsed = await parseFrontMatter(source.absolute);
      if (parsed.data.public !== true) {
        report.skipped.push(`${source.relative}: public is not boolean true`);
        continue;
      }
      const validation = validateDocument(parsed.data);
      if (validation) {
        report.failures.push(`${source.relative}: ${validation}`);
        continue;
      }
      const sensitive = await scanSensitive(parsed.text, { wordsFile });
      if (sensitive.length) {
        report.failures.push(`${source.relative}: sensitive content detected (${sensitive.join(', ')})`);
        continue;
      }
      const sourceRel = toPosix(source.relative).normalize('NFC');
      if (path.posix.basename(sourceRel).toLowerCase() === '_index.md') {
        report.failures.push(`${sourceRel}: _index.md is reserved for Hugo section metadata`);
        continue;
      }
      const slug = parsed.data.slug ?? slugify(path.posix.basename(sourceRel, '.md'));
      if (!slug) {
        report.failures.push(`${sourceRel}: cannot derive a slug from the file name`);
        continue;
      }
      const parentDirectory = path.posix.basename(path.posix.dirname(sourceRel));
      if (parentDirectory !== '.' && parentDirectory !== parsed.data.category) {
        report.warnings.push(`${sourceRel}: category does not match its parent Blog directory`);
      }
      if (Object.hasOwn(parsed.data, 'url')) {
        if (typeof parsed.data.url !== 'string' || !/^https?:\/\//i.test(parsed.data.url)) {
          report.failures.push(`${sourceRel}: url is reserved by Hugo; use slug and aliases for routing`);
          continue;
        }
        if (parsed.data.source_url !== undefined && parsed.data.source_url !== parsed.data.url) {
          report.failures.push(`${sourceRel}: url conflicts with source_url`);
          continue;
        }
        report.warnings.push(`${sourceRel}: external url will be published as source_url to avoid overriding the Hugo route`);
      }
      documents.push({
        file: source.absolute,
        sourceRel,
        stem: sourceRel.replace(/\.md$/i, ''),
        parsed,
        slug,
        url: articleURL(sourceRel, slug),
      });
    } catch (error) {
      report.failures.push(`${source.relative}: ${safeMessage(error)}`);
    }
  }
  if (report.failures.length) throw new Error('validation failed');

  assertUniqueURLs(documents);
  const resolveWiki = createWikiResolver(documents);
  const resolveAttachment = await createAttachmentResolver(blog);
  const attachmentOutputs = new Map();
  const desiredFiles = new Map();
  const articles = [];

  for (const document of documents) {
    const attachments = new Map();
    try {
      const body = await transformMarkdown(document.parsed.body, {
        document,
        resolveAttachment,
        resolveWiki,
        onAttachment: async absolute => {
          const relativeSource = toPosix(path.relative(blogReal, absolute));
          if (!isWithin(blogReal, absolute)) throw new Error('attachment resolved outside Blog');
          const outputRel = `images/published/${document.stem}/${path.basename(absolute)}`;
          const prior = attachmentOutputs.get(outputRel);
          if (prior && prior !== absolute) throw new Error('two attachments map to the same published path');
          attachmentOutputs.set(outputRel, absolute);
          if (!attachments.has(outputRel)) {
            const bytes = await fs.readFile(absolute);
            attachments.set(outputRel, {
              source: `Blog/${relativeSource}`,
              public: `Blog/Public/${outputRel}`,
              hugo: `static/${outputRel}`,
              hash: sha256(bytes),
              bytes,
            });
          }
          return `/${outputRel.split('/').map(encodePathSegment).join('/')}`;
        },
      });
      const data = { ...document.parsed.data, created: dateText(document.parsed.data.created), date: dateText(document.parsed.data.created), slug: document.slug };
      if (Object.hasOwn(data, 'url')) {
        data.source_url = data.url;
        delete data.url;
      }
      const content = `---\n${YAML.stringify(data, { lineWidth: 0 }).trimEnd()}\n---\n${body}`;
      const publicLogical = `Blog/Public/${document.sourceRel}`;
      const hugoLogical = `content/writing/${document.sourceRel}`;
      desiredFiles.set(targetFor(publicLogical, roots), Buffer.from(content));
      desiredFiles.set(targetFor(hugoLogical, roots), Buffer.from(content));
      for (const attachment of attachments.values()) {
        desiredFiles.set(targetFor(attachment.public, roots), attachment.bytes);
        desiredFiles.set(targetFor(attachment.hugo, roots), attachment.bytes);
      }
      const cleanAttachments = [...attachments.values()]
        .map(({ bytes: _bytes, ...entry }) => entry)
        .sort((a, b) => a.public.localeCompare(b.public));
      articles.push({
        source: `Blog/${document.sourceRel}`,
        public: publicLogical,
        hugo: hugoLogical,
        url: document.url,
        hash: sha256(content),
        attachments: cleanAttachments,
      });
    } catch (error) {
      report.failures.push(`${document.sourceRel}: ${safeMessage(error)}`);
    }
  }
  if (report.failures.length) throw new Error('validation failed');

  articles.sort((a, b) => a.source.localeCompare(b.source));
  const manifest = { schemaVersion: 1, articles };
  // Validate our generated manifest with the same parser used for old data.
  materializeManifestTargets(manifest, roots);
  computeChanges(oldManifest, manifest);
  await assertNoUnmanagedConflicts(desiredFiles, oldTargets, roots);
  if (mode !== '--write') return;

  await commitTransaction({ roots, oldTargets, desiredFiles, manifest });
}

async function resolveBlogDirectory(configuredPath) {
  let configuredReal;
  try {
    configuredReal = await fs.realpath(configuredPath);
    if (!(await fs.stat(configuredReal)).isDirectory()) throw new Error();
  } catch {
    throw new Error('OBSIDIAN_VAULT_PATH must point to an existing directory');
  }

  if (path.basename(configuredReal).toLowerCase() === 'blog') return configuredReal;

  const nestedBlog = path.join(configuredReal, 'Blog');
  try {
    const nestedReal = await fs.realpath(nestedBlog);
    if ((await fs.stat(nestedReal)).isDirectory()) return nestedReal;
  } catch { /* Report the common configuration error below. */ }
  throw new Error('OBSIDIAN_VAULT_PATH must point to Blog itself or to a vault containing Blog');
}

function slugify(value) {
  return value.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');
}

function articleURL(sourceRel, slug) {
  const directory = path.posix.dirname(sourceRel);
  const section = directory === '.' ? '' : `${directory.split('/')[0]}/`;
  return `/writing/${section}${slug}/`;
}

function assertUniqueURLs(documents) {
  const urls = new Map([
    ['index.html', 'site home'],
    ['writing/index.html', 'Writing section'],
    ['projects/index.html', 'Projects section'],
    ['about/index.html', 'About page'],
    ['now/index.html', 'Now page'],
    ['tags/index.html', 'tags taxonomy'],
    ['categories/index.html', 'categories taxonomy'],
    ['404.html', '404 page'],
  ]);
  for (const document of documents) {
    const directory = path.posix.dirname(document.sourceRel);
    if (directory !== '.') urls.set(`writing/${directory.split('/')[0]}/index.html`, 'Writing subsection');
  }
  for (const document of documents) {
    const key = routeOutputKey(document.url);
    const prior = urls.get(key);
    if (prior) report.failures.push(`${document.sourceRel}: final URL duplicates ${prior}`);
    else urls.set(key, document.sourceRel);
  }
  for (const document of documents) {
    const aliases = document.parsed.data.aliases ?? [];
    if (!Array.isArray(aliases) || aliases.some(alias => typeof alias !== 'string')) {
      report.failures.push(`${document.sourceRel}: aliases must be an array of site paths`);
      continue;
    }
    for (const alias of aliases) {
      if (!alias.startsWith('/') || /^(?:\/\/|[a-z][a-z0-9+.-]*:)/i.test(alias) || alias.includes('..')) {
        report.failures.push(`${document.sourceRel}: alias must be a safe site-relative path`);
        continue;
      }
      const normalized = routeOutputKey(alias);
      const prior = urls.get(normalized);
      if (prior) report.failures.push(`${document.sourceRel}: alias duplicates a route from ${prior}`);
      else urls.set(normalized, document.sourceRel);
    }
  }
  if (report.failures.length) throw new Error('validation failed');
}

function routeOutputKey(route) {
  let clean = route.replace(/^\/+/, '');
  if (!clean || clean === '/') return 'index.html';
  clean = path.posix.normalize(clean);
  if (clean.endsWith('/index.html')) return clean;
  if (clean.endsWith('/')) return `${clean}index.html`;
  if (path.posix.extname(clean)) return clean;
  return `${clean}/index.html`;
}

function encodePathSegment(segment) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function createWikiResolver(documents) {
  const byStem = new Map(documents.map(document => [normalizeKey(document.stem), document]));
  const aliases = new Map();
  for (const document of documents) {
    for (const alias of [path.posix.basename(document.stem), document.parsed.data.title]) {
      const key = normalizeKey(alias);
      const values = aliases.get(key) ?? [];
      values.push(document);
      aliases.set(key, values);
    }
  }
  return async (raw, current) => {
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(raw)) throw new Error('wiki link target must be a local note');
    const target = raw.replace(/\.md$/i, '').replace(/\\/g, '/').normalize('NFC');
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(current.stem), target));
    const exact = !relative.startsWith('../') ? byStem.get(normalizeKey(relative)) : null;
    if (exact) return exact;
    const rootExact = byStem.get(normalizeKey(path.posix.normalize(target)));
    if (rootExact) return rootExact;
    const matches = aliases.get(normalizeKey(path.posix.basename(target))) ?? [];
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error('wiki link is ambiguous');
    throw new Error('wiki link cannot be resolved to a published article');
  };
}

function normalizeKey(value) {
  return String(value).normalize('NFC').toLowerCase();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function readManifest(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.articles)) throw new Error('manifest must use schemaVersion 1 and contain articles');
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, articles: [] };
    throw new Error(`existing manifest is invalid: ${safeMessage(error)}`);
  }
}

function materializeManifestTargets(manifest, roots) {
  const targets = new Map();
  const sources = new Set();
  for (const article of manifest.articles) {
    const sourceRel = validateManifestPath(article.source, 'Blog');
    validateManifestPath(article.public, 'Blog/Public');
    validateManifestPath(article.hugo, 'content/writing');
    if (!sourceRel.toLowerCase().endsWith('.md') || path.posix.basename(sourceRel).toLowerCase() === '_index.md' || sourceRel.startsWith('Public/')) {
      throw new Error('manifest source must be a publishable Markdown file below Blog');
    }
    if (article.public !== `Blog/Public/${sourceRel}` || article.hugo !== `content/writing/${sourceRel}`) {
      throw new Error('manifest article output paths do not match its source');
    }
    assertHash(article.hash, 'article');
    if (typeof article.url !== 'string' || !/^\/writing\/(?:[^/]+\/)*[^/]+\/$/.test(article.url) || article.url.includes('..')) {
      throw new Error('manifest article URL is invalid');
    }
    if (sources.has(article.source)) throw new Error('existing manifest contains duplicate sources');
    sources.add(article.source);
    addTarget(targets, article.public, roots, article.hash);
    addTarget(targets, article.hugo, roots, article.hash);
    if (!Array.isArray(article.attachments)) throw new Error('manifest article attachments must be an array');
    for (const attachment of article.attachments) {
      const attachmentSource = validateManifestPath(attachment.source, 'Blog');
      const publicRel = validateManifestPath(attachment.public, 'Blog/Public/images/published');
      const hugoRel = validateManifestPath(attachment.hugo, 'static/images/published');
      if (attachmentSource.startsWith('Public/') || attachmentSource.toLowerCase().endsWith('.md')) {
        throw new Error('manifest attachment source is invalid');
      }
      if (attachment.hugo !== `static/images/published/${publicRel}` || path.posix.basename(attachmentSource) !== path.posix.basename(publicRel) || hugoRel !== publicRel) {
        throw new Error('manifest attachment output paths do not match');
      }
      assertHash(attachment.hash, 'attachment');
      addTarget(targets, attachment.public, roots, attachment.hash);
      addTarget(targets, attachment.hugo, roots, attachment.hash);
    }
  }
  return targets;
}

function assertHash(value, kind) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`manifest ${kind} hash is invalid`);
}

function addTarget(targets, logical, roots, expectedHash) {
  const target = targetFor(logical, roots);
  if (targets.has(target)) throw new Error('manifest contains duplicate output paths');
  targets.set(target, { logical, expectedHash });
}

function targetFor(logical, roots) {
  let target;
  let boundary;
  if (logical.startsWith('Blog/Public/')) {
    target = path.join(roots.blog, ...logical.split('/').slice(1));
    boundary = roots.public;
  } else if (logical.startsWith('content/writing/')) {
    target = path.join(root, ...logical.split('/'));
    boundary = roots.writing;
  } else if (logical.startsWith('static/images/published/')) {
    target = path.join(root, ...logical.split('/'));
    boundary = roots.images;
  } else {
    throw new Error('unsupported managed output path');
  }
  if (!isWithin(boundary, target)) throw new Error('managed output escapes its allowed directory');
  return target;
}

async function assertPublicIsManaged(publicRoot, oldTargets) {
  async function visit(directory) {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Blog/Public must not contain symbolic links');
      if (entry.isDirectory()) await visit(absolute);
      else if (!entry.isFile() || !oldTargets.has(absolute)) throw new Error('Blog/Public contains a file not managed by the manifest');
    }
  }
  await visit(publicRoot);
}

async function assertNoUnmanagedConflicts(desiredFiles, oldTargets, roots) {
  for (const target of oldTargets.keys()) await assertManagedFilesystemPath(target, roots);
  await assertManagedHashes(oldTargets);
  for (const target of desiredFiles.keys()) {
    await assertManagedFilesystemPath(target, roots);
    if (oldTargets.has(target)) continue;
    try {
      const stat = await fs.lstat(target);
      if (stat) throw new Error('a generated output would overwrite an unmanaged file');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  try {
    const stat = await fs.lstat(roots.manifest);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('manifest target must be a regular file');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function assertManagedHashes(oldTargets) {
  for (const [target, metadata] of oldTargets) {
    try {
      const actual = sha256(await fs.readFile(target));
      if (actual !== metadata.expectedHash) throw new Error(`managed file was modified outside the publisher: ${metadata.logical}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

async function assertManagedFilesystemPath(target, roots) {
  const boundary = [roots.public, roots.writing, roots.images].find(candidate => isWithin(candidate, target));
  if (!boundary) throw new Error('managed output is outside all allowed directories');
  const trustedBase = boundary === roots.public ? roots.blog : root;
  const relativeParent = path.relative(trustedBase, path.dirname(target));
  let current = trustedBase;
  for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error('managed output path contains a symbolic link');
      if (!stat.isDirectory()) throw new Error('managed output parent is not a directory');
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) throw new Error('managed output target must not be a symbolic link');
    if (!stat.isFile()) throw new Error('managed output target is not a regular file');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function computeChanges(oldManifest, manifest) {
  const oldBySource = new Map(oldManifest.articles.map(article => [article.source, stableRecord(article)]));
  const freshSources = new Set();
  for (const article of manifest.articles) {
    freshSources.add(article.source);
    const old = oldBySource.get(article.source);
    if (!old) report.added.push(article.source);
    else if (old === stableRecord(article)) report.unchanged.push(article.source);
    else report.updated.push(article.source);
  }
  for (const article of oldManifest.articles) if (!freshSources.has(article.source)) report.deleted.push(article.source);
}

function stableRecord(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

async function commitTransaction({ roots, oldTargets, desiredFiles, manifest }) {
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'along-publish-stage-'));
  const backup = await fs.mkdtemp(path.join(os.tmpdir(), 'along-publish-backup-'));
  const allTargets = new Set([...oldTargets.keys(), ...desiredFiles.keys(), roots.manifest]);
  const backupIndex = new Map();
  let keepBackup = false;
  try {
    let index = 0;
    for (const [target, bytes] of desiredFiles) {
      const file = path.join(stage, String(index++));
      await fs.writeFile(file, bytes);
      desiredFiles.set(target, file);
    }
    for (const target of allTargets) {
      try {
        const stat = await fs.lstat(target);
        if (!stat.isFile()) throw new Error('managed output target is not a regular file');
        const copy = path.join(backup, String(backupIndex.size));
        await fs.copyFile(target, copy);
        backupIndex.set(target, copy);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await fs.writeFile(path.join(backup, 'recovery-index.json'), `${JSON.stringify(
      [...backupIndex].map(([target, copy]) => ({ target, backup: path.basename(copy) })),
      null,
      2,
    )}\n`);

    try {
      for (const target of oldTargets.keys()) if (!desiredFiles.has(target)) await fs.rm(target, { force: true });
      let writeCount = 0;
      for (const [target, staged] of desiredFiles) {
        await atomicWrite(target, await fs.readFile(staged));
        writeCount += 1;
        if (process.env.NODE_ENV === 'test' && Number(process.env.ALONG_PUBLISH_TEST_FAIL_AFTER) === writeCount) {
          throw new Error('injected transaction failure');
        }
      }
      await atomicWrite(roots.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
    } catch (error) {
      const recoveryErrors = [];
      let injectedRollbackFailure = false;
      for (const target of allTargets) {
        try {
          const copy = backupIndex.get(target);
          if (copy) {
            if (process.env.NODE_ENV === 'test' && process.env.ALONG_PUBLISH_TEST_FAIL_ROLLBACK === '1' && !injectedRollbackFailure) {
              injectedRollbackFailure = true;
              throw new Error('injected rollback failure');
            }
            await atomicWrite(target, await fs.readFile(copy));
          }
          else await fs.rm(target, { force: true });
        } catch (recoveryError) {
          recoveryErrors.push(`${path.basename(target)}: ${safeMessage(recoveryError)}`);
        }
      }
      if (recoveryErrors.length) {
        keepBackup = true;
        const incomplete = new Error(`publish failed and rollback was incomplete; backup retained at ${backup}; ${recoveryErrors.join('; ')}`);
        incomplete.safeToDisplay = true;
        throw incomplete;
      }
      throw new Error(`publish transaction rolled back: ${safeMessage(error)}`);
    }
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
    if (!keepBackup) await fs.rm(backup, { recursive: true, force: true });
  }
}

async function acquireLock(file) {
  let handle;
  try {
    handle = await fs.open(file, 'wx');
    await handle.writeFile(`${process.pid}\n`);
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error.code === 'EEXIST') throw new Error('another content publish is already running; remove .publish.lock only if no publisher is active');
    throw error;
  }
  return async () => {
    await handle.close();
    await fs.rm(file, { force: true });
  };
}

async function atomicWrite(target, data) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.along-${process.pid}-${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, data);
    try {
      await fs.rename(temporary, target);
    } catch (error) {
      if (!['EEXIST', 'EPERM', 'EACCES'].includes(error.code)) throw error;
      await fs.rm(target, { force: true });
      await fs.rename(temporary, target);
    }
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error?.safeToDisplay) return message;
  return message.replace(/[A-Za-z0-9_./+=-]{24,}/g, '[redacted]');
}

function printReport() {
  for (const [label, items] of Object.entries(report)) {
    console.log(`${label}: ${items.length}`);
    for (const item of items) console.log(`  - ${item}`);
  }
}
