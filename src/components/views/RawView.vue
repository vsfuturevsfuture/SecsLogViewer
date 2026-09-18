<script setup>
/* RawView.vue —— 当前这一对的原始文本（没勾“保留原文”时给提示） */
import { computed } from 'vue';
import { currentPair, rawText } from '../../stores/app.js';

const text = computed(() => rawText(currentPair.value));
</script>

<template>
  <div v-if="currentPair">
    <template v-if="currentPair.rawKept === false">
      <div class="empty">
        <h2>这一轮没有保留原文</h2>
        左侧“配对设置”里的“保留原文”被关掉了（省内存）。<br>勾上它再点“开始解析”，就能看这一对的原始文本。
      </div>
    </template>
    <template v-else>
      <div class="rawHead">
        {{ currentPair.req.code }} 请求原文（{{ currentPair.req.dir }}，messageID {{ currentPair.msgId }}）
      </div>
      <pre class="raw">{{ text.req }}</pre>
      <div class="rawHead">
        {{ currentPair.res.code }} 应答原文（{{ currentPair.res.dir }}，messageID {{ currentPair.msgId }}）
      </div>
      <pre class="raw">{{ text.res }}</pre>
    </template>
  </div>
</template>
