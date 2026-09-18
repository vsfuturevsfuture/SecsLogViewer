// 直接 import src/core 里的两个模块（构建产物用的就是它们），跑真实日志 + 真实配置做断言。
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import * as coreModule from '../src/core/secs-core.js';
import * as dictModule from '../src/core/secs-dict.js';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const api = Object.assign({}, coreModule, dictModule);

const LOG = 'C:\\Users\\17140\\Desktop\\sesloftool\\2026917_SW_LOG\\Fa\\Fa\\LogSecslog\\2026-09-17\\2026-09-17.txt';
const CFG_S25159 = 'E:\\S25159\\CTC\\Module_GEM\\Cfg\\ECID.cfg';
const CFG_WS = 'E:\\s26042\\CTC\\Module_GEM\\Cfg\\ECID.cfg';
const CFG_SVID = 'C:\\Users\\17140\\Desktop\\sesloftool\\SVID.cfg';

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS  ' + name);
  else { failures++; console.log('  FAIL  ' + name + (extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); }
}

/* ---------- 1) 单元级别的小样例 ---------- */
console.log('\n[1] 语法细节 / 边界情况');
const h1 = api.parseHeader('2026-09-17 00:21:27.0088 [t:36][Debug]Secslog:00:21:26.150 S2F13 [H->E, 8993478]');
check('带日志前缀的消息头 -> 取到内层时间', h1 && h1.time === '00:21:26.150', h1);
check('带日志前缀 -> 取到日期', h1 && h1.date === '2026-09-17', h1);
check('方向/messageID', h1 && h1.dir === 'H->E' && h1.msgId === '8993478', h1);
const h2 = api.parseHeader('08:06:00.971 S2F13 [H->E, 9018402]');
check('纯净消息头', h2 && h2.time === '08:06:00.971' && h2.code === 'S2F13' && h2.msgId === '9018402', h2);
check('普通文本不是消息头', api.parseHeader('      <U4[1] 26555  >') === null);
check('E->H_NotConnect 方向可解析', (api.parseHeader('00:00:01.000 S2F14 [E->H_NotConnect, 123]') || {}).dir === 'E->H_NotConnect');
check('F+1 约定判断', api.isReplyConvention('S2F13', 'S2F14') && !api.isReplyConvention('S2F13', 'S2F15'));

const body = [
  '   <L[3] ',
  '      <U4[1] 26555  >',
  '      <U4[0]  >',
  '      <L[2] ',
  '         <U4[1] 7  >',
  '         <A[6] ver1.0 >',
  '      >',
  '   >',
];
const items = api.parseBody(body);
check('顶层只有一个 L', items.length === 1 && items[0].tag === 'L', items.length);
check('L 里 3 个子项', items[0].children.length === 3, items[0].children.map((c) => c.tag));
check('空项 U4[0] 值为空串', items[0].children[1].value === '', items[0].children[1]);
check('嵌套 L 解析成功', items[0].children[2].children.length === 2);
check('A 项保留文本', api.nodeText(items[0].children[2].children[1]) === 'ver1.0');
check('<header only> 不产生项', api.parseBody(['<header only>']).length === 0);
const flat = api.flattenPairs(items[0].children, items[0].children);
check('扁平化会下钻嵌套列表', flat.length === 4 && flat[2].value === '7', flat.map((f) => f.value));

/* ---------- 2) ECID.cfg ---------- */
console.log('\n[2] ECID.cfg 解析');
const cfgS = api.parseEcidCfg(fs.readFileSync(CFG_S25159, 'utf8'));
const cfgW = api.parseEcidCfg(fs.readFileSync(CFG_WS, 'utf8'));
check('S25159 ECID 条数 = 6058', cfgS.size === 6058, cfgS.size);
check('S25159 无重复 ID', cfgS.dup.length === 0, cfgS.dup.slice(0, 5));
check('S25159 无解析失败行', cfgS.bad.length === 0, cfgS.bad.slice(0, 3));
check('26555 = SDC8_GPPosHom', (api.lookupEcid(cfgS, '26555') || {}).name === 'SDC8_GPPosHom', api.lookupEcid(cfgS, '26555'));
check('26557 = SDC8_GPPosorigin', (api.lookupEcid(cfgS, '26557') || {}).name === 'SDC8_GPPosorigin');
check('带前导零仍能查到', (api.lookupEcid(cfgS, '026555') || {}).name === 'SDC8_GPPosHom');
check('工作区 ECID 表也能解析（数量不同）', cfgW.size === 13134, cfgW.size);

/* ---------- 3) 真实日志：配对 ---------- */
console.log('\n[3] 真实日志 ' + path.basename(LOG));
const lines = fs.readFileSync(LOG, 'utf8').split('\r\n');
const col = api.createCollector({ reqCode: 'S2F13', repCode: 'S2F14' });
const det = api.createPairDetector();
for (const line of lines) { col.feed(line); det.feed(line); }
col.finish(); det.finish();
check('扫到 S2F13/S2F14 共 13 对', col.pairs.length === 13, col.pairs.length);
check('没有未配对的请求', col.stat.unmatchedReq === 0, col.stat);
check('没有孤儿应答', col.stat.orphanReply === 0, col.stat);
check('检测器识别 S2F13->S2F14 13 次', det.counts.get('S2F13->S2F14') === 13, det.counts.get('S2F13->S2F14'));
// 日志里有 5 个 S1F3 不是“紧邻 S1F4 且 ID 相同”，所以检测到的相邻配对比消息条数少 5
check('检测器识别 S1F3->S1F4 25759 次', det.counts.get('S1F3->S1F4') === 25759, det.counts.get('S1F3->S1F4'));
check('每对请求/应答条数都是 4456', col.pairs.every((p) => p.reqItems === 4456 && p.resItems === 4456 && p.itemCount === 4456),
  col.pairs.map((p) => p.reqItems + '/' + p.resItems).slice(0, 5));
check('每对 messageID 一致', col.pairs.every((p) => p.req.msgId === p.res.msgId));
check('请求/应答原文都留了行（含 <L[n]> 与结束的 > 行，末尾空行已裁掉，共 4458 行）',
  col.pairs.every((p) => p.req.raw.length === 4458 && p.res.raw.length === 4458),
  col.pairs.map((p) => p.req.raw.length).slice(0, 3));
check('原文首行是列表头 <L[4456]', col.pairs.every((p) => p.req.raw[0].trim() === '<L[4456]'));
check('原文里没有解析不了的正文行', col.pairs.every((p) => !p.req.items.some((i) => i.tag === 'TEXT') && !p.res.items.some((i) => i.tag === 'TEXT')));

/* ---------- 4) 键值对应（用户要的结果） ---------- */
console.log('\n[4] 键值对应结果（08:06:00.971 / msgID 9018402 那一对）');
const target = col.pairs.find((p) => p.msgId === '9018402');
check('找到 9018402 这一对', !!target);
const rows = api.buildRows(target, cfgS);
check('明细行数 4456', rows.length === 4456, rows.length);
const named = rows.filter((r) => r.name).length;
console.log('        （4456 个 ECID 中，ECID.cfg 里能查到名称的：' + named + ' 个）');
const r26555 = rows.find((r) => r.id === '26555');
const r26557 = rows.find((r) => r.id === '26557');
check('26555 -> 1.6', r26555 && r26555.value === '1.6', r26555);
check('26555 名称 = SDC8_GPPosHom', r26555 && r26555.name === 'SDC8_GPPosHom', r26555 && r26555.name);
check('26557 -> 241.69', r26557 && r26557.value === '241.69', r26557);
check('26557 名称 = SDC8_GPPosorigin', r26557 && r26557.name === 'SDC8_GPPosorigin', r26557 && r26557.name);
console.log('        前 5 行预览：');
for (const r of rows.slice(0, 5)) console.log('          ' + r.id + '  ' + (r.name || '—') + '  =  ' + r.value + '   [' + r.valTag + '/' + (r.format || '—') + ']');

/* ---------- 5) 横向对比 ---------- */
console.log('\n[5] 横向对比（13 对并列）');
const pv = api.buildPivot(col.pairs, cfgS);
check('13 列', pv.columns.length === 13, pv.columns.length);
check('4456 行', pv.rows.length === 4456, pv.rows.length);
const p26555 = pv.rows.find((r) => r.id === '26555');
check('26555 的 13 个值都填上了', p26555 && p26555.values.filter((v) => v != null).length === 13, p26555 && p26555.values);
const changed = pv.rows.filter((r) => new Set(r.values.filter((v) => v != null)).size > 1).length;
console.log('        （13 次采样中数值发生过变化的项：' + changed + ' / ' + pv.rows.length + '）');

/* ---------- 6) 非默认配对（S1F3/S1F4）也要能跑 ---------- */
console.log('\n[6] 换一组配对 S1F3 -> S1F4');
const col2 = api.createCollector({ reqCode: 'S1F3', repCode: 'S1F4', maxPairs: 100000 });
for (const line of lines) col2.feed(line);
col2.finish();
check('S1F3/S1F4 配到 25759 对（与检测器一致）', col2.pairs.length === 25759 && col2.stat.pairs === 25759, {
  loaded: col2.pairs.length, stat: col2.stat
});
check('S1F3 未配对请求 5 条 / 孤儿应答 5 条（真实日志本身如此）',
  col2.stat.unmatchedReq === 5 && col2.stat.orphanReply === 5, col2.stat);
const col2c = api.createCollector({ reqCode: 'S1F3', repCode: 'S1F4', maxPairs: 10 });
for (const line of lines) col2c.feed(line);
col2c.finish();
check('超过上限时只保留前 10 对，但总数仍然统计', col2c.pairs.length === 10 && col2c.stat.pairs === 25759 && col2c.stat.droppedPairs === 25749,
  { kept: col2c.pairs.length, stat: col2c.stat });
const rows2 = api.buildRows(col2.pairs[0], cfgS);
console.log('        第一对示例（前 4 项）：' + rows2.slice(0, 4).map((r) => r.id + '=' + r.value + '(' + (r.name || '?') + ')').join(', '));
check('S1F3 的键是 U4、应答是数值类型', rows2.length > 0 && rows2[0].keyTag === 'U4' && /^[FIU]/.test(rows2[0].valTag), rows2[0]);

/* ---------- 7) 反例：故意制造不配对的情形 ---------- */
console.log('\n[7] 异常场景');
const badLog = [
  '00:00:01.000 S2F13 [H->E, 111]',
  '   <L[1] ',
  '      <U4[1] 26555  >',
  '   >',
  '00:00:01.100 S2F13 [H->E, 222]',   // 请求插队 -> 111 应判为未配对
  '   <L[1] ',
  '      <U4[1] 26557  >',
  '   >',
  '00:00:01.200 S2F14 [E->H, 999]',   // messageID 不同 -> 222 未配对、999 是孤儿应答
  '   <L[1] ',
  '      <F8[1] 1.0  >',
  '   >',
  '00:00:02.000 S2F13 [H->E, 333]',   // 正常一对
  '   <L[2] ',
  '      <U4[1] 26555  >',
  '      <U4[1] 26557  >',
  '   >',
  '00:00:02.100 S2F14 [E->H, 333]',
  '   <L[2] ',
  '      <F8[1] 1.6  >',
  '      <F8[1] 241.69  >',
  '   >',
];
const col3 = api.createCollector({ reqCode: 'S2F13', repCode: 'S2F14' });
for (const l of badLog) col3.feed(l);
col3.finish();
check('只保留 messageID 相同的紧邻配对', col3.pairs.length === 1 && col3.pairs[0].msgId === '333', col3.pairs.map((p) => p.msgId));
check('未配对请求数 = 2', col3.stat.unmatchedReq === 2, col3.stat);
check('孤儿应答数 = 1', col3.stat.orphanReply === 1, col3.stat);
const rows3 = api.buildRows(col3.pairs[0], cfgS);
check('干扰后被配上的键值仍然正确', rows3[0].value === '1.6' && rows3[1].value === '241.69', rows3.map((r) => r.value));

/* ---------- 8) 分段载入：只要第 601 对 ---------- */
console.log('\n[8] 分段载入（从第 N 对开始 / 不保留原文）');
const all = api.createCollector({ reqCode: 'S1F3', repCode: 'S1F4', maxPairs: 100000, keepRaw: false });
for (const line of lines) all.feed(line);
all.finish();
const col4 = api.createCollector({ reqCode: 'S1F3', repCode: 'S1F4', skipPairs: 600, maxPairs: 5 });
for (const line of lines) col4.feed(line);
col4.finish();
check('跳过前 600 对后只留下 5 对', col4.pairs.length === 5 && col4.stat.skipped === 600, { kept: col4.pairs.length, stat: col4.stat });
check('第一对的 ordinal = 600（也就是全局第 601 对）', col4.pairs[0].ordinal === 600, col4.pairs[0].ordinal);
check('总数仍然是 25759（跳过的不影响统计）', col4.stat.pairs === 25759, col4.stat.pairs);
check('分段的第 601 对和全量解析的第 601 对是同一对（时间/messageID 一致）',
  col4.pairs[0].time === all.pairs[600].time && col4.pairs[0].msgId === all.pairs[600].msgId,
  { seg: col4.pairs[0].time + '#' + col4.pairs[0].msgId, full: all.pairs[600].time + '#' + all.pairs[600].msgId });
check('两边的键值内容完全一致',
  JSON.stringify(api.buildRows(col4.pairs[0], cfgS)) === JSON.stringify(api.buildRows(all.pairs[600], cfgS)));
check('分段载入省内存：只保留了 5 对的原文', col4.pairs.every((p) => p.req.raw.length > 0) && col4.pairs.length === 5);

const col5 = api.createCollector({ reqCode: 'S1F3', repCode: 'S1F4', maxPairs: 1, keepRaw: false });
for (const line of lines) col5.feed(line);
col5.finish();
check('keepRaw=false 时不保留原文', col5.pairs[0].rawKept === false && col5.pairs[0].req.raw.length === 0 && col5.pairs[0].res.raw.length === 0);
check('keepRaw=false 仍然解析出同样的键值',
  JSON.stringify(api.buildRows(col5.pairs[0], cfgS)) === JSON.stringify(api.buildRows(all.pairs[0], cfgS)));

/* ---------- 9) SECS 消息含义表 ---------- */
console.log('\n[9] SECS 消息含义表');
const i21 = api.secsInfo('S16F21');
check('S16F21 收录了', i21.known && i21.from === 'builtin');
check('S16F21 = Process Job Get Space', i21.en === 'Process Job Get Space', i21.en);
check('S16F21 方向 H->E + 仅报头', i21.dir === 'H->E' && /Header Only/.test(i21.body), { dir: i21.dir, body: i21.body });
check('S16F21 的中文说明提到“还有多少空间/工艺作业”', /空间/.test(i21.zh) && /工艺作业/.test(i21.zh), i21.zh);
check('S16 这个 Stream 的说明是工艺作业管理', /工艺作业/.test(i21.stream.zh), i21.stream);
check('S2F13/S2F14 是“设备常数”读写', /设备常数/.test(api.secsInfo('S2F13').zh) && /设备常数/.test(api.secsInfo('S2F14').zh));
check('S1F1 是心跳、S6F11 是事件上报、S5F1 是报警', /心跳|你在吗/.test(api.secsInfo('S1F1').zh) && /事件/.test(api.secsInfo('S6F11').zh) && /报警/.test(api.secsInfo('S5F1').zh));
check('S7F19 是配方目录、S14F1 是对象属性、S3F17 走 S3 材料流', /配方目录/.test(api.secsInfo('S7F19').zh) && /对象属性/.test(api.secsInfo('S14F1').zh) && /材料/.test(api.secsInfo('S3F17').stream.zh));
check('未收录的消息退回 Stream 说明', !api.secsInfo('S2F99').known && /设备控制与诊断/.test(api.secsInfo('S2F99').stream.zh));
check('Stream 也没有的不会崩', api.secsInfo('S99F1').known === false && api.secsInfo('S99F1').stream === null);
check('大小写/空格不影响查询', api.secsInfo(' s2f13 ').en === 'Equipment Constant Request');
const ud = api.parseSecsDict('# 注释行\nS16F21,"Process Job Get Space",我们厂自己的说明,H->E,仅报头\nS2F99,My Message,自定义消息\n');
check('导入的表能覆盖内置说明', api.secsInfo('S16F21', ud.map).zh === '我们厂自己的说明' && api.secsInfo('S16F21', ud.map).from === 'user');
check('导入的表能补充新消息', api.secsInfo('S2F99', ud.map).en === 'My Message' && api.secsInfo('S2F99', ud.map).from === 'user');
check('只有两列（消息码,中文）也能识别', api.parseSecsDict('S9F9,应答超时').map['S9F9'][1] === '应答超时');
check('引号包起来的字段不会被逗号切开', api.parseSecsDict('S1F1,"Are You There",主机问你在吗,H->E').map['S1F1'][0] === 'Are You There');
check('不合法/表头的行被忽略', api.parseSecsDict('消息码,英文名,中文说明\n乱七八糟行\nS1F1,Are You There').bad.length === 2);
const csv = api.secsDictCsv(ud.map);
check('导出的 CSV 能原样再导入', api.parseSecsDict(csv).map['S2F99'][1] === '自定义消息');
check('导出的 CSV 含内置 80 条以上', api.parseSecsDict(csv).size > 80, api.parseSecsDict(csv).size);

/* ---------- 10) 日志里出现过的消息都能给出含义 ---------- */
console.log('\n[10] 用真实日志核对消息表覆盖率');
const seenCodes = Array.from(col.codeCounts.keys());
const missing = seenCodes.filter((c) => !api.secsInfo(c).known);
console.log('        日志里出现的消息码（' + seenCodes.length + ' 种）：' + seenCodes.join(' '));
check('日志里出现的每种消息都能查到含义（未收录：' + (missing.join(' ') || '无') + '）', missing.length === 0, missing);
check('S16F21 在日志里出现过 2 次', col.codeCounts.get('S16F21') === 2, col.codeCounts.get('S16F21'));

/* ---------- 11) 名称表按消息分流（S1 -> SVID，S2 -> ECID） ---------- */
console.log('\n[11] 名称表分流');
const svid = api.parseNameTable(fs.readFileSync(CFG_SVID, 'utf8'));
check('SVID.cfg 解析出 1721 条', svid.size === 1721, svid.size);
check('SVID.cfg 认成 SVID 类型（SV/DV）', svid.type === 'SVID' && !!svid.kinds.SV && !!svid.kinds.DV, svid.kinds);
check('ECID.cfg 认成 ECID 类型', api.parseNameTable(fs.readFileSync(CFG_S25159, 'utf8')).type === 'ECID');
check('按文件名猜角色', api.guessTableRole('SVID.cfg', null) === 'SVID' && api.guessTableRole('ECID.cfg', null) === 'ECID');
check('按内容猜角色（文件名看不出时）', api.guessTableRole('abc.cfg', svid) === 'SVID');
check('默认分流：S1 流 -> SVID，S2 流 -> ECID',
  api.defaultRoleForCode('S1F3') === 'SVID' && api.defaultRoleForCode('S2F13') === 'ECID' && api.defaultRoleForCode('S6F11') === null,
  [api.defaultRoleForCode('S1F3'), api.defaultRoleForCode('S2F13'), api.defaultRoleForCode('S6F11')]);

const resolver = api.nameResolver({ SVID: svid, ECID: cfgS }, {});
check('S1F3 查到的是 SVID 表', resolver.pick('S1F3') === svid);
check('S2F13 查到的是 ECID 表', resolver.pick('S2F13') === cfgS);
check('没规则的流默认没有表', resolver.pick('S6F11') === null);
const resolver2 = api.nameResolver({ SVID: svid, ECID: cfgS }, { S2F13: 'SVID' });
check('可以手工把 S2F13 改指到 SVID 表', resolver2.pick('S2F13') === svid);
const resolver3 = api.nameResolver({ SVID: svid }, { S2F13: '' });
check('可以显式指定“这个码不用表”', resolver3.pick('S2F13') === null);
const resolver4 = api.nameResolver({ ECID: cfgS }, {}, 'ECID');
check('只导入一张表时可当兜底', resolver4.pick('S1F3') === cfgS);

// S1F3 的键到底在哪张表里 —— 用真实日志验证
const s1pair = all.pairs[0];
const rowsSvid = api.buildRows(s1pair, resolver);
const rowsEcid = api.buildRows(s1pair, cfgS);
const namedSvid = rowsSvid.filter((r) => r.name).length;
const namedEcid = rowsEcid.filter((r) => r.name).length;
console.log('        第一对 S1F3 共 ' + rowsSvid.length + ' 项：SVID 表查到名称 ' + namedSvid + ' 个，ECID 表查到 ' + namedEcid + ' 个');
check('S1F3 的键用 SVID 表能全部查到名称', namedSvid === rowsSvid.length && rowsSvid.length === 74, { namedSvid, total: rowsSvid.length });
check('用 ECID 表查 S1F3 会大面积查不到（说明分流是必要的）', namedEcid < namedSvid, { namedEcid, namedSvid });
check('行里带了名称来源', rowsSvid.every((r) => r.tableRole === 'SVID') && rowsEcid.every((r) => r.tableRole === ''));
check('S2F13 的键用 ECID 表能全部查到名称',
  api.buildRows(col.pairs[0], api.nameResolver({ SVID: svid, ECID: cfgS }, {})).every((r) => r.name && r.tableRole === 'ECID'));

/* ---------- 12) 趋势数据（折线图的数据层） ---------- */
console.log('\n[12] 趋势数据');
check('一对消息的时间能转成秒', Math.abs(api.pairSeconds({ time: '08:06:00.971' }) - (8 * 3600 + 6 * 60 + 0.971)) < 1e-6);
check('带日期的能跨天正确定序',
  api.pairSeconds({ date: '2026-09-17', time: '23:59:59' }) < api.pairSeconds({ date: '2026-09-18', time: '00:00:01' }));
check('时间格式化', api.fmtSeconds(8 * 3600 + 6 * 60 + 0.971) === '08:06:00.971', api.fmtSeconds(8 * 3600 + 6 * 60 + 0.971));
const series = api.collectSeries(all.pairs, resolver, ['48341', '32001']);
check('抽出了两条序列', series.length === 2 && series[0].code === '48341', series.map((s) => s.code));
// 注意：S1F3 每次轮询的 SVID 列表并不完全相同，所以单条 SVID 的样本数会小于配对数
console.log('        48341 出现 ' + series[0].count + ' 次 / 32001 出现 ' + series[1].count + ' 次（共 ' + all.pairs.length + ' 对）');
check('单条 SVID 的样本数在 (0, 配对数] 之间', series[0].count > 0 && series[0].count <= all.pairs.length &&
  series[1].count > 0 && series[1].count <= all.pairs.length, series.map((s) => s.count));
check('序列按时间升序', series[0].points.every((p, i, a) => i === 0 || a[i - 1][0] <= p[0]));
check('序列带上了 SVID 名称', series[0].name === 'SCPQ15_Temp_PV', series[0].name);
check('统计值算得对', series[0].min <= series[0].avg && series[0].avg <= series[0].max && isFinite(series[0].last),
  { min: series[0].min, max: series[0].max, avg: series[0].avg, last: series[0].last });
const onlyNumeric = api.collectSeries(col.pairs, api.nameResolver({ SVID: svid, ECID: cfgS }, {}), ['26555', 'NO_SUCH_ID']);
check('非数值/不存在的变量不会崩，能自动忽略', onlyNumeric[0].count === 13 && onlyNumeric[1].count === 0, onlyNumeric.map((s) => s.count));

// 降采样：尖峰不能丢
const spike = [];
for (let i = 0; i < 5000; i++) spike.push([i, i === 2500 ? 999 : (i % 7) - 3]);
const small = api.downsampleMinMax(spike, 200);
check('降采样后点数明显变少', small.length <= 500, small.length);
check('降采样保留了尖峰', small.some((p) => p[1] === 999));
check('降采样保留最小值', small.some((p) => p[1] === -3));
check('点数本来就少时原样返回', api.downsampleMinMax([[0, 1], [1, 2]], 100).length === 2);
const sc = api.niceScale(3.7, 812.4, 5);
check('Y 轴刻度覆盖数据范围', sc.min <= 3.7 && sc.max >= 812.4 && sc.ticks.length >= 4, sc);
check('刻度是“好看”的步长', /^[125]\d*$/.test(String(sc.step).replace('.', '')), sc.step);
check('数字格式化', api.fmtNum(241.69) === '241.69' && api.fmtNum(0) === '0');

console.log('\n' + (failures ? '有 ' + failures + ' 项失败' : '全部通过 ✔'));
process.exit(failures ? 1 : 0);
