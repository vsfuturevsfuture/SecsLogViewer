<script setup>
/* App.vue —— 布局：左边一列设置卡片，右边结果区（标签页 + 工具条 + 内容） */
import { computed } from 'vue';
import LogFilesCard from './components/cards/LogFilesCard.vue';
import NameTablesCard from './components/cards/NameTablesCard.vue';
import MessageDictCard from './components/cards/MessageDictCard.vue';
import PairSettingsCard from './components/cards/PairSettingsCard.vue';
import FiltersCard from './components/cards/FiltersCard.vue';
import DetailTable from './components/views/DetailTable.vue';
import PivotTable from './components/views/PivotTable.vue';
import RawView from './components/views/RawView.vue';
import MessageDictView from './components/views/MessageDictView.vue';
import TrendView from './components/views/TrendView.vue';
import {
  ui, settings, pairs, currentPair, pairMeaning, tableList,
  copyCurrentView, exportCsv, exportJson, loadDemo
} from './stores/app.js';

const TABS = [
  { id: 'detail', label: '明细（键 => 值）' },
  { id: 'pivot', label: '横向对比（多对并列）' },
  { id: 'raw', label: '原文' },
  { id: 'dict', label: '消息含义（SxFy 是干啥的）' },
  { id: 'trend', label: '趋势图（折线）' }
];

const hasPairs = computed(() => pairs.value.length > 0);
const pairOptions = computed(() => pairs.value.map((p, i) => ({
  index: i,
  label: '#' + (p.globalOrdinal + 1) + ' · ' + (p.date ? p.date + ' ' : '') + p.time +
    ' · msgID ' + p.msgId + ' · ' + p.reqItems + ' 项' + (p.file ? ' · ' + p.file : '')
})));
const meaning = computed(() => pairMeaning());
const one = (info) => (info.zh || (info.stream ? info.stream.zh : '消息表里没有这条，可导入自己的消息表'));
const tagOf = (info) => (info.from === 'user' ? '自定义' : (!info.known ? '未收录' : ''));

const warningTip = computed(() => ui.warnings.slice(0, 20).map((w) => w.msg).join('\n'));
const windowText = computed(() => (ui.windowFrom || 1) + '–' + (ui.windowTo || 1));
const truncated = computed(() => (ui.totalPairs || pairs.value.length) > pairs.value.length);
</script>

<template>
  <header>
    <h1>SECS 日志解析工具</h1>
    <span class="sub">
      按 messageID 配对请求 / 应答；<b>S1 流查 SVID</b>、<b>S2 流查 ECID</b>，把 <code>&lt;L[]</code> 下的键值逐项对应
    </span>
  </header>

  <div class="app">
    <aside>
      <LogFilesCard />
      <NameTablesCard />
      <MessageDictCard />
      <PairSettingsCard />
      <FiltersCard />
    </aside>

    <main>
      <div class="tabs">
        <button
          v-for="t in TABS"
          :key="t.id"
          :class="{ on: ui.tab === t.id }"
          @click="ui.tab = t.id"
        >{{ t.label }}</button>
      </div>

      <div class="toolbar">
        <span class="hint">配对：</span>
        <select v-model.number="ui.pairIndex" class="grow" :disabled="!hasPairs">
          <option v-for="o in pairOptions" :key="o.index" :value="o.index">{{ o.label }}</option>
        </select>
        <span class="sep" />
        <button :disabled="!hasPairs" @click="copyCurrentView">复制当前视图</button>
        <button :disabled="!hasPairs" @click="exportCsv">导出 CSV</button>
        <button :disabled="!hasPairs || ui.tab === 'dict' || ui.tab === 'trend'" @click="exportJson">导出 JSON</button>
      </div>

      <div class="meaning">
        <template v-if="hasPairs && meaning.length === 2">
          <b>{{ meaning[0].code }}</b> {{ one(meaning[0]) }}
          <span class="st">({{ meaning[0].en }})</span>
          <span v-if="tagOf(meaning[0])" class="tag" :class="{ user: meaning[0].from === 'user', miss: !meaning[0].known }">{{ tagOf(meaning[0]) }}</span>
          &nbsp;→&nbsp;
          <b>{{ meaning[1].code }}</b> {{ one(meaning[1]) }}
          <span class="st">({{ meaning[1].en }})</span>
          <span v-if="tagOf(meaning[1])" class="tag" :class="{ user: meaning[1].from === 'user', miss: !meaning[1].known }">{{ tagOf(meaning[1]) }}</span>
        </template>
        <span v-else class="st">导入并解析日志后，这里会显示当前这一对消息的含义。</span>
      </div>

      <div class="meta">
        <template v-if="hasPairs && currentPair">
          <span>请求 <b>{{ currentPair.req.code }}</b> {{ (currentPair.date ? currentPair.date + ' ' : '') + currentPair.req.time }}（{{ currentPair.req.dir }}）</span>
          <span>应答 <b>{{ currentPair.res.code }}</b> {{ currentPair.res.time }}（{{ currentPair.res.dir }}）</span>
          <span>messageID <b>{{ currentPair.msgId }}</b></span>
          <span>请求项 <b>{{ currentPair.reqItems }}</b> / 应答项 <b>{{ currentPair.resItems }}</b></span>
          <span v-if="truncated" class="warnRow" title="在左侧改“从第 N 对开始 / 载入 M 对”，或用“跳到第 N 对”">
            共 <b>{{ ui.totalPairs }}</b> 对，当前只载入了第 <b>{{ windowText }}</b> 对
          </span>
          <span v-else>本次共 <b>{{ pairs.length }}</b> 对</span>
          <span>
            名称表：<template v-if="tableList.length">
              <span v-for="t in tableList" :key="t.name"><b>{{ t.role }}</b> {{ t.name }}（{{ t.size }} 条） </span>
            </template>
            <b v-else class="warnRow">未加载</b>
          </span>
          <span v-if="ui.warnings.length" class="warnRow" :title="warningTip">
            异常记录 {{ ui.warnings.length }} 条
            <template v-if="ui.unmatchedReqs">（未配对请求 {{ ui.unmatchedReqs }}）</template>
            <template v-if="ui.orphanReplies">（孤儿应答 {{ ui.orphanReplies }}）</template>
          </span>
          <span v-else style="color:var(--ok)">配对全部正常</span>
        </template>
        <span v-else class="hint">导入日志后点击“开始解析”。</span>
      </div>

      <div v-if="!hasPairs">
        <div class="empty">
          <h2>还没有解析结果</h2>
          ① 拖入日志文件 → ②（可选）拖入 ECID.cfg / SVID.cfg → ③ 选请求/应答码 → ④ 点“开始解析”
          <div style="margin-top:12px"><button @click="loadDemo">载入示例数据先看看</button></div>
        </div>
      </div>
      <template v-else>
        <DetailTable v-if="ui.tab === 'detail'" />
        <PivotTable v-else-if="ui.tab === 'pivot'" />
        <RawView v-else-if="ui.tab === 'raw'" />
        <MessageDictView v-else-if="ui.tab === 'dict'" />
        <TrendView v-else />
      </template>
    </main>
  </div>

  <div class="toast" :class="{ on: !!ui.toast }">{{ ui.toast }}</div>
</template>
