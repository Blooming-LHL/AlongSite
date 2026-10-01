#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';
import { toPosix } from './validate-content.mjs';

if (process.argv.length !== 3 || process.argv[2] !== '--frontmatter') {
  console.error('Usage: node scripts/frontmatter-defaults.mjs --frontmatter');
  process.exit(2);
}

const report = { generated: [], unchanged: [], skipped: [], failures: [] };
let releaseLock = async () => {};
try {
  const configured = process.env.OBSIDIAN_VAULT_PATH;
  if (!configured) throw new Error('OBSIDIAN_VAULT_PATH is required');
  const blog = await resolveBlogDirectory(configured);
  releaseLock = await acquireLock(path.join(process.cwd(), '.publish.lock'));
  const notes = await scanNotes(blog);
  const changes = [];
  for (const note of notes) {
    const original = await fs.readFile(note.absolute);
    const body = original.toString('utf8');
    // Detect against the same byte snapshot used to build the output.
    if (hasFrontMatter(body)) {
      report.skipped.push(`${note.relative}: front matter already present`);
      continue;
    }
    const stat = await fs.stat(note.absolute);
    const data = {
      title: path.posix.basename(toPosix(note.relative)).replace(/\.md$/i, ''),
      description: excerpt(body),
      created: localDate(stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime),
      category: path.posix.dirname(toPosix(note.relative)) === '.'
        ? '未分类'
        : path.posix.basename(path.posix.dirname(toPosix(note.relative))),
      public: false,
    };
    const prefix = Buffer.from(`---\n${YAML.stringify(data, { lineWidth: 0 }).trimEnd()}\n---\n`, 'utf8');
    changes.push({ ...note, hash: hash(original), output: Buffer.concat([prefix, original]) });
  }
  await commit(changes);
  report.generated.push(...changes.map(change => change.relative));
} catch (error) {
  report.failures.push(safeMessage(error));
  printReport();
  process.exitCode = 1;
} finally {
  await releaseLock();
}
if (!report.failures.length) printReport();

async function resolveBlogDirectory(configuredPath) {
  let real;
  try { real = await fs.realpath(path.resolve(configuredPath)); } catch { throw new Error('OBSIDIAN_VAULT_PATH must point to an existing directory'); }
  if ((await fs.stat(real)).isDirectory() && path.basename(real).toLowerCase() === 'blog') return real;
  const nested = path.join(real, 'Blog');
  try { if ((await fs.stat(nested)).isDirectory()) return await fs.realpath(nested); } catch { /* handled below */ }
  throw new Error('OBSIDIAN_VAULT_PATH must point to Blog itself or to a vault containing Blog');
}

async function scanNotes(blog) {
  const notes = [];
  async function visit(directory, relative = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'Public' && !relative) continue;
      const child = path.join(directory, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      // Symlinks are deliberately ignored; never follow them during a source scan.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(child, childRelative);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const real = await fs.realpath(child);
        if (!isWithin(blog, real)) throw new Error(`note escapes Blog: ${childRelative}`);
        notes.push({ absolute: child, relative: childRelative });
      }
    }
  }
  await visit(blog);
  notes.sort((a, b) => a.relative.localeCompare(b.relative));
  return notes;
}

async function commit(changes) {
  if (!changes.length) return;
  // Check every input immediately before any rename, preventing partial writes on concurrent edits.
  for (const change of changes) {
    const stat = await fs.lstat(change.absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || hash(await fs.readFile(change.absolute)) !== change.hash) {
      throw new Error(`source changed since scan: ${change.relative}`);
    }
  }
  const staged = [];
  const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'along-frontmatter-backup-'));
  let retainBackup = false;
  try {
    for (const change of changes) {
      const temporary = path.join(path.dirname(change.absolute), `.${path.basename(change.absolute)}.frontmatter-${process.pid}-${crypto.randomUUID()}.tmp`);
      const handle = await fs.open(temporary, 'wx', (await fs.stat(change.absolute)).mode);
      staged.push({ change, temporary });
      try { await handle.writeFile(change.output); } finally { await handle.close(); }
    }
    for (const { change } of staged) {
      if (hash(await fs.readFile(change.absolute)) !== change.hash) throw new Error(`source changed during generation: ${change.relative}`);
    }
    const backups = new Map();
    for (const { change } of staged) {
      const backup = path.join(backupDir, String(backups.size));
      await fs.copyFile(change.absolute, backup);
      backups.set(change.absolute, { backup, originalHash: change.hash });
    }
    await fs.writeFile(path.join(backupDir, 'recovery-index.json'), `${JSON.stringify(
      [...backups].map(([file, entry]) => ({ file, backup: path.basename(entry.backup) })), null, 2,
    )}\n`);
    const applied = new Set();
    try {
      let writeCount = 0;
      for (const { change, temporary } of staged) {
        if (hash(await fs.readFile(change.absolute)) !== change.hash) throw new Error(`source changed during commit: ${change.relative}`);
        await fs.rename(temporary, change.absolute);
        applied.add(change.absolute);
        writeCount += 1;
        if (process.env.NODE_ENV === 'test' && Number(process.env.ALONG_FRONTMATTER_TEST_FAIL_AFTER) === writeCount) {
          throw new Error('injected front matter transaction failure');
        }
      }
    } catch (error) {
      const recoveryErrors = [];
      let injected = false;
      for (const [file, entry] of backups) {
        if (!applied.has(file)) continue;
        try {
          if (process.env.NODE_ENV === 'test' && process.env.ALONG_FRONTMATTER_TEST_FAIL_ROLLBACK === '1' && !injected) {
            injected = true;
            throw new Error('injected front matter rollback failure');
          }
          const published = staged.find(item => item.change.absolute === file)?.change.output;
          if (!published || hash(await fs.readFile(file)) !== hash(published)) {
            throw new Error('source changed during rollback');
          }
          await atomicRestore(file, entry.backup);
        } catch (recoveryError) {
          recoveryErrors.push(`${path.basename(file)}: ${safeMessage(recoveryError)}`);
        }
      }
      if (recoveryErrors.length) {
        retainBackup = true;
        const incomplete = new Error(`front matter transaction rolled back incompletely; backup retained at ${backupDir}; ${recoveryErrors.join('; ')}`);
        incomplete.safeToDisplay = true;
        throw incomplete;
      }
      throw new Error(`front matter transaction rolled back: ${safeMessage(error)}`);
    }
  } finally {
    for (const { temporary } of staged) await fs.rm(temporary, { force: true });
    if (!retainBackup) await fs.rm(backupDir, { recursive: true, force: true });
  }
}

async function atomicRestore(target, backup) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.frontmatter-restore-${process.pid}-${crypto.randomUUID()}.tmp`);
  try {
    await fs.copyFile(backup, temporary);
    await fs.chmod(temporary, (await fs.stat(backup)).mode);
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function hasFrontMatter(text) { return /^\uFEFF?---[ \t]*\r?\n/.test(text); }
function excerpt(text) {
  const clean = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
    .replace(/!?(?:\[[^\]]*\]\([^)]*\)|\[([^\]]+)\]\([^)]*\))/g, '$1')
    .replace(/<[^>]+>/g, ' ').replace(/^\s{0,3}#{1,6}\s+.*$/gm, ' ')
    .replace(/[*_~>#]/g, ' ').replace(/\s+/g, ' ').trim();
  return (clean.slice(0, 160).trim() || '未提供描述');
}
function localDate(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function isWithin(root, candidate) { const rel = path.relative(path.resolve(root), path.resolve(candidate)); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); }
async function acquireLock(file) { const handle = await fs.open(file, 'wx').catch(error => { if (error.code === 'EEXIST') throw new Error('another content publish is already running'); throw error; }); await handle.writeFile(`${process.pid}\n`); return async () => { await handle.close(); await fs.rm(file, { force: true }); }; }
function safeMessage(error) { const message = String(error?.message ?? error); return error?.safeToDisplay ? message : message.replace(/[A-Za-z0-9_./+=-]{24,}/g, '[redacted]'); }
function printReport() { for (const [label, items] of Object.entries(report)) { console.log(`${label}: ${items.length}`); for (const item of items) console.log(`  - ${item}`); } }
