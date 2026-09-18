<script setup>
/* DropZone.vue —— 通用拖放区：把文件/文件夹拖进来，或点按钮选择 */
import { ref } from 'vue';
import { filesFromDataTransfer, filesFromInputEvent } from '../../core/drop-files.js';

const props = defineProps({
  accept: { type: String, default: '' },      // 例如 '.txt,.log'
  multiple: { type: Boolean, default: true },
  directory: { type: Boolean, default: false }, // 是否提供“选择文件夹”
  pickLabel: { type: String, default: '选择文件…' },
  dirLabel: { type: String, default: '选择文件夹…' },
  showDir: { type: Boolean, default: false }
});
const emit = defineEmits(['files']);

const over = ref(false);
const fileInput = ref(null);
const dirInput = ref(null);

async function onDrop(e) {
  over.value = false;
  const files = await filesFromDataTransfer(e.dataTransfer);
  if (files.length) emit('files', files);
}
function onPick(e) {
  const files = filesFromInputEvent(e);
  if (files.length) emit('files', files);
}
</script>

<template>
  <div
    class="drop"
    :class="{ over }"
    @dragenter.prevent="over = true"
    @dragover.prevent="over = true"
    @dragleave.prevent="over = false"
    @drop.prevent="onDrop"
  >
    <slot />
    <div class="row" style="justify-content:center;margin-top:8px">
      <button type="button" @click="fileInput.click()">{{ pickLabel }}</button>
      <button v-if="showDir" type="button" @click="dirInput.click()">{{ dirLabel }}</button>
      <slot name="extra" />
    </div>
    <input ref="fileInput" type="file" :accept="accept" :multiple="multiple" hidden @change="onPick">
    <input v-if="showDir" ref="dirInput" type="file" webkitdirectory multiple hidden @change="onPick">
  </div>
</template>
