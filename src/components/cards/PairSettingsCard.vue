<script setup>
/* PairSettingsCard.vue —— 第 4 步：配对设置（消息码、范围、进度、已识别配对） */
import { computed } from 'vue';
import {
  settings, ui, codeHint, runParse, cancelParse, jumpToPair, toast
} from '../../stores/app.js';

const DEFAULT_CODES = [
  'S1F1', 'S1F3', 'S1F4', 'S1F13', 'S1F14', 'S2F13', 'S2F14', 'S2F15', 'S2F16',
  'S2F31', 'S2F32', 'S2F33', 'S2F34', 'S2F35', 'S2F36', 'S2F37', 'S2F38',
  'S5F1', 'S5F2', 'S5F3', 'S5F4', 'S6F11', 'S7F19', 'S7F20', 'S14F1', 'S14F2', 'S16F21', 'S16F22'
];

const codes = computed(() => {
  const set = new Set(DEFAULT_CODES);
  ui.detected.forEach((d) => { set.add(d.req); set.add(d.rep); });
  return Array.from(set).sort((a, b) => {
    const ma = /^S(\d+)F(\d+)$/.exec(a), mb = /^S(\d+)F(\d+)$/.exec(b);
    if (!ma || !mb) return a < b ? -1 : 1;
    return Number(ma[1]) - Number(mb[1]) || Number(ma[2]) - Number(mb[2]);
  });
});

const hint = computed(() => codeHint());
const isConvention = (req, rep) => {
  const a = /^S(\d+)F(\d+)$/.exec(req), b = /^S(\d+)F(\d+)$/.exec(rep);
  return !!a && !!b && a[1] === b[1] && Number(b[2]) === Number(a[2]) + 1;
};
const one = (info) => info.zh || (info.stream ? info.stream.zh : '（消息表里没有这条）');

function pickPair(d) {
  if (ui.busy) return;
  settings.reqCode = d.req; settings.repCode = d.rep;
  runParse();
}
async function onJump() {
  const n = Number(ui.jumpTo);
  if (!n) { toast('先填要看第几对'); return; }
  await jumpToPair(n);
}
function onParse() {
  if (settings.reqCode === settings.repCode) toast('提示：请求码与应答码相同，一般不是预期的配对');
  runParse();
}
</script>

<template>
  <section class="card">
    <h3><span class="step">4</span>配对设置</h3>
    <div class="status" style="margin-bottom:8px">
      <b>{{ settings.reqCode }}</b> {{ one(hint.a) }} → <b>{{ settings.repCode }}</b> {{ one(hint.b) }}
      <br><span class="st">键名去 <b>{{ hint.tableText }}</b> 里查</span>
    </div>

    <div class="row">
      <span class="hint">请求</span>
      <select v-model="settings.reqCode"><option v-for="c in codes" :key="c" :value="c">{{ c }}</option></select>
      <span class="hint">→ 应答</span>
      <select v-model="settings.repCode"><option v-for="c in codes" :key="c" :value="c">{{ c }}</option></select>
    </div>
    <div class="row" style="margin-top:8px">
      <label class="chk"><input v-model="settings.strictAdjacent" type="checkbox"> 只配“紧邻且 messageID 相同”的一对</label>
    </div>
    <div class="row" style="margin-top:8px">
      <label class="chk">
        从第 <input v-model.number="settings.startPair" type="number" min="1" step="1" style="width:76px"> 对开始，
        载入 <input v-model.number="settings.maxPairs" type="number" min="1" max="100000" step="100" style="width:88px"> 对
      </label>
    </div>
    <div class="row" style="margin-top:6px">
      <label class="chk"><input v-model="settings.keepRaw" type="checkbox"> 保留原文（关掉可省一半内存）</label>
    </div>
    <div class="hint" style="margin-top:6px">
      想看全部就把“载入”填大一点（例如 30000）；2.5 万对关掉“保留原文”实测约 135 MB。
    </div>

    <div class="row" style="margin-top:8px">
      <button class="primary" :disabled="ui.busy" @click="onParse">开始解析</button>
      <button :disabled="!ui.busy" @click="cancelParse">取消</button>
      <span class="hint">跳到第</span>
      <input v-model.number="ui.jumpTo" type="number" min="1" step="1" style="width:92px">
      <button @click="onJump">对</button>
    </div>
    <div class="bar"><i :style="{ width: ui.progressPct + '%' }" /></div>
    <div class="hint" style="margin-top:6px">{{ ui.progressText }}</div>

    <div class="hint" style="margin-top:9px">日志里识别到的相邻配对（点一下即可切换并重新解析）：</div>
    <div class="chips">
      <span v-if="!ui.detected.length" class="hint">（解析后显示）</span>
      <span
        v-for="d in ui.detected.slice(0, 40)"
        :key="d.req + d.rep"
        class="chip"
        :class="{ on: d.req === settings.reqCode && d.rep === settings.repCode }"
        :title="d.req + ' → ' + d.rep + '（' + d.count + ' 对）' + (isConvention(d.req, d.rep) ? '' : '，不符合 F+1 约定，仍可解析')"
        @click="pickPair(d)"
      >
        {{ d.req }}→{{ d.rep }}{{ isConvention(d.req, d.rep) ? '' : '?' }}<small>{{ d.count }}</small>
      </span>
    </div>
  </section>
</template>
