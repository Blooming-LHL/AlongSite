import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hugo=process.env.HUGO_BIN||'hugo';
let available=true;
try {execFileSync(hugo,['version'],{stdio:'ignore'});} catch {available=false;}
const options={skip:!available&&'Hugo is not installed'};
let output,zh,en,legacy,cvZh,cvEn,sitemap;
before(async()=>{
  if(!available)return;
  output=await fs.mkdtemp(path.join(os.tmpdir(),'along-profile-v3-'));
  await promisify(execFile)(hugo,['--source',root,'--destination',output,'--quiet']);
  const read=file=>fs.readFile(path.join(output,file),'utf8');
  [zh,en,legacy,cvZh,cvEn,sitemap]=await Promise.all(['cn/about/index.html','index.html','en/about/index.html','cv/zh/index.html','cv/en/index.html','sitemap.xml'].map(read));
});
after(async()=>{if(output)await fs.rm(output,{recursive:true,force:true});});

test('root English and Chinese profiles have reciprocal native links and accurate metadata',options,()=>{
  assert.match(en,/<html lang="en">/);
  assert.match(zh,/<html lang="zh-CN">/);
  assert.match(en,/<link rel="canonical" href="https:\/\/alongsite\.netlify\.app\/">/);
  assert.match(zh,/<link rel="canonical" href="https:\/\/alongsite\.netlify\.app\/cn\/about">/);
  assert.match(en,/<meta property="og:locale" content="en_US">/);
  for(const html of [zh,en]) {
    assert.match(html,/hreflang="zh-CN" href="https:\/\/alongsite\.netlify\.app\/cn\/about"/);
    assert.match(html,/hreflang="en" href="https:\/\/alongsite\.netlify\.app\/"/);
    assert.match(html,/hreflang="x-default" href="https:\/\/alongsite\.netlify\.app\/"/);
    assert.match(html,/href="\/" lang="en" hreflang="en"/);
    assert.match(html,/href="\/cn\/about" lang="zh-CN" hreflang="zh-CN"/);
    assert.doesNotMatch(html,/entry-choice|mailto:|1458169154|github\.com|download|href="#contact"|href="#cv"|href="#projects"|href="#skills"/);
    const header=html.match(/<header class="p-header"[\s\S]*?<\/header>/)[0];
    assert.equal((header.match(/<a /g)||[]).length,4); // Identity, blog, two language links.
    assert.doesNotMatch(header,/>About</);
  }
  assert.match(en,/hreflang="en" aria-current="page">EN/);
  assert.match(zh,/hreflang="zh-CN" aria-current="page">中文/);
  assert.doesNotMatch(en.replace(/<[^>]+>/g,'').replaceAll('中文',''),/[\u3400-\u9fff]/);
});

test('profile shows concise work and education, no research or detailed internship descriptions',options,()=>{
  for(const html of [zh,en]) {
    assert.match(html,/OPPO/);
    assert.match(html,/阿里云|Alibaba Cloud/);
    assert.doesNotMatch(html,/心潮|Shopify|13432003979|lhl1458169154|待补充|待上传|Coming soon|work-card|skills-table|project-architecture/);
    for(const id of ['projects','skills','cv']) {
      const section=html.match(new RegExp(`<section class="profile-reserved" id="${id}"[\\s\\S]*?<\\/section>`))[0];
      assert.match(section,/data-pagefind-ignore/);
      assert.equal((section.match(/<h2 /g)||[]).length,1);
      assert.doesNotMatch(section,/<a |<p>|<ul|<button|<img/);
    }
  }
  assert.match(zh,/2026\.07 — 至今/);
  assert.match(en,/Jul 2026 — Present/);
  assert.match(en,/May — Sep 2025/);
  assert.match(en,/Database Products Department/);
  assert.match(zh,/数据库产品部/);
  for (const html of [zh,en]) {
    assert.doesNotMatch(html,/resume-bullets|profile-research|research-count|CCF A|Patents|专利|ReAct|KWOK|Popularity Award|profile-blog-card|profile-index/);
    assert.equal((html.match(/href="\/blog\/"/g)||[]).length,1);
    assert.match(html,/class="profile-photo-placeholder" role="img" aria-label=/);
    assert.doesNotMatch(html,/<img/);
  }
  assert.match(en,/id="profile-heading">Henglong Liang/);
  assert.match(zh,/id="profile-heading">梁恒龙/);
  assert.match(zh,/中山大学/);
  assert.match(en,/Sun Yat-sen University/);
  assert.match(en,/South China University of Technology/);
});

test('legacy English is an unindexed compatibility page rather than duplicate profile content',options,async()=>{
  assert.match(legacy,/http-equiv="refresh" content="0; url=\/"/);
  assert.match(legacy,/<meta name="robots" content="noindex,follow">/);
  assert.match(legacy,/href="\/">Continue to the profile/);
  assert.doesNotMatch(legacy,/data-pagefind-body|OPPO|profile-heading/);
  assert.doesNotMatch(sitemap,/\/en\/about\//);
  const config=await fs.readFile(path.join(root,'netlify.toml'),'utf8');
  assert.match(config,/from = "\/en\/about\/"\s+to = "\/"\s+status = 301/);
  assert.ok(config.indexOf('from = "/en/about/"')<config.indexOf('from = "/*"'));
});

test('CV resources remain directly available but are absent from personal profile UI',options,async()=>{
  for(const lang of ['zh','en']) {
    const pdf=await fs.readFile(path.join(output,'cv',`liang-henglong-${lang}.pdf`));
    assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  }
  assert.match(cvEn,/OPPO/); assert.match(cvZh,/阿里云/);
  assert.doesNotMatch(cvEn+cvZh,/data-pagefind-body/);
  assert.doesNotMatch(en+zh,/href="\/cv\//);
});


test('configuring a real photo renders a stable image instead of the reserved frame',options,async()=>{
  const config=path.join(output,'photo.yaml'),destination=path.join(output,'with-photo');
  await fs.writeFile(config,'params:\n  profile_photo: "/images/IMG_5943.JPG"\n');
  await promisify(execFile)(hugo,['--source',root,'--config',`${path.join(root,'hugo.yaml')},${config}`,'--destination',destination,'--quiet']);
  const html=await fs.readFile(path.join(destination,'index.html'),'utf8');
  assert.match(html,/<img src="\/images\/IMG_5943\.JPG" alt="Henglong Liang" width="800" height="1000" decoding="async">/);
  assert.doesNotMatch(html,/profile-photo-placeholder/);
});
