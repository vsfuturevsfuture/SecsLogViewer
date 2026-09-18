<script setup>
/* DetailTable.vue —— 明细：请求的键 => 应答的值，并带上名称/单位/格式 */
import { computed } from 'vue';
import { ui, visibleRows, highlight, filterTerms, isNumLike } from '../../stores/app.js';

const terms = computed(() => filterTerms());
const shown = computed(() => visibleRows.value.slice(0, ui.renderLimit));
</script>

<template>
  <div class="tableWrap">
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>ID</th>
          <th>名称</th>
          <th>名称来源</th>
          <th>值（应答）</th>
          <th>应答类型</th>
          <th>CFG 格式</th>
          <th>单位</th>
          <th>IONAME</th>
          <th>IO 类型</th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in shown" :key="r.no + '-' + r.id">
          <td class="num">{{ i + 1 }}</td>
          <td class="id" v-html="highlight(r.id, terms)" />
          <td :class="{ noname: !r.name }" :title="r.ioName" v-html="r.name ? highlight(r.name, terms) : '—'" />
          <td class="mono" :title="r.tableName">{{ r.tableRole || '—' }}</td>
          <td class="val" :class="{ num: isNumLike(r.value) }">{{ r.value }}</td>
          <td class="mono">{{ r.valTag || '—' }}</td>
          <td class="mono">{{ r.format || '—' }}</td>
          <td>{{ r.unit || '—' }}</td>
          <td class="mono" :title="r.ioName">{{ r.ioName || '—' }}</td>
          <td>{{ r.ioType || '—' }}</td>
          <td class="warnRow">{{ r.issue || '' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-if="visibleRows.length > shown.length" class="empty" style="padding:14px">
    已显示前 {{ shown.length }} 行，共 {{ visibleRows.length }} 行
    <button @click="ui.renderLimit += 3000">再显示 3000 行</button>
  </div>
</template>
