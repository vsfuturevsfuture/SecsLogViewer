/* test-standalone.mjs —— 证明“构建产物脱离工程也能跑”：
 * 把 dist/index.html 单独拷到系统临时目录，在 jsdom 里加载并点“载入示例数据”，
 * 确认界面能出结果，并且它没有引用任何外部文件/网络资源。
 * 这条测试就是回答“别人只拿到一个文件，能不能用”。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist', 'index.html');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS  ' + name);
  else { failures++; console.log('  FAIL  ' + name + (extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); }
}

console.log('\n[1] 把 dist/index.html 拿到工程外面');
if (!fs.existsSync(dist)) {
  console.log('  SKIP  没有 dist/index.html，先跑 npm run build');
  process.exit(1);
}
const box = fs.mkdtempSync(path.join(os.tmpdir(), 'secslog-alone-'));
const target = path.join(box, 'index.html');
fs.copyFileSync(dist, target);
console.log('        拷贝到：' + target);
check('临时目录里只有这一个文件', fs.readdirSync(box).length === 1, fs.readdirSync(box));

// dist 里不应该混进源码类文件（.vue / package.json / vite.config 等）
const distDir = path.join(here, '..', 'dist');
const leaked = fs.readdirSync(distDir).filter((f) => /\.vue$|package\.json|vite\.config/i.test(f));
check('dist 里没有源码文件泄漏', leaked.length === 0, leaked);

const html = fs.readFileSync(target, 'utf8');
console.log('\n[2] 它是自包含的');
check('没有 <script src=>（JS 内联）', !/<script[^>]+\ssrc=/.test(html));
check('没有 <link rel="stylesheet">（CSS 内联）', !/<link[^>]+rel="stylesheet"/.test(html));
check('没有引用 http(s) 外部资源', !/(src|href)\s*=\s*["']https?:/i.test(html));
check('没有引用 node_modules / 相对路径资源', !/(src|href)\s*=\s*["'][^"']*(node_modules|\/src\/)/i.test(html));

console.log('\n[3] 在临时目录里跑起来（外面没有 src/、package.json、node_modules）');
const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', (e) => errors.push(String((e && e.message) || e)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: 'file:///' + target.replace(/\\/g, '/'),
  beforeParse(window) {
    window.TextDecoder = TextDecoder;
    window.TextEncoder = TextEncoder;
  }
});
const { window } = dom;
const doc = window.document;
await new Promise((r) => setTimeout(r, 300));

check('没有 JS 报错', errors.length === 0, errors.slice(0, 2));
check('Vue 应用挂载成功', doc.body.textContent.includes('SECS 日志解析工具'));

const demo = Array.from(doc.querySelectorAll('button')).find((b) => b.textContent.includes('载入示例数据'));
demo.click();
const t0 = Date.now();
while (Date.now() - t0 < 20000 && window.__secsTool.pairs.value.length === 0) {
  await new Promise((r) => setTimeout(r, 50));
}
check('点示例数据能解析出结果', window.__secsTool.pairs.value.length === 2, window.__secsTool.pairs.value.length);
check('界面上能看到 26555 = 1.6 = SDC8_GPPosHom',
  doc.body.textContent.includes('26555') && doc.body.textContent.includes('1.6') && doc.body.textContent.includes('SDC8_GPPosHom'));

console.log('\n[4] 收尾');
dom.window.close();
fs.rmSync(box, { recursive: true, force: true });
check('临时目录已清理', !fs.existsSync(box));

console.log('\n' + (failures ? '有 ' + failures + ' 项失败' : '全部通过 ✔'));
process.exit(failures ? 1 : 0);
