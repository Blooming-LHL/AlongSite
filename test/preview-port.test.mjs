import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec=promisify(execFile);
const script=fileURLToPath(new URL('../scripts/set-preview-port.sh',import.meta.url));
const config=`# Managed by AlongSite setup-preview-server.sh
server {
    listen 80;
    server_name 42.193.226.154;
    root /srv/alongsite-preview/current;
    index index.html;
    location / { try_files $uri $uri/ =404; }
}
`;
async function fixture(t,source=config) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'along-port-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const input=path.join(dir,'site.conf'),output=path.join(dir,'new.conf');
  await fs.writeFile(input,source);
  const render=port=>exec('bash',['-c','source "$1"; render_preview_port "$2" "$3" "$4"','bash',script,input,output,String(port)]);
  return {input,output,render};
}
test('port migration preserves site contents and adds profile routes once',async t=>{
  const {input,output,render}=await fixture(t);
  await render(8081);
  const updated=await fs.readFile(output,'utf8');
  assert.ok(updated.includes('listen 8081;'));
  assert.ok(updated.includes('location ~ ^/en/about/?$ { return 301 /; }'));
  assert.ok(updated.includes('location = /cn/about { try_files /cn/about/index.html =404; }'));
  assert.ok(updated.includes('location / { try_files $uri $uri/ =404; }'));
  const twice=path.join(path.dirname(output),'twice.conf');
  await exec('bash',['-c','source "$1"; render_preview_port "$2" "$3" 8081','bash',script,output,twice]);
  assert.equal(await fs.readFile(twice,'utf8'),updated);
  assert.equal(await fs.readFile(input,'utf8'),config);
});
test('migration refuses unrelated or multi-listener configurations',async t=>{
  for(const source of [config.replace('# Managed by AlongSite setup-preview-server.sh',''),config.replace('listen 80;','listen 80;\n    listen 443 ssl;')]) {
    const {input,output,render}=await fixture(t,source);
    await assert.rejects(render(8081),/unmanaged|exactly one/);
    assert.equal(await fs.readFile(input,'utf8'),source);
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
  }
});
test('invalid ports are rejected without writing a replacement config',async t=>{
  const {output,render}=await fixture(t);
  for(const port of [22,80,1023,65536,'8081;server','oops']) await assert.rejects(render(port),/Expected a port/);
  await assert.rejects(fs.stat(output),{code:'ENOENT'});
});
