import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export const toPosix = value => value.split(path.sep).join('/');

export function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function dateText(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export function isRealDate(value) {
  const text = dateText(value);
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === text;
}

export async function parseFrontMatter(file) {
  const text = await fs.readFile(file, 'utf8');
  const match = text.match(FRONT_MATTER);
  if (!match) return { text, data: {}, body: text };
  const document = YAML.parseDocument(match[1]);
  if (document.errors.length) {
    const position = document.errors[0].linePos?.[0];
    const location = position ? ` at line ${position.line}, column ${position.col}` : '';
    throw new Error(`invalid YAML${location}`);
  }
  const data = document.toJS() ?? {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('front matter must be a YAML mapping');
  }
  return { text, data, body: text.slice(match[0].length) };
}

export function validateDocument(data) {
  const missing = ['title', 'description', 'created', 'category']
    .filter(key => data[key] === undefined || data[key] === null || data[key] === '');
  if (missing.length) return `missing required fields: ${missing.join(', ')}`;
  if (typeof data.title !== 'string' || typeof data.description !== 'string' || typeof data.category !== 'string') {
    return 'title, description and category must be strings';
  }
  if (!isRealDate(data.created)) return 'created must be a real YYYY-MM-DD date';
  if (data.slug !== undefined && (typeof data.slug !== 'string' || !/^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u.test(data.slug))) {
    return 'slug must contain only letters, numbers, hyphens or underscores';
  }
  return null;
}

const SENSITIVE_PATTERNS = [
  ['known access token', /(?:ghp_|github_pat_|xox[baprs]-|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{16,})/i],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
  ['bearer token', /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i],
  ['secret assignment', /\b(?:api[_ -]?key|token|secret|password)\s*[:=]\s*['"]?[A-Za-z0-9_./+=-]{8,}/i],
  ['private network address', /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|127\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/],
  ['private network host', /(?:\blocalhost\b|\b[A-Za-z0-9-]+\.(?:internal|local|corp)\b)(?::\d+)?/i],
  ['local absolute path', /(?:file:\/\/|\/Users\/|\/home\/|(?:^|[\s("'=])[A-Za-z]:[\\/](?![\\/]))/im],
  ['possible account identifier', /\b(?:工号|账号|学号)\s*[:：]?\s*[A-Za-z0-9_-]{4,}/i],
];

export async function scanSensitive(text, { wordsFile } = {}) {
  const findings = SENSITIVE_PATTERNS.filter(([, expression]) => expression.test(text)).map(([label]) => label);
  if (wordsFile) {
    try {
      const words = (await fs.readFile(wordsFile, 'utf8'))
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      const lower = text.toLowerCase();
      if (words.some(word => lower.includes(word.toLowerCase()))) findings.push('custom sensitive word');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return [...new Set(findings)];
}

export async function listFiles(root, { skipDirectory = () => false } = {}) {
  const files = [];
  async function visit(directory, relativeDirectory = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirectory(relative, entry.name)) await visit(absolute, relative);
      } else if (entry.isFile()) {
        files.push({ absolute, relative });
      }
    }
  }
  try { await visit(root); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return files;
}

export async function createAttachmentResolver(blogRoot) {
  const blogReal = await fs.realpath(blogRoot);
  const files = await listFiles(blogRoot, { skipDirectory: (_relative, name) => name === 'Public' });
  const byBasename = new Map();
  for (const file of files) {
    if (file.relative.toLowerCase().endsWith('.md')) continue;
    let real;
    try { real = await fs.realpath(file.absolute); } catch { continue; }
    if (!isWithin(blogReal, real)) continue;
    const key = path.basename(file.relative).normalize('NFC').toLowerCase();
    const values = byBasename.get(key) ?? [];
    values.push(real);
    byBasename.set(key, values);
  }

  return async function resolveAttachment(raw, sourceFile) {
    let clean = String(raw).trim().replace(/^<|>$/g, '').split('#')[0].split('?')[0];
    try { clean = decodeURIComponent(clean); } catch { throw new Error('attachment path has invalid URL encoding'); }
    if (!clean || /^(?:[a-z][a-z0-9+.-]*:|\/|\\|[A-Za-z]:[\\/])/i.test(clean)) {
      throw new Error('attachment path must be relative and local');
    }
    if (clean.split(/[\\/]/).includes('..')) throw new Error('attachment path traversal is not allowed');

    const candidates = [path.resolve(path.dirname(sourceFile), clean), path.resolve(blogRoot, clean)];
    const direct = [];
    for (const candidate of new Set(candidates)) {
      try {
        const real = await fs.realpath(candidate);
        const stat = await fs.stat(real);
        if (stat.isFile() && isWithin(blogReal, real)) direct.push(real);
      } catch { /* Fall through to Obsidian's basename lookup. */ }
    }
    const uniqueDirect = [...new Set(direct)];
    if (uniqueDirect.length === 1) {
      if (uniqueDirect[0].toLowerCase().endsWith('.md')) throw new Error('Markdown notes cannot be published as attachments');
      return uniqueDirect[0];
    }
    if (uniqueDirect.length > 1) throw new Error('attachment reference is ambiguous');

    const matches = [...new Set(byBasename.get(path.basename(clean).normalize('NFC').toLowerCase()) ?? [])];
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error('attachment reference is ambiguous');
    throw new Error('attachment does not exist inside Blog');
  };
}

export function validateManifestPath(value, prefix) {
  if (typeof value !== 'string' || !value.startsWith(`${prefix}/`) || value.includes('\\') || path.posix.isAbsolute(value)) {
    throw new Error(`manifest path must be below ${prefix}`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized.split('/').includes('..')) throw new Error(`unsafe manifest path below ${prefix}`);
  return value.slice(prefix.length + 1);
}
