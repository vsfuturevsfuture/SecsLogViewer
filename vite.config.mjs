import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 目标：构建出一个「单文件 HTML」（JS/CSS 全部内联），这样 launcher.cpp 仍然只要
//   xxd -i -n secs_log_html dist/index.html > secs_log_html.h
// 就能把整个界面塞进 exe。
//
// 另外刻意不用 ES module 产物：exe 是把这个 HTML 写到 %TEMP% 后用 file:// 打开的，
// file:// 下 <script type="module"> 会被浏览器按 CORS 拦掉，所以这里打成 IIFE（普通脚本）。
// 产物已经是自包含的 IIFE，这里把 <script type="module"> 改成普通 <script>：
// file:// 下模块脚本会被 CORS 拦，普通脚本不会。
function stripModuleAttribute() {
  return {
    name: 'strip-module-attribute',
    closeBundle() {
      const file = path.resolve('dist/index.html');
      if (!fs.existsSync(file)) return;
      const html = fs.readFileSync(file, 'utf8');
      const patched = html.replace(/<script type="module"([^>]*)>/g, '<script>');
      if (patched !== html) fs.writeFileSync(file, patched);
    }
  };
}

export default defineConfig({
  plugins: [vue(), viteSingleFile(), stripModuleAttribute()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2019',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]'
      }
    }
  }
});
