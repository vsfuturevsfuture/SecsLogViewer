<script setup>
/* PivotTable.vue —— 横向对比：行 = 变量，列 = 每一次配对，值变化标黄 */
import { computed } from 'vue';
import { ui, pairs, pivotData, highlight, filterTerms, matchesFilter } from '../../stores/app.js';

const MAX_COLUMNS = 25;

const terms = computed(() => filterTerms());
const pv = computed(() => pivotData(MAX_COLUMNS));

const rows = computed(() => pv.value.rows.filter((r) => {
  if (ui.onlyNamed && !r.name) return false;
  if (!matchesFilter({ id: r.id, name: r.name, ioName: '', unit: r.unit }, terms.value)) return false;
  if (ui.onlyChanged) {
    const seen = new Set();
    for (const v of r.values) {
      if (v == null) continue;
      if (seen.size && !seen.has(v)) return true;
      seen.add(v);
    }
    return false;
  }
  return true;
}));
const shown = computed(() => rows.value.slice(0, ui.renderLimit));
const firstOf = (r) => r.values.find((v) => v != null);
</script>

<template>
  <div class="tableWrap">
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>ID</th>
          <th>名称</th>
          <th v-for="pp in pv.columns" :key="pp.msgId + pp.time" class="num" :title="'msgID ' + pp.msgId + ' ' + (pp.file || '')">
            {{ (pp.date ? pp.date.slice(5) + ' ' : '') + pp.time }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in shown" :key="r.id">
          <td class="num">{{ i + 1 }}</td>
          <td class="id" v-html="highlight(r.id, terms)" />
          <td :class="{ noname: !r.name }" v-html="r.name ? highlight(r.name, terms) : '—'" />
          <td
            v-for="(v, j) in r.values"
            :key="j"
            class="num val"
            :class="{ var: v != null && firstOf(r) != null && v !== firstOf(r) }"
          >{{ v == null ? '—' : v }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-if="pairs.length > MAX_COLUMNS" class="empty" style="padding:12px">
    共 {{ pairs.length }} 对，这里只并列显示前 {{ MAX_COLUMNS }} 对（导出也同样）
  </div>
  <div v-if="rows.length > shown.length" class="empty" style="padding:12px">
    已显示前 {{ shown.length }} 行，共 {{ rows.length }} 行
    <button @click="ui.renderLimit += 3000">再显示 3000 行</button>
  </div>
</template>
