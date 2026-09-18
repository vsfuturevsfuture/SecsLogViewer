// 用极简 DOM 桩把 index.html 里的整段 <script> 真跑一遍：
// 加载 -> 点“载入示例数据” -> 等待异步解析 -> 检查渲染出来的表格。
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS  ' + name);
  else { failures++; console.log('  FAIL  ' + name + (extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); }
}

const here = path.dirname(url.fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
check('HTML 里能找到 <script> 段', script.length > 2000, script.length);

/* ---------- 极简 DOM 桩 ---------- */
const els = new Map();
function makeEl(id) {
  const el = {
    id, innerHTML: '', textContent: '', value: '', checked: true, disabled: false, hidden: false,
    dataset: {}, style: {}, options: { length: 0 }, children: [], files: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    firstElementChild: { style: {} },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, remove() {}, click() {}, focus() {}, select() {},
    setAttribute() {}, getAttribute() { return null; }
  };
  return el;
}
const document = {
  body: makeEl('body'),
  getElementById(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
  createElement(tag) { return makeEl('<' + tag + '>'); },
  execCommand() { return true; }
};
function el(id) { return document.getElementById(id); }
const window = {};
const navigator = { clipboard: { writeText: async () => {} } };

const api = new Function('document', 'window', 'navigator', 'console',
  script + '\nreturn window.__secsTool;'
)(document, window, navigator, console);

/* ---------- 1) 初始渲染 ---------- */
console.log('\n[1] 初始状态');
check('调试入口已挂到 window 上', !!(api && api.state));
check('初始渲染的是“还没有解析结果”引导页', el('view').innerHTML.includes('还没有解析结果'), el('view').innerHTML.slice(0, 80));
check('初始进度文案写在 HTML 里（“待解析”）', /id="progressTxt"[^>]*>待解析/.test(html));
check('请求码默认 S2F13', el('reqCode').value === 'S2F13', el('reqCode').value);
check('应答码默认 S2F14', el('repCode').value === 'S2F14', el('repCode').value);

/* ---------- 2) 点“载入示例数据”（走完整流程） ---------- */
console.log('\n[2] 点击“载入示例数据”');
check('示例按钮绑了 onclick', typeof el('demoBtn').onclick === 'function');
el('demoBtn').onclick();
const t0 = Date.now();
while (api.state.busy && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 30));
await new Promise((r) => setTimeout(r, 60));  // 等 loadEcidFile 的 Promise 落定
api.render();

check('示例日志被当成日志文件加入', api.state.logFiles.length === 1, api.state.logFiles.map((f) => f.name));
check('示例 ECID.cfg 被解析', api.state.ecid && api.state.ecid.size === 6, api.state.ecid && api.state.ecid.size);
check('解析出 2 对（第 3 个请求被 S1F13 插队，按规则不算一对）', api.state.pairs.length === 2, api.state.pairs.length);
check('抓到 1 个未配对请求 + 1 个孤儿应答', api.state.unmatchedReqs === 1 && api.state.orphanReplies === 1,
  { unmatched: api.state.unmatchedReqs, orphan: api.state.orphanReplies });
check('进度条提示完成并说明载入范围', /完成：共配到 2 对，已载入第 1–2 对/.test(el('progressTxt').textContent), el('progressTxt').textContent);

const view = el('view').innerHTML;
check('明细表里有 26555 与值 1.6', /<td class="id">26555<\/td>/.test(view) && view.includes('1.6'), view.slice(0, 200));
check('明细表把 26555 翻成 SDC8_GPPosHom', view.includes('SDC8_GPPosHom'));
check('明细表把 26557 翻成 SDC8_GPPosorigin 且值 241.69', view.includes('SDC8_GPPosorigin') && view.includes('241.69'));
check('表头包含“值（应答）”列', view.includes('值（应答）'));
const rowCount = (view.match(/<tr>/g) || []).length - 1;  // 减去表头行
check('示例一对 6 项 => 6 行', rowCount === 6, rowCount);
check('meta 区显示 messageID', el('meta').innerHTML.includes('9018402'), el('meta').innerHTML);

/* ---------- 3) 筛选 / 排序 / 横向对比 / 原文 / 切换配对 ---------- */
console.log('\n[3] 交互');
el('filter').value = 'GPPosorigin';
api.render();
const filtered = (el('view').innerHTML.match(/<tr>/g) || []).length - 1;
check('按名称搜索后只剩 1 行', filtered === 1, filtered);
check('搜索结果有高亮标记', el('view').innerHTML.includes('<mark'));
el('filter').value = '';
el('sortBy').value = 'idDesc';
api.render();
const firstId = /<td class="id">(\d+)<\/td>/.exec(el('view').innerHTML);
check('按 ECID 降序时首行是最大值 61303', firstId && firstId[1] === '61303', firstId && firstId[1]);
el('sortBy').value = 'log';

api.state.tab = 'pivot';
api.render();
const pivot = el('view').innerHTML;
check('横向对比出现 2 个时间列', pivot.includes('08:06:00.971') && pivot.includes('12:12:33.298'), pivot.slice(0, 160));
check('横向对比标出变化值（26557：241.69 / 242.05）', pivot.includes('241.69') && pivot.includes('242.05') && pivot.includes('var'),
  pivot.includes('class="num var val"'));

api.state.tab = 'raw';
api.render();
const raw = el('view').innerHTML;
check('原文页含请求头与正文', raw.includes('S2F13') && raw.includes('&lt;U4[1] 26555'), raw.slice(0, 160));

api.state.tab = 'detail';
api.state.pairIndex = 1;
api.render();
check('切到第 2 对后 messageID 变成 9019404', el('meta').innerHTML.includes('9019404'), el('meta').innerHTML);
check('第 2 对的 26557 值 = 242.05', el('view').innerHTML.includes('242.05'));

/* ---------- 3.5) 跳到第 N 对 ---------- */
console.log('\n[3.5] 跳到第 N 对');
check('配对下拉里用的是全局对号', el('pairSel').innerHTML.includes('#1 ·') && el('pairSel').innerHTML.includes('#2 ·'), el('pairSel').innerHTML.slice(0, 120));
el('jumpTo').value = '1';
await el('jumpBtn').onclick();
check('跳到第 1 对', api.state.pairIndex === 0 && el('meta').innerHTML.includes('9018402'), api.state.pairIndex);
el('jumpTo').value = '2';
await el('jumpBtn').onclick();
check('跳到第 2 对', api.state.pairIndex === 1 && el('meta').innerHTML.includes('9019404'), api.state.pairIndex);
check('meta 里说明了当前载入范围', /当前只载入了第 <b>1–2<\/b> 对|本次共 <b>2<\/b> 对/.test(el('meta').innerHTML), el('meta').innerHTML);
api.state.tab = 'detail';
api.state.pairIndex = 0;
api.render();

/* ---------- 4) 导出内容 ---------- */
console.log('\n[4] 导出');
const csv = api.buildRows(api.state.pairs[0], api.state.ecid);
check('buildRows 可直接用于导出', csv.length === 6 && csv[0].id === '26555' && csv[0].name === 'SDC8_GPPosHom', csv[0]);

/* ---------- 5) 消息含义 ---------- */
console.log('\n[5] 消息含义');
api.state.tab = 'detail';
api.state.pairIndex = 0;
api.render();
check('明细页顶部说明了这一对的含义', /设备常数/.test(el('pairMeaning').innerHTML) && /读取|返回/.test(el('pairMeaning').innerHTML), el('pairMeaning').innerHTML);
check('含义里带了官方英文名', /Equipment Constant Request/.test(el('pairMeaning').innerHTML));
check('配对设置卡片里有实时含义提示', /S2F13/.test(el('codeHint').innerHTML) && /设备常数/.test(el('codeHint').innerHTML), el('codeHint').innerHTML);
check('内置消息表条数显示在左侧', /使用内置消息表（\d+ 条）/.test(el('dictStatus').textContent), el('dictStatus').textContent);

api.state.tab = 'dict';
api.render();
const dictHtml = el('view').innerHTML;
check('消息含义页列出日志里出现的消息', dictHtml.includes('S2F13') && dictHtml.includes('S1F1') && dictHtml.includes('S2F14'));
check('消息含义页给出中文说明与官方名称', dictHtml.includes('读取设备常数') && dictHtml.includes('Equipment Constant Request'));
check('消息含义页标出日志里出现次数', /日志里出现/.test(dictHtml) && /<td class="num">3<\/td>/.test(dictHtml), /<td class="num">\d+<\/td>/.exec(dictHtml));
check('消息含义页有 Stream 说明（S1/S2…）', dictHtml.includes('各 Stream') && /S16/.test(dictHtml) && dictHtml.includes('工艺作业管理'));
check('消息含义页给出日志中观察到的方向', dictHtml.includes('H-&gt;E') || dictHtml.includes('H->E'));
el('filter').value = 'S16F21';
api.render();
check('没出现在日志里的消息也能查到（S16F21）',
  el('view').innerHTML.includes('S16F21') && el('view').innerHTML.includes('Process Job Get Space') && el('view').innerHTML.includes('还有多少空间'),
  el('view').innerHTML.length);
el('filter').value = '报警';
api.render();
check('按中文搜索“报警”能筛出 S5F1', el('view').innerHTML.includes('S5F1') && el('view').innerHTML.includes('Alarm Report Send'), el('view').innerHTML.length);
el('filter').value = '';

// 自定义消息表覆盖内置说明
await new Promise((r) => { api.loadSecsDictFile(new File(['S2F13,Equipment Constant Request,我们厂自己的说法,H->E,仅报头'], 'my.csv')); setTimeout(r, 40); });
api.state.tab = 'detail'; api.state.pairIndex = 0; api.render();
check('导入自定义消息表后覆盖内置说明', /我们厂自己的说法/.test(el('pairMeaning').innerHTML) && /自定义/.test(el('pairMeaning').innerHTML), el('pairMeaning').innerHTML);
check('自定义表的条数显示在左侧', /已导入/.test(el('dictStatus').innerHTML), el('dictStatus').innerHTML);
api.state.tab = 'dict'; api.render();
check('消息含义页也显示自定义来源', /自定义/.test(el('view').innerHTML));
api.state.tab = 'detail'; api.render();

console.log('\n' + (failures ? '有 ' + failures + ' 项失败' : '全部通过 ✔'));
process.exit(failures ? 1 : 0);
