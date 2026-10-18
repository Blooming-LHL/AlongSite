import fs from 'node:fs/promises';

const directory = new URL('./', import.meta.url);
const preview = new URL('cover-card-preview.html', directory);
const source = await fs.readFile(preview, 'utf8');
const fragment = await fs.readFile(new URL('cover-card-directions.html', directory), 'utf8');
const style = fragment.match(/<style>([\s\S]*?)<\/style>/)[1];
const script = fragment.match(/<script>([\s\S]*?)<\/script>/)[1];
const names = ['轻盈瀑布流', '沉浸海报流', '杂志跨栏流'];
for (let index = 0; index < names.length; index += 1) {
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${names[index]} · ALong 首页方案</title><style>html,body{margin:0;background:#f1eef8}body{width:1024px;margin:0 auto}#along-cover-designs .al-site{min-height:990px} .preview-title{font:500 16px/1.5 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;color:#48335d;margin:0;padding:15px 24px;background:#f1eef8} ${style}</style><h1 class="preview-title">${String.fromCharCode(65 + index)} · ${names[index]}</h1><div id="along-cover-designs">${names.map((name, i) => `<section data-variant="${name}"${i !== index ? ' hidden' : ''}></section>`).join('')}</div><script>${script}</script></html>`;
  await fs.writeFile(new URL(`direction-${index + 1}.html`, directory), html);
}
console.log('Prepared 3 standalone screenshot pages; original preview preserved.');
