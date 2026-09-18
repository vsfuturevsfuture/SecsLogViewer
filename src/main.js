/* main.js —— 应用入口：挂载 Vue，并把动作暴露到 window（方便自动化测试与手动调试） */
import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import { exposeForTests } from './stores/app.js';

// 注意：打包成单文件后，内联脚本可能出现在 <div id="app"> 之前（快照式的 HTML 里就是这样），
// 所以必须等 DOM 就绪再挂载，否则 mount('#app') 找不到节点、界面会是空白。
function start() {
  createApp(App).mount('#app');
  // 浏览器控制台可用：__secsTool.runParse() / __secsTool.addLogFiles([file]) …
  exposeForTests(window);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
