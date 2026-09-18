/* test-app.mjs —— 用 jsdom 直接加载构建产物 dist/index.html，验证“真的能跑起来”
 *   1) 产物是单文件、普通脚本（file:// 打开也没问题）；
 *   2) Vue 应用挂载成功、初始界面渲染出来；
 *   3) 走一遍真实流程（示例数据 / 真日志 + 真 SVID.cfg/ECID.cfg），检查界面上的结果。
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const distPath = path.join(root, 'dist', 'index.html');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS  ' + name);
  else { failures++; console.log('  FAIL  ' + name + (extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); }
}

/* --------------------------- 1) 产物形态检查 --------------------------- */
console.log('\n[1] dist/index.html 形态');
if (!fs.existsSync(distPath)) {
  console.log('  SKIP  没有 dist/index.html，先跑 npm run build');
  process.exit(1);
}
const html = fs.readFileSync(distPath, 'utf8');
check('是单文件（没有外部 script src）', !/<script[^>]+src=/.test(html));
check('没有 <link rel=stylesheet>（CSS 已内联）', !/<link[^>]+rel="stylesheet"/.test(html));
check('不是 type="module"（file:// 下才不会被 CORS 拦）', !/type="module"/.test(html));
check('脚本里没有裸 import/export 语句', !/^\s*import\s.+from/m.test(html) && !/^\s*export\s/m.test(html));
console.log('        体积 ' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB');

/* --------------------------- 2) 挂载检查 --------------------------- */
console.log('\n[2] jsdom 里跑起来');
const virtualConsole = new VirtualConsole();
const pageErrors = [];
virtualConsole.on('jsdomError', (e) => pageErrors.push(String(e && e.message || e)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  url: 'file:///C:/Temp/secs_log_viewer.html',
  // jsdom 没实现 TextDecoder/TextEncoder，浏览器里有；测试时用 Node 的实现补上
  beforeParse(window) {
    window.TextDecoder = TextDecoder;
    window.TextEncoder = TextEncoder;
  }
});
const { window } = dom;
const doc = window.document;

await new Promise((r) => setTimeout(r, 200));
check('页面没有 JS 报错', pageErrors.length === 0, pageErrors.slice(0, 3));
check('Vue 已经挂载（标题渲染出来）', doc.body.textContent.includes('SECS 日志解析工具'));
check('初始显示“还没有解析结果”', doc.body.textContent.includes('还没有解析结果'));
check('初始化出了 window.__secsTool（测试/调试入口）', !!window.__secsTool);

/* --------------------------- 3) 示例数据全流程 --------------------------- */
console.log('\n[3] 点示例数据走一遍');
const demoBtn = Array.from(doc.querySelectorAll('button')).find((b) => b.textContent.includes('载入示例数据'));
check('找得到示例按钮', !!demoBtn);
demoBtn.click();
await waitFor(() => window.__secsTool.pairs.value.length > 0, 20000);
check('解析出 2 对 S2F13/S2F14（第 3 个请求被插队，不算一对）', window.__secsTool.pairs.value.length === 2, window.__secsTool.pairs.value.length);
const bodyText = () => doc.body.textContent;
check('明细里出现 26555 = 1.6 且名称来自 ECID 表', bodyText().includes('26555') && bodyText().includes('1.6') && bodyText().includes('SDC8_GPPosHom'));
check('表格里有“名称来源”列且写着 ECID', bodyText().includes('名称来源') && !!Array.from(doc.querySelectorAll('td')).find((td) => td.textContent.trim() === 'ECID'));
check('顶部含义条写出 S2F13/S2F14 的中文含义', bodyText().includes('设备常数'));
check('meta 里说明当前载入范围', /当前只载入了第|本次共/.test(bodyText()));

// 切到“消息含义”页
clickTab('消息含义');
await tick();
check('消息含义页列出 S16F21 = Process Job Get Space', bodyText().includes('S16F21') && bodyText().includes('Process Job Get Space'));
check('消息含义页有 Stream 说明', bodyText().includes('各 Stream'));

// 切到趋势图，选一个变量
clickTab('趋势图');
await tick();
const row = Array.from(doc.querySelectorAll('.seriesRow')).find((r) => r.textContent.includes('26557'));
check('趋势页候选列表里有 26557', !!row);
if (row) row.click();
await tick();
check('趋势统计表出现该变量的最小/最大/最新', bodyText().includes('26557') && bodyText().includes('241.69') && bodyText().includes('242.05'));
check('趋势提示写明点数', /全量\s*2\s*点/.test(bodyText()), bodyText().slice(0, 0));

/* --------------------------- 4) 真日志 + 真 SVID.cfg --------------------------- */
const REAL_LOG = 'C:\\Users\\17140\\Desktop\\sesloftool\\2026917_SW_LOG\\Fa\\Fa\\LogSecslog\\2026-09-17\\2026-09-17.txt';
const REAL_SVID = 'C:\\Users\\17140\\Desktop\\sesloftool\\SVID.cfg';
function clickTab(label) {
  const tab = Array.from(doc.querySelectorAll('.tabs button')).find((b) => b.textContent.includes(label));
  if (tab) tab.click();
  return !!tab;
}
async function tick(ms = 60) { await new Promise((r) => setTimeout(r, ms)); }
async function waitFor(fn, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

console.log('\n[4] 真日志端到端');
if (fs.existsSync(REAL_LOG) && fs.existsSync(REAL_SVID)) {
  const api = window.__secsTool;
  const { File: JFile } = window;
  api.clearLogFiles();
  api.addLogFiles([new JFile([fs.readFileSync(REAL_LOG, 'utf8')], '2026-09-17.txt')]);
  api.loadTableText('SVID.cfg', fs.readFileSync(REAL_SVID, 'utf8'));
  api.settings.reqCode = 'S1F3';
  api.settings.repCode = 'S1F4';
  api.settings.maxPairs = 30000;
  api.settings.keepRaw = false;
  await api.runParse();
  await tick(120);
  check('真日志解析出 25759 对 S1F3/S1F4', api.pairs.value.length === 25759, api.pairs.value.length);
  clickTab('明细');
  await tick(120);
  check('明细里名称来自 SVID 表（SCPQ15_Temp_PV）', bodyText().includes('SCPQ15_Temp_PV'));
  check('meta 写明 S1F3 走 SVID 表', bodyText().includes('S1F3') && bodyText().includes('SVID'));
  check('一次解析 2.5 万对后界面仍然完整（有明细表）', !!doc.querySelector('table'));
} else {
  console.log('  SKIP  找不到真日志或 SVID.cfg');
}

console.log('\n' + (failures ? '有 ' + failures + ' 项失败' : '全部通过 ✔'));
dom.window.close();
process.exit(failures ? 1 : 0);
