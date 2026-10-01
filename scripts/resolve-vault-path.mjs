import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultConfigFile = path.join(repoRoot, 'vault-paths.json');

/** Normalize hostnames used as keys in vault-paths.json. */
export function normalizeHostname(hostname) {
  return String(hostname ?? '').trim().toLowerCase().replace(/\.local$/, '');
}

export async function loadVaultPaths(configFile = defaultConfigFile) {
  const contents = await fs.readFile(configFile, 'utf8');
  const config = JSON.parse(contents);
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`vault path config must be an object: ${configFile}`);
  }
  return Object.fromEntries(Object.entries(config).map(([hostname, vaultPath]) => [normalizeHostname(hostname), vaultPath]));
}

/**
 * Resolve the Obsidian Blog path. An explicit environment variable always wins.
 * `platform` and `hostname` are injectable to keep Windows behavior testable on
 * non-Windows machines.
 */
export async function resolveVaultPath({
  env = process.env,
  hostname = os.hostname(),
  platform = process.platform,
  mappings,
  configFile = defaultConfigFile,
} = {}) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const configured = env.OBSIDIAN_VAULT_PATH?.trim();
  if (configured) return pathApi.resolve(configured);

  const rawPaths = mappings ?? await loadVaultPaths(configFile);
  const paths = Object.fromEntries(Object.entries(rawPaths).map(([host, vaultPath]) => [normalizeHostname(host), vaultPath]));
  const key = normalizeHostname(hostname);
  const defaultPath = paths[key];
  if (defaultPath !== undefined) {
    if (typeof defaultPath !== 'string' || !defaultPath.trim() || !pathApi.isAbsolute(defaultPath)) {
      throw new Error(`Vault path for host "${hostname}" must be an absolute path in vault-paths.json`);
    }
    return pathApi.normalize(defaultPath);
  }

  throw new Error(
    `No Obsidian vault path configured for host "${hostname}". `
    + 'Add this host to vault-paths.json or set OBSIDIAN_VAULT_PATH.',
  );
}
