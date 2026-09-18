<script setup>
/* FiltersCard.vue —— 第 5 步：筛选/排序，以及解析规则说明 */
import { ui } from '../../stores/app.js';
</script>

<template>
  <section class="card">
    <h3><span class="step">5</span>筛选 / 排序</h3>
    <input
      v-model="ui.filter"
      type="search"
      placeholder="ECID/SVID 或名称关键字，多个可用逗号分隔，如 26555,GPPosHom"
      style="width:100%"
    >
    <div class="row" style="margin-top:8px">
      <select v-model="ui.sortBy">
        <option value="log">原顺序（与日志一致）</option>
        <option value="id">ID 升序</option>
        <option value="idDesc">ID 降序</option>
        <option value="name">名称 A→Z</option>
      </select>
      <label class="chk"><input v-model="ui.onlyNamed" type="checkbox"> 只看有名称的</label>
    </div>
    <div class="row" style="margin-top:8px">
      <label class="chk"><input v-model="ui.onlyChanged" type="checkbox"> 横向对比时只看有变化的项</label>
    </div>
  </section>

  <section class="card">
    <details class="help">
      <summary>解析规则说明</summary>
      <ul>
        <li>消息头形如 <code>08:06:00.971 S2F13 [H-&gt;E, 9018402]</code>：时间 / 消息码 / 方向 / messageID。</li>
        <li>配对规则：请求后面<b>紧邻</b>的那条应答，且 messageID 相同，才算一对。</li>
        <li>键值规则：请求 <code>&lt;L[n]&gt;</code> 下第 i 项是键，应答同位置的项是值，顺序一一对应。</li>
        <li>名称表：<b>S1 流查 SVID.cfg</b>（状态变量），<b>S2 流查 ECID.cfg</b>（设备常数），可在第 2 栏手工改。</li>
        <li>日志行前面的 <code>2026-09-17 00:21:27.0088 [t:36][Debug]Secslog:</code> 前缀不影响解析。</li>
      </ul>
    </details>
  </section>
</template>
