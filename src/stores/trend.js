/* trend.js —— 趋势图的数据层（折线图本身在 components/views/TrendView.vue 里画）
 *
 * 数据量：S1F3 一天能到 2.5 万对，全画上去几万个点，所以这里负责两件事：
 *   1) 找出日志里出现过哪些变量（候选列表）；
 *   2) 按变量抽出时间序列，并在画之前做 min/max 降采样（尖峰不丢）。
 */
import { reactive, computed } from 'vue';
import * as core from '../core/secs-core.js';
import { toCSV } from '../core/exporters.js';
import {
  pairs, pairsVersion, tablesStamp, settings, ui,
  resolverNow, toast, downloadText, downloadImage
} from './app.js';

export const SERIES_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4d7c0f', '#b45309', '#0f172a'];
export const MAX_SERIES = 8;

export const trend = reactive({
  codes: [],
  search: '',
  normalized: false,
  view: null,        // [t0, t1] 缩放窗口
  hover: null
});

/** 候选变量：扫全部配对（实测 2.5 万对只要几百毫秒） */
export const candidates = computed(() => {
  const list = pairs.value;
  const resolver = resolverNow();
  const table = resolver.pick(settings.reqCode);
  const counts = new Map();
  for (let i = 0; i < list.length; i++) {
    const entries = core.flattenPairs(list[i].req.items || [], list[i].res.items || []);
    for (let j = 0; j < entries.length; j++) {
      const id = String(entries[j].key).trim();
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  const rows = [];
  counts.forEach((count, code) => {
    const info = table ? core.lookupName(table, code) : null;
    rows.push({ code, count, name: info ? info.name : '', unit: info ? info.unit : '', format: info ? info.format : '' });
  });
  rows.sort((a, b) => {
    const na = Number(a.code), nb = Number(b.code);
    if (isFinite(na) && isFinite(nb)) return na - nb;
    return a.code < b.code ? -1 : 1;
  });
  return rows;
});

export const filteredCandidates = computed(() => {
  const key = (trend.search || '').toLowerCase();
  const list = key
    ? candidates.value.filter((c) => (c.code + ' ' + c.name + ' ' + c.unit).toLowerCase().includes(key))
    : candidates.value;
  return { total: candidates.value.length, list: list.slice(0, 400) };
});

/** 选中变量的时间序列（按时间升序，只保留数值） */
export const series = computed(() => {
  void pairsVersion.value;
  void tablesStamp.value;
  if (!trend.codes.length) return [];
  return core.collectSeries(pairs.value, resolverNow(), trend.codes);
});

/** 当前缩放窗口内的点 */
export const visible = computed(() => {
  const list = series.value;
  let t0 = Infinity, t1 = -Infinity;
  for (const s of list) {
    if (!s.points.length) continue;
    t0 = Math.min(t0, s.points[0][0]);
    t1 = Math.max(t1, s.points[s.points.length - 1][0]);
  }
  if (!isFinite(t0)) return { t0: 0, t1: 1, list: [], empty: true };
  if (trend.view) { t0 = trend.view[0]; t1 = trend.view[1]; }
  if (t1 <= t0) t1 = t0 + 1;
  const out = list.map((s) => ({ s, pts: s.points.filter((p) => p[0] >= t0 && p[0] <= t1) }));
  return { t0, t1, list: out, empty: !out.some((x) => x.pts.length) };
});

export const statsRows = computed(() => series.value.map((s) => ({
  code: s.code, name: s.name, unit: s.unit, count: s.count,
  min: core.fmtNum(s.min), max: core.fmtNum(s.max), avg: core.fmtNum(s.avg), last: core.fmtNum(s.last)
})));

export const legendItems = computed(() => visible.value.list.map((x, idx) => ({
  code: x.s.code, name: x.s.name, unit: x.s.unit, last: core.fmtNum(x.s.last), color: SERIES_COLORS[idx % SERIES_COLORS.length]
})));

export const infoText = computed(() => {
  const vis = visible.value;
  if (!series.value.length) return '← 左边点几个变量，这里就画折线';
  if (vis.empty) return '选中的变量在这份日志里没有可画的数值';
  const drawn = vis.list.reduce((a, x) => a + x.pts.length, 0);
  const total = vis.list.reduce((a, x) => a + x.s.points.length, 0);
  return core.fmtSeconds(vis.t0) + ' ~ ' + core.fmtSeconds(vis.t1) + ' ｜ 画布内 ' + drawn + ' 点 / 全量 ' + total + ' 点' +
    (total > drawn ? '（超出画布宽度会做 min/max 降采样，尖峰仍保留）' : '');
});

export function toggleCode(code) {
  const idx = trend.codes.indexOf(code);
  if (idx >= 0) trend.codes.splice(idx, 1);
  else {
    if (trend.codes.length >= MAX_SERIES) { toast('最多同时画 ' + MAX_SERIES + ' 条线'); return; }
    trend.codes.push(code);
  }
  trend.view = null;
}

export function resetZoom() {
  trend.view = null;
}

export function reset() {
  trend.codes = [];
  trend.view = null;
  trend.search = '';
}

export function exportCsv() {
  if (!series.value.length) { toast('先选几个变量'); return; }
  const head = ['时间', '时间戳(秒)', '变量', '名称', '单位', '值'];
  const body = [];
  for (const s of series.value) {
    for (const p of s.points) body.push([core.fmtSeconds(p[0]), p[0], s.code, s.name, s.unit, p[1]]);
  }
  downloadText(toCSV(head, body), 'SECS_' + settings.reqCode + '_趋势数据.csv');
  toast('已导出 ' + body.length + ' 行趋势数据');
}

export function exportPng(canvas) {
  if (!canvas || !canvas.toDataURL) { toast('当前环境不支持导出图片'); return; }
  downloadImage(canvas.toDataURL('image/png'), 'SECS_' + settings.reqCode + '_趋势图.png');
  toast('已导出 PNG');
}

export { ui as uiState };
