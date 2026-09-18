<script setup>
/* NameTablesCard.vue —— 第 2 步：名称表（ECID.cfg / SVID.cfg），以及“哪个消息码查哪张表” */
import { computed } from 'vue';
import DropZone from '../ui/DropZone.vue';
import {
  tableList, ui, settings, loadTableFile, removeTable, setTableRole, setMapping,
  resolverNow, codeHint, toast
} from '../../stores/app.js';

const ROLES = ['SVID', 'ECID', '其它'];

const hint = computed(() => codeHint());
const roleText = computed(() => {
  const roles = tableList.value.map((t) => t.role);
  if (!roles.length) return '默认分流：S1 流 → SVID 表，S2 流 → ECID 表（还没导入表）';
  if (tableList.value.length === 1) {
    return '默认分流：S1 流 → SVID 表，S2 流 → ECID 表；现在只导入了一张表（' + roles[0] + '），其它消息码也会用它';
  }
  return '默认分流：S1 流 → SVID 表，S2 流 → ECID 表';
});

function onFiles(files) {
  files.filter((f) => /\.(cfg|txt)$/i.test(f.name)).forEach((f) => loadTableFile(f));
  if (!files.length) toast('没有读到文件');
}
function onRoleChange(record, event) {
  setTableRole(record, event.target.value);
}
function onMappingChange(event) {
  const v = event.target.value;
  setMapping(settings.reqCode, v === 'auto' ? '' : v);
}
</script>

<template>
  <section class="card">
    <h3><span class="step">2</span>名称表（ECID.cfg / SVID.cfg，可多张）</h3>
    <DropZone accept=".cfg,.txt" @files="onFiles">
      把 <b>ECID.cfg / SVID.cfg</b> 拖到这里（可多选）
    </DropZone>
    <div class="hint" style="margin-top:8px">
      常用：<br>ECID → E:\S25159\CTC\Module_GEM\Cfg\ECID.cfg<br>SVID → C:\Users\17140\Desktop\sesloftool\SVID.cfg
    </div>

    <div v-if="!tableList.length" class="hint" style="margin-top:8px">未加载名称表（结果里只显示 ID）</div>
    <div v-else style="margin-top:8px">
      <div v-for="t in tableList" :key="t.name" class="row" style="margin-bottom:4px">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis">
          {{ t.name }} — {{ t.size }} 条
          <span v-if="t.dup.length" class="warnRow">重复 {{ t.dup.length }}</span>
          <span v-if="t.bad.length" class="warnRow">忽略 {{ t.bad.length }} 行</span>
        </span>
        <select :value="t.role" @change="onRoleChange(t, $event)">
          <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
        </select>
        <button class="ghost" title="移除" @click="removeTable(t)">✕</button>
      </div>
    </div>

    <div class="status" style="margin-top:8px">{{ roleText }}</div>
    <div class="row" style="margin-top:8px">
      <span class="hint">当前请求码 <b>{{ settings.reqCode }}</b> 用</span>
      <select style="min-width:160px" :value="ui.mapping[settings.reqCode] ?? 'auto'" @change="onMappingChange">
        <option value="auto">按规则自动（{{ resolverNow().roleFor(settings.reqCode) || '无' }}）</option>
        <option value="">不使用名称表</option>
        <option v-for="r in tableList.map((t) => t.role)" :key="r" :value="r">{{ r }}</option>
      </select>
    </div>
    <div class="status" style="margin-top:8px">
      <template v-if="!tableList.length">未加载（结果里只显示 ID）</template>
      <template v-else>
        <div v-for="t in tableList" :key="t.name">{{ t.name }}：{{ t.size }} 条（{{ t.role }}）</div>
      </template>
    </div>
    <div class="hint" style="margin-top:6px">
      这一对的键名会去 <b>{{ hint.tableText }}</b> 里查
    </div>
  </section>
</template>
