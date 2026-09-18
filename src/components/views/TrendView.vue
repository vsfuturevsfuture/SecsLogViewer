<script setup>
/* TrendView.vue —— 趋势图：左边选变量，右边画折线
 *
 * 大数据量的处理都在 stores/trend.js 里：全量取点 + min/max 分桶降采样。
 * 这里只负责画：网格、坐标轴、折线、十字线、拖拽缩放。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  trend, filteredCandidates, visible, statsRows, legendItems, infoText,
  toggleCode, resetZoom, exportCsv, exportPng, SERIES_COLORS, MAX_SERIES
} from '../../stores/trend.js';
import * as core from '../../core/secs-core.js';

const canvas = ref(null);
const tip = ref(null);
const tipHtml = ref('');
const tipStyle = ref({ display: 'none', left: '0px', top: '0px' });
let geom = null;
let dragFrom = null;
const dragRect = ref(null);

const selected = computed(() => new Set(trend.codes));
const colorOf = (code) => SERIES_COLORS[Math.max(0, trend.codes.indexOf(code)) % SERIES_COLORS.length];

/* --------------------------------- 绘制 --------------------------------- */

function draw() {
  const cv = canvas.value;
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;                       // 环境不支持 canvas（例如 jsdom）时直接跳过绘制
  const W = cv.clientWidth || 900;
  const H = cv.clientHeight || 360;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.font = '12px "Segoe UI",Arial,sans-serif';

  const pad = { l: 66, r: 14, t: 12, b: 30 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const vis = visible.value;
  if (vis.empty) {
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(trend.codes.length ? '选中的变量在这份日志里没有可画的数值' : '← 左边点几个变量，这里就画折线', pad.l, H / 2);
    geom = null;
    return;
  }

  // Y 轴范围（归一化时固定 0~100%）
  let yMin = Infinity, yMax = -Infinity;
  for (const x of vis.list) {
    if (!x.pts.length) continue;
    if (trend.normalized) {
      let mn = x.s.min, mx = x.s.max;
      if (!isFinite(mn) || mn === mx) { mn = 0; mx = 1; }
      x.norm = { min: mn, max: mx };
      yMin = Math.min(yMin, 0); yMax = Math.max(yMax, 100);
    } else {
      for (const p of x.pts) { if (p[1] < yMin) yMin = p[1]; if (p[1] > yMax) yMax = p[1]; }
    }
  }
  const scale = core.niceScale(yMin, yMax, 5);

  // 网格 + Y 轴
  ctx.lineWidth = 1;
  for (const v of scale.ticks) {
    const y = pad.t + ph - ((v - scale.min) / (scale.max - scale.min)) * ph;
    ctx.strokeStyle = '#eef2f7';
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
    ctx.fillStyle = '#64748b';
    ctx.fillText(trend.normalized && (v === 0 || v === 100) ? v + '%' : core.fmtNum(v), 6, y + 4);
  }
  // X 轴刻度
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const x = pad.l + (pw * i) / steps;
    const label = core.fmtSeconds(vis.t0 + ((vis.t1 - vis.t0) * i) / steps);
    ctx.strokeStyle = '#f5f7fa';
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke();
    ctx.fillStyle = '#64748b';
    ctx.fillText(label, Math.min(x, pad.l + pw - ctx.measureText(label).width), pad.t + ph + 16);
  }
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + ph); ctx.lineTo(pad.l + pw, pad.t + ph);
  ctx.stroke();

  const X = (t) => pad.l + ((t - vis.t0) / (vis.t1 - vis.t0)) * pw;
  const Y = (v, x) => {
    const val = trend.normalized && x.norm ? ((v - x.norm.min) / (x.norm.max - x.norm.min)) * 100 : v;
    return pad.t + ph - ((val - scale.min) / (scale.max - scale.min)) * ph;
  };

  vis.list.forEach((x, idx) => {
    if (!x.pts.length) return;
    const pts = core.downsampleMinMax(x.pts, Math.max(200, Math.floor(pw * 2)));
    ctx.strokeStyle = SERIES_COLORS[idx % SERIES_COLORS.length];
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    pts.forEach((p, k) => {
      const px = X(p[0]), py = Y(p[1], x);
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });

  // 拖拽选择框
  if (dragRect.value) {
    const [a, b] = dragRect.value;
    ctx.fillStyle = 'rgba(37,99,235,.12)';
    ctx.fillRect(Math.min(a, b), pad.t, Math.abs(b - a), ph);
    ctx.strokeStyle = 'rgba(37,99,235,.5)';
    ctx.strokeRect(Math.min(a, b), pad.t, Math.abs(b - a), ph);
  }

  geom = { pad, pw, ph, t0: vis.t0, t1: vis.t1, scale, vis, X, Y };
}

/* -------------------------------- 鼠标交互 -------------------------------- */

function pointAt(event) {
  const cv = canvas.value;
  const rect = cv.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function onDown(event) {
  const { x } = pointAt(event);
  if (!geom || x < geom.pad.l || x > geom.pad.l + geom.pw) return;
  dragFrom = x;
}

function onMove(event) {
  const { x, y } = pointAt(event);
  if (dragFrom != null && Math.abs(x - dragFrom) > 6) {
    dragRect.value = [dragFrom, x];
    draw();
    return;
  }
  if (!geom) return;
  const { pad, pw, ph, t0, t1 } = geom;
  if (x < pad.l || x > pad.l + pw || y < pad.t || y > pad.t + ph) { tipStyle.value = { ...tipStyle.value, display: 'none' }; return; }
  const t = t0 + ((x - pad.l) / pw) * (t1 - t0);
  const lines = ['<b>' + core.fmtSeconds(t) + '</b>'];
  geom.vis.list.forEach((sx, idx) => {
    const pts = sx.pts;
    if (!pts.length) return;
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid][0] < t) lo = mid + 1; else hi = mid;
    }
    let best = pts[lo];
    if (lo > 0 && Math.abs(pts[lo - 1][0] - t) < Math.abs(best[0] - t)) best = pts[lo - 1];
    lines.push('<span style="color:' + SERIES_COLORS[idx % SERIES_COLORS.length] + '">■</span> ' +
      rowEsc(sx.s.code) + ' ' + rowEsc(sx.s.name || '') + ' = ' + core.fmtNum(best[1]));
  });
  tipHtml.value = lines.join('<br>');
  tipStyle.value = {
    display: 'block',
    left: Math.min(x + 12, (canvas.value.clientWidth || 900) - 150) + 'px',
    top: Math.max(4, y - 10) + 'px'
  };
}

function onUp(event) {
  if (dragFrom != null && geom) {
    const { x } = pointAt(event);
    if (Math.abs(x - dragFrom) > 8) {
      const a = Math.min(dragFrom, x), b = Math.max(dragFrom, x);
      const { pad, pw, t0, t1 } = geom;
      const ta = t0 + ((a - pad.l) / pw) * (t1 - t0);
      const tb = t0 + ((b - pad.l) / pw) * (t1 - t0);
      trend.view = [ta, tb];
    }
  }
  dragFrom = null;
  dragRect.value = null;
  draw();
}

function onLeave() {
  tipStyle.value = { ...tipStyle.value, display: 'none' };
  dragFrom = null;
  dragRect.value = null;
}

function rowEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* --------------------------------- 生命周期 --------------------------------- */

watch([visible, () => trend.normalized, () => trend.codes.length], () => nextTick(draw));

onMounted(() => {
  nextTick(draw);
  window.addEventListener('resize', draw);
});
onBeforeUnmount(() => window.removeEventListener('resize', draw));
</script>

<template>
  <div class="trend">
    <div class="trendLeft">
      <div class="hint">
        选出要画折线的变量（最多 {{ MAX_SERIES }} 条）。S1F3 的键就是 SVID，名称来自 SVID 表。
      </div>
      <input v-model="trend.search" type="search" placeholder="搜 SVID / 名称" style="width:100%;margin-top:6px">
      <div class="hint" style="margin-top:6px">
        共 {{ filteredCandidates.total }} 个变量，显示 {{ filteredCandidates.list.length }} 个
        <template v-if="filteredCandidates.total > 400">（输入关键字缩小范围）</template>
        <br>次数 = 该变量在载入的配对里出现了多少次（全天扫描，不是抽样）。
      </div>
      <div class="seriesList">
        <div
          v-for="c in filteredCandidates.list"
          :key="c.code"
          class="seriesRow"
          :class="{ on: selected.has(c.code) }"
          @click="toggleCode(c.code)"
        >
          <span class="dot" :style="{ background: selected.has(c.code) ? colorOf(c.code) : '#cbd5e1' }" />
          <span class="id">{{ c.code }}</span>
          <span class="nm" :title="c.name">{{ c.name || '（无名称）' }}</span>
          <span class="cnt">{{ c.count }}</span>
        </div>
      </div>
    </div>

    <div class="trendRight">
      <div class="row">
        <button @click="resetZoom">重置缩放</button>
        <label class="chk"><input v-model="trend.normalized" type="checkbox"> 各自归一化（量纲不同也能同图看趋势）</label>
        <button @click="exportCsv">导出数据 CSV</button>
        <button @click="exportPng(canvas)">导出图片 PNG</button>
      </div>
      <div class="trendWrap" style="margin-top:8px">
        <canvas
          ref="canvas"
          @mousedown="onDown"
          @mousemove="onMove"
          @mouseup="onUp"
          @mouseleave="onLeave"
          @dblclick="resetZoom"
        />
        <div class="trendTip" :style="tipStyle" v-html="tipHtml" />
      </div>
      <div class="hint" style="margin-top:8px">{{ infoText }}</div>
      <div class="legend">
        <span v-for="l in legendItems" :key="l.code">
          <i style="display:inline-block;width:12px;height:3px" :style="{ background: l.color }" />
          {{ l.code }} {{ l.name }}<template v-if="l.unit && l.unit !== '-'">（{{ l.unit }}）</template> 最新 <b>{{ l.last }}</b>
        </span>
      </div>
      <div class="tableWrap" style="max-height:240px;margin-top:8px">
        <table>
          <thead>
            <tr>
              <th>变量</th><th>名称</th><th>单位</th>
              <th class="num">样本数</th><th class="num">最小</th><th class="num">最大</th><th class="num">平均</th><th class="num">最新</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in statsRows" :key="s.code">
              <td class="id">{{ s.code }}</td>
              <td>{{ s.name || '—' }}</td>
              <td>{{ s.unit || '—' }}</td>
              <td class="num">{{ s.count }}</td>
              <td class="num">{{ s.min }}</td>
              <td class="num">{{ s.max }}</td>
              <td class="num">{{ s.avg }}</td>
              <td class="num">{{ s.last }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
