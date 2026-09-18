// 验证“HTML -> C 头文件 -> exe”这条链路：
//  1) secs_log_html.h 里的字节和 index.html 完全一致
//  2) SecsLogViewer.exe 里确实嵌着整份 HTML（首尾都能在 exe 里找到）
//  3) 用 /DSECSLOG_SELFTEST 编译出来的 exe 跑一遍，落盘的 html 和 index.html 逐字节相同
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(here, '..');
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS  ' + name);
  else { failures++; console.log('  FAIL  ' + name + (extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); }
}

const htmlBytes = fs.readFileSync(path.join(root, 'index.html'));

/* ---------- 1) 头文件 ---------- */
console.log('\n[1] secs_log_html.h');
const headerPath = path.join(root, 'secs_log_html.h');
check('头文件存在', fs.existsSync(headerPath));
const headerSrc = fs.readFileSync(headerPath, 'utf8');
check('变量名是 secs_log_html（和 launcher.cpp 一致）', headerSrc.includes('unsigned char secs_log_html[] = {'), headerSrc.slice(0, 40));
check('长度变量是 secs_log_html_len', /unsigned int secs_log_html_len = \d+;/.test(headerSrc));
const lenDeclared = Number(/unsigned int secs_log_html_len = (\d+);/.exec(headerSrc)[1]);
check('声明的长度 = index.html 的字节数', lenDeclared === htmlBytes.length, { declared: lenDeclared, actual: htmlBytes.length });
const body = headerSrc.slice(headerSrc.indexOf('{') + 1, headerSrc.lastIndexOf('}'));
const nums = body.split(',').map((s) => s.trim()).filter(Boolean).map((s) => parseInt(s, 16));
const headerBytes = Buffer.from(nums);
check('数组元素个数 = 长度', nums.length === htmlBytes.length, { nums: nums.length, html: htmlBytes.length });
check('头文件字节和 index.html 逐字节相同', headerBytes.equals(htmlBytes),
  headerBytes.equals(htmlBytes) ? '' : { firstDiff: [...headerBytes.keys()].find((i) => headerBytes[i] !== htmlBytes[i]) });

/* ---------- 2) exe 里嵌着整份 HTML ---------- */
console.log('\n[2] SecsLogViewer.exe');
const exePath = path.join(root, 'SecsLogViewer.exe');
check('exe 存在', fs.existsSync(exePath));
const exeBytes = fs.readFileSync(exePath);
const head32 = htmlBytes.subarray(0, 32);
const tail32 = htmlBytes.subarray(htmlBytes.length - 32);
check('exe 里能找到 HTML 开头 32 字节', exeBytes.indexOf(head32) >= 0);
check('exe 里能找到 HTML 结尾 32 字节', exeBytes.indexOf(tail32) >= 0);
check('exe 里能找到整份 HTML（连续 ' + htmlBytes.length + ' 字节）', exeBytes.indexOf(htmlBytes) >= 0);
check('exe 里没有残留的绝对路径/源码名', !exeBytes.includes(Buffer.from('E:\\s26042\\tools\\SecsLogViewer\\index.html')));

/* ---------- 3) 自测 exe：真的把 html 写出来了吗 ---------- */
console.log('\n[3] 自测 exe（/DSECSLOG_SELFTEST，不会打开浏览器）');
const selftest = path.join(root, 'build', 'selftest.exe');
console.log('  （用 dev\\selftest.bat 现编译并运行一个自测 exe，不会打开浏览器）');
let built = false;
try {
  execFileSync('cmd.exe', ['/c', path.join(here, 'selftest.bat')], { stdio: 'pipe' });
  built = true;
} catch (e) {
  console.log('      编译/运行失败：' + String(e.stdout || e.message).trim().split('\n').slice(-3).join(' | '));
}
if (built && fs.existsSync(selftest)) {
  const out = path.join(process.env.TEMP || os.tmpdir(), 'secs_log_viewer.html');
  const written = fs.existsSync(out) ? fs.readFileSync(out) : null;
  check('运行时写出了 %TEMP%\\secs_log_viewer.html', !!written, out);
  check('写出的内容和 index.html 逐字节相同', !!written && written.equals(htmlBytes),
    written ? { written: written.length, html: htmlBytes.length } : '');
} else {
  console.log('  SKIP  编译不出 build\\selftest.exe（没装 VS 或路径不同，可用环境变量 VS_VCVARS 指定 vcvars64.bat）');
}

console.log('\n' + (failures ? '有 ' + failures + ' 项失败' : '全部通过 ✔'));
process.exit(failures ? 1 : 0);
