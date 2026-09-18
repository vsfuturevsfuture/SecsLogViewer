<script setup>
/* MessageDictView.vue —— 消息含义页：SxFy 是干啥的 + Stream（S1、S2…）分别管什么 */
import { computed } from 'vue';
import { ui, dictRows, highlight, filterTerms, escapeHtml } from '../../stores/app.js';
import { SECS_STREAMS, SECS_MESSAGES } from '../../core/secs-dict.js';

const terms = computed(() => filterTerms());
const rows = computed(() => dictRows());

const streams = computed(() => {
  const used = new Set();
  ui.detected.forEach((d) => { used.add(streamKey(d.req)); used.add(streamKey(d.rep)); });
  return Object.keys(SECS_STREAMS)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    .map((key) => ({ key, ...SECS_STREAMS[key], inLog: used.has(key) }));
});
function streamKey(code) {
  const m = /^S(\d+)F\d+$/.exec(String(code || ''));
  return m ? 'S' + m[1] : null;
}
const builtinCount = Object.keys(SECS_MESSAGES).length;
</script>

<template>
  <div class="meta" style="display:block">
    <span class="hint">
      S 开头是<b>流(Stream)</b>，代表一大类功能；具体消息是 <b>SxFy</b>（如 S16F21）。
      “日志里出现”有数字的是你这份日志里出现过的消息，其余是消息表里的其它常见消息，方便随时查含义。
    </span>
  </div>

  <div class="tableWrap" style="max-height:none">
    <table style="width:auto;min-width:100%">
      <tbody>
        <tr>
          <td style="white-space:normal;max-width:100%">
            <details>
              <summary style="cursor:pointer;font-weight:600">各 Stream（S1、S2……）分别管什么</summary>
              <div class="hint" style="margin-top:6px;line-height:1.9">
                <div v-for="s in streams" :key="s.key">
                  <span class="tag" :class="{ user: s.inLog }">{{ s.key }}</span> {{ s.zh }}{{ s.inLog ? '（日志里有）' : '' }}
                </div>
              </div>
            </details>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="tableWrap">
    <table>
      <thead>
        <tr>
          <th>消息</th>
          <th>中文含义（要干啥）</th>
          <th>官方名称</th>
          <th>标准方向</th>
          <th>消息体</th>
          <th class="num">日志里出现</th>
          <th>日志中观察到的方向</th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.code">
          <td class="id" v-html="highlight(r.code, terms)" />
          <td style="white-space:normal;max-width:520px">
            <span v-if="r.info.zh" v-html="highlight(r.info.zh, terms)" />
            <span v-else class="noname">（消息表里还没有这条，可自己导入补充）</span>
          </td>
          <td class="mono" v-html="r.info.en ? highlight(r.info.en, terms) : '—'" />
          <td>{{ r.info.dir || '—' }}</td>
          <td style="white-space:normal">{{ r.info.body || '—' }}</td>
          <td class="num">{{ r.count == null ? '—' : r.count }}</td>
          <td class="mono">{{ r.dirSeen || '—' }}</td>
          <td>
            <span v-if="r.info.from === 'user'" class="tag user">自定义</span>
            <span v-else-if="!r.info.known" class="tag miss">未收录</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="empty" style="padding:12px;text-align:left">
    表里没有的消息可以自己补：点左侧“导出模板 (CSV)”，按
    <code>消息码,英文名,中文说明,方向,消息体说明</code> 改好再“导入消息表”（内置 {{ builtinCount }} 条）。
  </div>
</template>
