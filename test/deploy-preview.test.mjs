import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec=promisify(execFile);
const script=fileURLToPath(new URL('../scripts/deploy-preview.sh',import.meta.url));
const first='a'.repeat(40), second='b'.repeat(40);
async function fixture(t) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'along-preview-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const root=path.join(dir,'site'); await fs.mkdir(root);
  async function archive(name,complete=true) {
    const source=path.join(dir,name); await fs.mkdir(source);
    await fs.writeFile(path.join(source,'index.html'),name);
    if(complete) {await fs.mkdir(path.join(source,'pagefind'));await fs.writeFile(path.join(source,'pagefind','pagefind.js'),'// index');}
    const file=path.join(dir,`${name}.tar.gz`);
    await exec('tar',['-czf',file,'-C',source,'.']); return file;
  }
  return {root,archive};
}
test('publishing switches the complete release and preserves the previous version',async t=>{
  const {root,archive}=await fixture(t);
  await exec('bash',[script,await archive('first'),root,first]);
  const previous=await fs.readlink(path.join(root,'current'));
  await exec('bash',[script,await archive('second'),root,second]);
  assert.equal(await fs.readFile(path.join(root,'current','index.html'),'utf8'),'second');
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'current','deployment.json'),'utf8')).commit,second);
  assert.equal(await fs.readFile(path.join(previous,'index.html'),'utf8'),'first');
  assert.notEqual(await fs.readlink(path.join(root,'current')),previous);
});
test('an incomplete artifact leaves the live version unchanged and removes staging files',async t=>{
  const {root,archive}=await fixture(t);
  await exec('bash',[script,await archive('valid'),root,first]);
  const previous=await fs.readlink(path.join(root,'current'));
  await assert.rejects(exec('bash',[script,await archive('incomplete',false),root,second]),/Artifact must include/);
  assert.equal(await fs.readlink(path.join(root,'current')),previous);
  assert.equal(await fs.readFile(path.join(root,'current','index.html'),'utf8'),'valid');
  assert.ok((await fs.readdir(path.join(root,'releases'))).every(name=>!name.startsWith('.staging.')));
});
