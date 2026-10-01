import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHostname, resolveVaultPath } from '../scripts/resolve-vault-path.mjs';

test('normalizes hostnames case-insensitively and strips .local', () => {
  assert.equal(normalizeHostname('xiaolongtongxuedeMacBook-Pro.local'), 'xiaolongtongxuedemacbook-pro');
});

test('resolves the Mac default mapping', async () => {
  const resolved = await resolveVaultPath({
    env: {},
    hostname: 'xiaolongtongxuedeMacBook-Pro.local',
    platform: 'darwin',
    mappings: { 'xiaolongtongxuedemacbook-pro': '/Users/lhl/Blog' },
  });
  assert.equal(resolved, '/Users/lhl/Blog');
});

test('resolves Windows-style mappings with Windows path semantics', async () => {
  const resolved = await resolveVaultPath({
    env: {},
    hostname: 'WINDOWS-DESKTOP.local',
    platform: 'win32',
    mappings: { 'windows-desktop': 'D:\\Administrator\\Documents\\Blog' },
  });
  assert.equal(resolved, 'D:\\Administrator\\Documents\\Blog');
});

test('repository defaults cover both configured devices', async () => {
  assert.equal(await resolveVaultPath({ env: {}, hostname: 'xiaolongtongxuedeMacBook-Pro.local', platform: 'darwin' }), '/Users/lhl/Blog');
  assert.equal(await resolveVaultPath({ env: {}, hostname: 'ALong-PC', platform: 'win32' }), 'D:\\Administrator\\Documents\\Blog');
});

test('explicit environment path overrides the host mapping', async () => {
  const resolved = await resolveVaultPath({
    env: { OBSIDIAN_VAULT_PATH: '/custom/blog' },
    hostname: 'unknown-host',
    platform: 'darwin',
    mappings: {},
  });
  assert.equal(resolved, '/custom/blog');
});

test('unknown hosts fail with an actionable message', async () => {
  await assert.rejects(
    resolveVaultPath({ env: {}, hostname: 'unknown-host.local', mappings: {} }),
    /No Obsidian vault path configured.*vault-paths\.json.*OBSIDIAN_VAULT_PATH/,
  );
});

test('rejects a relative configured default path', async () => {
  await assert.rejects(
    resolveVaultPath({ env: {}, hostname: 'mac.local', platform: 'darwin', mappings: { mac: 'Blog' } }),
    /must be an absolute path/,
  );
});
