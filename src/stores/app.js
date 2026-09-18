/* app.js —— 全局状态与动作（不依赖 Pinia：一个 reactive 对象 + 几个 shallowRef）
 *
 * 为什么这么分：
 *   · ui / settings      —— 小数据，用 reactive，模板直接绑；
 *   · pairs / codeStats  —— 重数据（S1F3 能到 2.5 万对 × 74 项），放 shallowRef，
 *                           绝不能让 Vue 深层 Proxy 上去，否则滚动和画图都会变慢；
 *   · 名称表/消息表        —— Map 查找在热循环里，用 markRaw / 普通对象，按整对象替换来触发更新。
 */
import { reactive, shallowRef, ref, computed, markRaw } from 'vue';
import * as core from '../core/secs-core.js';
import * as dictLib from '../core/secs-dict.js';
import { streamFileLines, readFileText } from '../core/file-reader.js';
import { download, downloadDataUrl, toCSV, toTSV, copyText } from '../core/exporters.js';
import { DEMO_LOG, DEMO_ECID, DEMO_SVID, DEMO_S1F3_LOG } from '../core/demo-data.js';

/* ---------------------------------- 状态 ---------------------------------- */

export const settings = reactive({
  reqCode: 'S2F13',
  repCode: 'S2F14',
  strictAdjacent: true,
  startPair: 1,
  maxPairs: 500,
  keepRaw: true
});

export const ui = reactive({
  tab: 'detail',
  filter: '',
  sortBy: 'log',
  onlyNamed: false,
  onlyChanged: false,
  pairIndex: 0,
  renderLimit: 4000,
  jumpTo: '',
  progressPct: 0,
  progressText: '待解析',
  busy: false,
  cancel: false,
  toast: '',
  detected: [],           // [{ req, rep, count }]
  warnings: [],
  unmatchedReqs: 0,
  orphanReplies: 0,
  totalPairs: 0,
  windowFrom: 1,
  windowTo: 1,
  mapping: {}             // { 请求消息码: 'SVID' | 'ECID' | '' }
});

export const logFiles = ref([]);          // [{ name, size, file }]
export const tableList = ref([]);         // [{ name, role, size, dup, bad, map, type }]
export const secsDict = shallowRef(null); // { name, size, map }
export const pairs = shallowRef([]);      // 重数据
export const pairsVersion = ref(0);
export const codeStats = shallowRef(new Map());
export const tablesStamp = ref(0);        // 名称表/映射变化时 +1，用来失效缓存

const rowsCache = new Map();              // key: `${pairIndex}|${tablesStamp}`
let pivotCache = null;
let toastTimer = null;

/* ---------------------------------- 工具 ---------------------------------- */

export function toast(msg, ms = 2400) {
  ui.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = ''; }, ms);
}

export function basename(p) {
  return String(p || '').split(/[\\/]/).pop();
}

export function fmtSize(n) {
  if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n > 1024) return (n / 1024).toFixed(0) + ' KB';
  return n + ' B';
}

export function isNumLike(v) {
  return v != null && v !== '' && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(String(v).trim());
}

export function filterTerms() {
  return (ui.filter || '').split(/[\s,，;；]+/).map((s) => s.trim()).filter(Boolean);
}

/** 名称表解析器：S1 流 → SVID，S2 流 → ECID，可在界面上逐个消息码覆盖 */
export function resolverNow() {
  const tables = {};
  for (const t of tableList.value) tables[t.role] = t;
  const roles = Object.keys(tables);
  const fallback = roles.length === 1 ? roles[0] : null;
  return core.nameResolver(tables, ui.mapping, fallback);
}

export function tableFor(code) {
  const role = resolverNow().roleFor(code);
  return role ? (tableList.value.find((t) => t.role === role) || null) : null;
}

export function invalidate() {
  rowsCache.clear();
  pivotCache = null;
  tablesStamp.value++;
}

/* -------------------------------- 文件导入 -------------------------------- */

export function addLogFiles(files) {
  let added = 0, dictAdded = false;
  for (const file of files) {
    if (/\.cfg$/i.test(file.name)) { loadDictOrTable(file); dictAdded = true; continue; }
    if (!/\.(txt|log|secs)$/i.test(file.name)) continue;
    if (logFiles.value.some((f) => f.name === file.name && f.size === file.size)) continue;
    logFiles.value = logFiles.value.concat([{ name: basename(file.webkitRelativePath || file.name), size: file.size, file }]);
    added++;
  }
  logFiles.value = logFiles.value.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (added || dictAdded) toast('已添加 ' + added + ' 个日志文件' + (dictAdded ? '（.cfg 按名称表/消息表处理）' : ''));
}

// 拖进来的 .cfg 可能是 ECID.cfg / SVID.cfg，也可能是自定义消息表；按列格式自动分流
function loadDictOrTable(file) {
  readFileText(file).then((txt) => {
    const parsed = core.parseNameTable(txt);
    const looksLikeTable = parsed.size > 0 && parsed.bad.length < parsed.size;
    if (looksLikeTable) loadTableText(file.name, txt);
    else loadDictText(file.name, txt);
  });
}

export function clearLogFiles() {
  logFiles.value = [];
  pairs.value = [];
  codeStats.value = new Map();
  ui.detected = [];
  ui.warnings = [];
  pairsVersion.value++;
  invalidate();
}

/* ------------------------------- 名称表 ------------------------------- */

export function loadTableFile(file) {
  return readFileText(file).then((txt) => loadTableText(file.name, txt));
}

export function loadTableText(name, text) {
  const parsed = core.parseNameTable(text);
  const role = core.guessTableRole(name, parsed) || '其它';
  const record = markRaw(Object.assign(parsed, { name, role }));
  // 同一个角色再导入一次 = 替换
  tableList.value = tableList.value.filter((t) => t.role !== role).concat([record]);
  invalidate();
  return record;
}

export function removeTable(record) {
  tableList.value = tableList.value.filter((t) => t !== record);
  invalidate();
}

export function setTableRole(record, role) {
  record.role = role;
  tableList.value = tableList.value.slice();
  invalidate();
}

export function setMapping(code, role) {
  if (role === '') delete ui.mapping[code];
  else ui.mapping[code] = role;
  invalidate();
}

/* ------------------------------ 消息含义表 ------------------------------ */

export function loadSecsDictFile(file) {
  return readFileText(file).then((txt) => loadDictText(file.name, txt));
}

export function loadDictText(name, text) {
  const parsed = dictLib.parseSecsDict(text);
  if (!parsed.size) {
    toast(name + ' 里没有识别到消息行（形如 S16F21,Process Job Get Space,说明）', 4000);
    return null;
  }
  secsDict.value = markRaw(Object.assign(parsed, { name }));
  toast('已导入消息表 ' + name + '：' + parsed.size + ' 条');
  return parsed;
}

export function clearSecsDict() {
  secsDict.value = null;
}

export function exportDictTemplate() {
  download(dictLib.secsDictCsv(secsDict.value ? secsDict.value.map : null), 'SECS消息表.csv');
  toast('已导出消息表模板');
}

export function dictInfo(code) {
  return dictLib.secsInfo(code, secsDict.value ? secsDict.value.map : null);
}

/* -------------------------------- 解析主流程 -------------------------------- */

export async function runParse() {
  if (!logFiles.value.length) { toast('请先导入日志文件'); return; }
  if (ui.busy) return;
  ui.busy = true;
  ui.cancel = false;
  ui.pairIndex = 0;
  ui.renderLimit = 4000;

  const maxPairs = Math.max(1, Math.min(100000, Number(settings.maxPairs) || 500));
  const skipPairs = Math.max(0, Math.floor(Number(settings.startPair) || 1) - 1);
  const keepRaw = settings.keepRaw;
  if (keepRaw && maxPairs > 2000) toast('提示：载入 ' + maxPairs + ' 对还保留原文比较占内存，建议关掉“保留原文”', 4000);

  const collected = [];
  const stat = { total: 0, unmatched: 0, orphan: 0 };
  const detected = new Map();
  const stats = new Map();
  const warnings = [];
  const totalBytes = logFiles.value.reduce((a, f) => a + f.size, 0);
  let doneBytes = 0, fileBase = 0;
  const t0 = performance.now();

  try {
    for (const entry of logFiles.value) {
      const fileSkip = Math.max(0, skipPairs - fileBase);
      const fileMax = Math.max(0, maxPairs - collected.length);
      const collector = core.createCollector({
        reqCode: settings.reqCode, repCode: settings.repCode,
        strictAdjacent: settings.strictAdjacent, maxPairs: fileMax, skipPairs: fileSkip, keepRaw
      });
      const detector = core.createPairDetector();
      ui.progressText = '解析中… ' + entry.name;
      await streamFileLines(entry.file, {
        onLine: (line) => { collector.feed(line); detector.feed(line); },
        shouldCancel: () => ui.cancel,
        onBytes: (bytes) => {
          const pct = Math.min(100, ((doneBytes + bytes) / (totalBytes || 1)) * 100);
          ui.progressPct = pct;
          ui.progressText = '解析中… ' + entry.name + '  ' + pct.toFixed(0) + '%';
        }
      });
      collector.finish();
      detector.finish();
      collector.pairs.forEach((p, i) => {
        p.file = entry.name;
        p.globalOrdinal = fileBase + p.ordinal;
        collected.push(p);
      });
      collector.warnings.forEach((w) => warnings.push(Object.assign({ file: entry.name }, w)));
      stat.total += collector.stat.pairs;
      stat.unmatched += collector.stat.unmatchedReq;
      stat.orphan += collector.stat.orphanReply;
      detector.counts.forEach((v, k) => detected.set(k, (detected.get(k) || 0) + v));
      detector.codeStats.forEach((v, k) => {
        const cur = stats.get(k) || { count: 0, dirs: new Map() };
        cur.count += v.count;
        v.dirs.forEach((n, d) => cur.dirs.set(d, (cur.dirs.get(d) || 0) + n));
        stats.set(k, cur);
      });
      fileBase += collector.stat.pairs;
      doneBytes += entry.size;
      if (ui.cancel) break;
    }

    pairs.value = collected;
    pairsVersion.value++;
    codeStats.value = stats;
    ui.detected = Array.from(detected.entries())
      .map(([key, count]) => ({ req: key.split('->')[0], rep: key.split('->')[1], count }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);
    ui.warnings = warnings;
    ui.unmatchedReqs = stat.unmatched;
    ui.orphanReplies = stat.orphan;
    ui.totalPairs = stat.total;
    ui.pairIndex = 0;
    ui.windowFrom = collected.length ? collected[0].globalOrdinal + 1 : skipPairs + 1;
    ui.windowTo = collected.length ? collected[collected.length - 1].globalOrdinal + 1 : skipPairs + 1;
    invalidate();

    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    ui.progressPct = 100;
    ui.progressText = (ui.cancel ? '已取消，保留已解析结果：' : '完成：') +
      '共配到 ' + stat.total + ' 对' +
      (collected.length ? '，已载入第 ' + ui.windowFrom + '–' + ui.windowTo + ' 对' + (skipPairs ? '（跳过前 ' + skipPairs + ' 对）' : '')
                        : '，这个范围内没有配对') +
      '，用时 ' + secs + ' 秒';
    if (!collected.length) toast('没有找到 ' + settings.reqCode + ' → ' + settings.repCode + ' 的配对，可试试左侧“已识别配对”');
  } catch (err) {
    console.error(err);
    ui.progressPct = 0;
    ui.progressText = '解析出错：' + (err && err.message ? err.message : err);
    toast('解析出错，详情见控制台（F12）');
  } finally {
    ui.busy = false;
  }
}

export function cancelParse() {
  ui.cancel = true;
}

export async function jumpToPair(n) {
  n = Math.max(1, Math.floor(Number(n) || 1));
  if (ui.busy) { toast('正在解析，请稍候'); return; }
  const idx = pairs.value.findIndex((p) => p.globalOrdinal + 1 === n);
  if (idx >= 0) {
    ui.pairIndex = idx;
    toast('已跳到第 ' + n + ' 对');
    return;
  }
  settings.startPair = n;
  toast('第 ' + n + ' 对不在当前范围内，正在从第 ' + n + ' 对重新解析…', 4000);
  await runParse();
  const idx2 = pairs.value.findIndex((p) => p.globalOrdinal + 1 === n);
  if (idx2 >= 0) ui.pairIndex = idx2;
}

export function loadDemo() {
  clearLogFiles();
  addLogFiles([new File([DEMO_LOG], '示例日志-S2F13.txt'), new File([DEMO_S1F3_LOG], '示例日志-S1F3.txt')]);
  loadTableText('示例-ECID.cfg', DEMO_ECID);
  loadTableText('示例-SVID.cfg', DEMO_SVID);
  settings.reqCode = 'S2F13';
  settings.repCode = 'S2F14';
  settings.startPair = 1;
  return runParse();
}

/* -------------------------------- 结果读取 -------------------------------- */

export function rowsOf(pairIndex) {
  const key = pairIndex + '|' + tablesStamp.value;
  if (!rowsCache.has(key)) {
    const pair = pairs.value[pairIndex];
    rowsCache.set(key, pair ? core.buildRows(pair, resolverNow()) : []);
  }
  return rowsCache.get(key);
}

export function matchesFilter(row, terms) {
  if (!terms.length) return true;
  const hay = (row.id + ' ' + row.name + ' ' + row.ioName + ' ' + row.unit).toLowerCase();
  return terms.some((t) => hay.includes(t.toLowerCase()));
}

export const currentPair = computed(() => pairs.value[ui.pairIndex] || null);

export const visibleRows = computed(() => {
  const terms = filterTerms();
  const onlyNamed = ui.onlyNamed;
  let rows = rowsOf(ui.pairIndex).filter((r) => (!onlyNamed || r.name) && matchesFilter(r, terms));
  if (ui.sortBy === 'id') rows = rows.slice().sort((a, b) => numCompare(a.id, b.id));
  else if (ui.sortBy === 'idDesc') rows = rows.slice().sort((a, b) => numCompare(b.id, a.id));
  else if (ui.sortBy === 'name') rows = rows.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return rows;
});

function numCompare(a, b) {
  const na = Number(a), nb = Number(b);
  if (isFinite(na) && isFinite(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function pivotData(maxColumns = 25) {
  const list = pairs.value.slice(0, maxColumns);
  const key = list.length + '|' + tablesStamp.value + '|' + pairsVersion.value;
  if (!pivotCache || pivotCache.key !== key) {
    pivotCache = { key, data: core.buildPivot(list, resolverNow()) };
  }
  return pivotCache.data;
}

export function pairMeaning() {
  const p = currentPair.value;
  if (!p) return [];
  return [dictInfo(p.req.code), dictInfo(p.res.code)];
}

export function codeHint() {
  const a = dictInfo(settings.reqCode);
  const b = dictInfo(settings.repCode);
  const table = tableFor(settings.reqCode);
  const role = resolverNow().roleFor(settings.reqCode);
  return {
    a, b,
    tableText: table ? role + ' 表（' + table.name + '）' : (role ? role + ' 表（未导入）' : '没有配名称表')
  };
}

/* --------------------------------- 导出 --------------------------------- */

export function exportName(p) {
  return 'SECS_' + p.req.code + '_' + (p.date || '') + '_' + String(p.time).replace(/[:.]/g, '') + '_msg' + p.msgId;
}

export function currentExport() {
  const p = currentPair.value;
  if (!p) return null;
  const terms = filterTerms();
  if (ui.tab === 'dict') {
    const rows = dictRows();
    return {
      head: ['消息', '中文含义', '官方名称', '标准方向', '消息体', '日志里出现次数', '日志中观察到的方向', '来源'],
      body: rows.map((r) => [r.code, r.info.zh, r.info.en, r.info.dir, r.info.body, r.count == null ? '' : r.count, r.dirSeen,
        r.info.from === 'user' ? '自定义' : (r.info.known ? '内置' : '未收录')]),
      name: 'SECS消息含义表'
    };
  }
  if (ui.tab === 'raw') {
    const t = rawText(p);
    return { head: ['说明', '内容'], body: [[p.req.code + ' #' + p.msgId, t.req], [p.res.code + ' #' + p.msgId, t.res]], name: exportName(p), raw: t.req + '\n' + t.res };
  }
  if (ui.tab === 'pivot') {
    const pv = pivotData();
    return {
      head: ['ECID', '名称', '单位'].concat(pv.columns.map((pp) => (pp.date ? pp.date + ' ' : '') + pp.time)),
      body: pv.rows.map((r) => [r.id, r.name, r.unit].concat(r.values.map((v) => (v == null ? '' : v)))),
      name: 'SECS_' + settings.reqCode + '_对比'
    };
  }
  const rows = visibleRows.value;
  return {
    head: ['序号', 'ID', '名称', '名称来源', '值', '应答类型', 'CFG格式', '单位', 'IONAME', 'IO类型', '备注'],
    body: rows.map((r, i) => [i + 1, r.id, r.name, r.tableRole, r.value, r.valTag, r.format, r.unit, r.ioName, r.ioType, r.issue]),
    name: exportName(p)
  };
}

export function copyCurrentView() {
  const ex = currentExport();
  if (!ex) return;
  copyText(ui.tab === 'raw' ? ex.raw : toTSV(ex.head, ex.body)).then((ok) => toast(ok ? '已复制到剪贴板' : '复制失败，请手动选择'));
}

export function exportCsv() {
  const ex = currentExport();
  if (!ex) return;
  download(toCSV(ex.head, ex.body), ex.name + '.csv');
  toast('已导出 ' + ex.body.length + ' 行 CSV');
}

export function exportJson() {
  const p = currentPair.value;
  if (!p) return;
  const data = {
    request: { code: p.req.code, time: p.req.time, date: p.date, dir: p.req.dir, msgId: p.msgId },
    reply: { code: p.res.code, time: p.res.time, dir: p.res.dir, msgId: p.msgId },
    items: core.buildRows(p, resolverNow()).map((r) => ({
      index: r.no, ecid: r.id, name: r.name, value: r.value, type: r.valTag,
      format: r.format, unit: r.unit, ioName: r.ioName, ioType: r.ioType, issue: r.issue
    }))
  };
  download(JSON.stringify(data, null, 2), exportName(p) + '.json', 'application/json');
  toast('已导出 JSON');
}

export function downloadText(text, filename, mime) {
  download(text, filename, mime);
}

export function downloadImage(dataUrl, filename) {
  downloadDataUrl(dataUrl, filename);
}

/* ------------------------------ 消息含义页数据 ------------------------------ */

export function dictRows() {
  const terms = filterTerms();
  const stats = codeStats.value;
  const rows = [];
  const seen = new Set();
  stats.forEach((v, code) => {
    seen.add(code);
    const dirs = [];
    v.dirs.forEach((n, d) => dirs.push(d + '×' + n));
    rows.push({ code, info: dictInfo(code), count: v.count, dirSeen: dirs.join(' / '), inLog: true });
  });
  const all = new Set(Object.keys(dictLib.SECS_MESSAGES));
  if (secsDict.value) Object.keys(secsDict.value.map).forEach((c) => all.add(c));
  all.forEach((code) => {
    if (!seen.has(code)) rows.push({ code, info: dictInfo(code), count: null, dirSeen: '', inLog: false });
  });
  rows.sort((a, b) => {
    if (a.inLog !== b.inLog) return a.inLog ? -1 : 1;
    if (a.inLog && b.inLog && a.count !== b.count) return b.count - a.count;
    const ma = /^S(\d+)F(\d+)$/.exec(a.code), mb = /^S(\d+)F(\d+)$/.exec(b.code);
    return Number(ma[1]) - Number(mb[1]) || Number(ma[2]) - Number(mb[2]);
  });
  if (!terms.length) return rows;
  return rows.filter((r) => {
    const hay = (r.code + ' ' + r.info.en + ' ' + r.info.zh + ' ' + (r.info.stream ? r.info.stream.zh : '')).toLowerCase();
    return terms.some((t) => hay.includes(t.toLowerCase()));
  });
}

export function highlight(text, terms) {
  let out = escapeHtml(text);
  if (!terms || !terms.length || !out) return out;
  for (const t of terms) {
    if (!t) continue;
    const re = new RegExp(escapeRegExp(escapeHtml(t)), 'gi');
    out = out.replace(re, (m) => '<mark style="background:#fde68a;color:inherit;border-radius:2px">' + m + '</mark>');
  }
  return out;
}

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 当前这一对的原文（没保留原文时返回空串） */
export function rawText(p) {
  if (!p || p.rawKept === false) return { req: '', res: '' };
  return {
    req: [String(p.req.header)].concat(p.req.raw || []).join('\n'),
    res: [String(p.res.header)].concat(p.res.raw || []).join('\n')
  };
}

// 供测试与非 Vue 环境使用：把动作挂到 window（和旧版一致）
export function exposeForTests(target) {
  if (!target) return;
  target.__secsTool = {
    state: ui, settings, logFiles, tableList, secsDict, pairs, codeStats,
    addLogFiles, clearLogFiles, loadTableFile, loadTableText, removeTable, setTableRole, setMapping,
    loadSecsDictFile, loadDictText, exportDictTemplate,
    runParse, cancelParse, jumpToPair, loadDemo,
    rowsOf, dictRows, pivotData, currentExport, copyCurrentView, exportCsv, exportJson,
    resolverNow, tableFor, codeHint, pairMeaning, toast, invalidate
  };
}
