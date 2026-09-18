# SECS 日志解析工具（SecsLogViewer）

一个**单文件、离线**的工具（HTML 版 + 打包好的 exe 版）：把 SECS 日志里的“请求/应答”配成一对，再把请求 `<L[]>` 下的键和应答 `<L[]>` 下同位置的值对应起来。
默认就是 **S2F13 → S2F14**：请求里的 `<U4[1] 26555 >` 是 ECID，应答里第 i 个 `<F8[1] 1.6 >` 就是它的值；配上 ECID.cfg 后直接显示 `26555 = SDC8_GPPosHom = 1.6`。

## 两个版本

| | 文件 | 说明 |
| --- | --- | --- |
| HTML 版 | `index.html` | 直接双击，改完 HTML 立刻生效 |
| exe 版 | `SecsLogViewer.exe` | HTML 被嵌进 exe（`xxd -i` 转 C 头文件后编译），只发一个 exe 就行，运行时把页面写到 `%TEMP%\secs_log_viewer.html` 再调默认浏览器打开 |

和 `tools\` 下 `FanCfgTool.exe` 的做法完全一样（`launcher.cpp` + `fan_cfg_html.h` + `build.bat`），只是换成了本工具。
注意这只是**把页面藏进 exe**（打包/轻量混淆），不是真正的加密：任何人在运行时都能从 `%TEMP%` 或从 exe 里把 HTML 抠出来。

## 怎么用

1. 双击 `index.html`（Chrome / Edge 打开，不需要装任何东西，也不需要服务器）。
2. 把日志文件（`2026-09-17.txt`）或整个日期文件夹拖进左边第 1 栏；
   路径参考：`C:\Users\17140\Desktop\sesloftool\2026917_SW_LOG\Fa\Fa\LogSecslog\2026-09-17\`
3. （可选）把 `ECID.cfg` 拖进第 2 栏，路径参考：`E:\S25159\CTC\Module_GEM\Cfg\ECID.cfg`。
4. 第 3 栏选请求/应答码（默认 S2F13 / S2F14），点“开始解析”。
   要看第 N 对：直接在右上角“跳到第 N 对”填数字按回车/点“对”，不在当前范围它会自动从那一对重新解析；
   也可以在第 3 栏自己填“从第 N 对开始、载入 M 对”。想看全部就把 M 填大（如 30000）。
5. 右边看结果：
   - **明细（键 => 值）**：ECID / 名称 / 值 / 类型 / CFG 格式 / 单位 / IONAME，可按 ECID 或名称搜索高亮。
   - **横向对比**：每一对日志占一列，同一个 ECID 的多次取值横向排开，值变化会标黄（找漂移很直观）。
   - **原文**：当前这一对 S2F13 / S2F14 的原始文本。
   - 复制当前视图、导出 CSV（带 BOM，Excel 直接打开不乱码）/ JSON。

## 解析规则（与需求一致）

| 规则 | 说明 |
| --- | --- |
| 消息头 | `08:06:00.971 S2F13 [H->E, 9018402]`，行首可能带 `2026-09-17 08:06:01.3102 [t:36][Debug]Secslog:` 前缀，不影响解析 |
| 配对 | 请求后面**紧邻**的那一条应答，且 messageID 相同，才算一对；中间插了别的消息就不算（左侧可关掉这个严格判断） |
| 键值 | 请求 `<L[n]>` 下第 i 项是键，应答同位置的项是值，顺序一一对应；遇到嵌套 `<L[]>` 会自动下钻 |
| 名称 | 用 ECID 去 ECID.cfg 查 `EC | ID | FORMAT | NAME | UNITs | IONAME | IOTYPE`，查不到就只显示 ID |
| 上限 | 左侧默认“从第 1 对开始、载入 500 对”，防止 S1F3 这类几万对的日志吃内存；超出部分不影响统计，会提示“共 N 对，当前只载入了第 a–b 对”。想看别的区间用“跳到第 N 对” |
| 内存 | 实测 25759 对（S1F3/S1F4，关掉“保留原文”）约占 135 MB、0.9 秒；开着“保留原文”建议一次不超过 2000 对 |

## 本机日志实测（2026-09-17.txt，39 MB / 178 万行）

- 消息码统计：S1F3/S1F4 各 25764，S6F11 13008，S5F1 7934，**S2F13/S2F14 各 13**。
- 13 对 S2F13/S2F14 全部满足“紧邻 + messageID 相同”，每对请求/应答各 4456 项，键的顺序 13 次完全一致。
- 顺带发现：S1F3 有 5 条不是紧邻 S1F4（5 个未配对请求 + 5 个孤儿应答），工具会提示但不会误配。
- 轮转文件 `2026-09-17-00000.txt` 里没有 S2F13，只有 S2F13 时以 `2026-09-17.txt` 为准。

## 自测

```bat
cd tools\SecsLogViewer\dev
node test-core.mjs        :: 抽取 index.html 里的核心解析代码，跑真实日志 + ECID.cfg（含异常场景）
node test-ui.mjs          :: 用 DOM 桩把整页脚本跑起来，点“载入示例数据”验证界面
node test-exe.mjs         :: 校验 secs_log_html.h / SecsLogViewer.exe 里嵌的 HTML 和 index.html 逐字节一致
node analyze.mjs          :: 只是想看看某个日志的结构统计时用
```

`index.html` 里 `/* CORE BEGIN */ … /* CORE END */` 之间是纯解析逻辑，测试直接抽这段代码，所以测的就是真正发布的那份实现。

## 重新打包 exe（两步）

改完 `index.html` 后：

**第 1 步 —— 生成 C 头文件**（Git Bash，或直接双击 `make_header.bat`）

```bash
cd /e/s26042/tools/SecsLogViewer
xxd -i -n secs_log_html index.html > secs_log_html.h
```

`-n secs_log_html` 是为了让变量名固定成 `secs_log_html` / `secs_log_html_len`，和 `launcher.cpp` 里写死的名字对上（不用 `-n` 的话 xxd 会按文件名生成 `index_html`）。

**第 2 步 —— 编译**（VS Developer Command Prompt，或直接双击 `build.bat`）

```bat
cd /d E:\s26042\tools\SecsLogViewer
build.bat
```

等价于：

```bat
cl /nologo /O2 /MT launcher.cpp /Fo:build\ /link user32.lib shell32.lib /OUT:SecsLogViewer.exe
```

完事，`SecsLogViewer.exe` 就是新版（约 156 KB，里面嵌着那份 54 KB 的 HTML）。
