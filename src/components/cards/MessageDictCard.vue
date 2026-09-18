<script setup>
/* MessageDictCard.vue —— 第 3 步：SECS 消息含义表（内置 97 条，可导入自定义覆盖） */
import DropZone from '../ui/DropZone.vue';
import { loadSecsDictFile, secsDict, exportDictTemplate, clearSecsDict, toast } from '../../stores/app.js';
import { SECS_MESSAGES } from '../../core/secs-dict.js';

function onFiles(files) {
  const file = files.find((f) => /\.cfg$/i.test(f.name)) || files[0];
  if (file) loadSecsDictFile(file);
  else toast('没有读到文件');
}
</script>

<template>
  <section class="card">
    <h3><span class="step">3</span>SECS 消息表（含义说明）</h3>
    <div class="hint">内置常见 SECS/GEM 消息的中文含义；也可以在“消息含义”页导出模板、改完再导入覆盖。</div>
    <DropZone accept=".csv,.txt,.cfg" :multiple="false" pick-label="导入消息表…" @files="onFiles">
      也可以把消息表 CSV 拖到这里
    </DropZone>
    <div class="row" style="margin-top:8px">
      <button @click="exportDictTemplate">导出模板 (CSV)</button>
      <button v-if="secsDict" class="ghost" @click="clearSecsDict">恢复内置表</button>
    </div>
    <div class="status" :class="{ ok: !!secsDict }" style="margin-top:8px">
      <template v-if="!secsDict">使用内置消息表（{{ Object.keys(SECS_MESSAGES).length }} 条）</template>
      <template v-else>已导入 <b>{{ secsDict.name }}</b>：{{ secsDict.size }} 条（同名覆盖内置）</template>
    </div>
  </section>
</template>
