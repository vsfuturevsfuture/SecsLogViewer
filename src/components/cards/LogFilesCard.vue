<script setup>
/* LogFilesCard.vue —— 第 1 步：导入日志文件（可多选 / 可拖入整个日期文件夹） */
import DropZone from '../ui/DropZone.vue';
import { logFiles, addLogFiles, clearLogFiles, loadDemo, fmtSize, toast } from '../../stores/app.js';

function onFiles(files) {
  addLogFiles(files);
  if (!files.length) toast('没有读到文件（拖文件夹需要 Chrome / Edge）');
}
</script>

<template>
  <section class="card">
    <h3><span class="step">1</span>日志文件（可多选 / 可拖入文件夹）</h3>
    <DropZone accept=".txt,.log,.secs" show-dir @files="onFiles">
      把 <b>.txt / .log</b> 文件或整个日期文件夹拖到这里
      <template #extra>
        <button type="button" @click="loadDemo">载入示例数据</button>
      </template>
    </DropZone>
    <div class="hint" style="margin-top:8px">
      常用路径：C:\Users\17140\Desktop\sesloftool\2026917_SW_LOG\Fa\Fa\LogSecslog\<b>日期</b>\
    </div>
    <ul v-if="logFiles.length" class="files">
      <li v-for="f in logFiles" :key="f.name + f.size">
        <span>{{ f.name }}</span><span class="sz">{{ fmtSize(f.size) }}</span>
      </li>
    </ul>
    <div v-if="logFiles.length" class="row" style="margin-top:8px">
      <button class="ghost" @click="clearLogFiles">清空文件</button>
    </div>
  </section>
</template>
