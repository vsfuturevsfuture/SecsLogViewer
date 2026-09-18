/* secs-dict.js
 * SECS 消息含义表：Stream 说明 + 常见 SxFy 的中文含义，可被自定义表覆盖
 *
 * 这段代码是从最初的单文件版本原样搬过来的（行为一致），只加了 export。
 */
/* ---------- SECS 消息含义表（按 SEMI E5 / E30 / E37 / E39 / E40 常见叫法整理） ----------
   说明：S 编号是“流(Stream)”，代表一类功能；SxFy 才是具体消息。
   表里没有的，界面会退回显示“流(Stream)的含义 + 未收录提示”，也可以自己导入消息表覆盖。 */
var SECS_STREAMS = {
  S1:  { en: 'Equipment Status / Communications', zh: '设备状态与通信：心跳、在线/离线切换、查询状态变量(SV)' },
  S2:  { en: 'Equipment Control and Diagnostics', zh: '设备控制与诊断：读写设备常数(ECID)、校时、事件报告定义、远程命令、Trace 采集' },
  S3:  { en: 'Material Status', zh: '材料状态：载具(Carrier)/晶圆的状态与信息' },
  S4:  { en: 'Material Control', zh: '材料控制：对载具/晶圆的搬运、转移等控制动作' },
  S5:  { en: 'Exception Handling (Alarms)', zh: '异常处理：报警上报、报警使能、报警清单' },
  S6:  { en: 'Data Collection', zh: '数据采集与事件报告：事件(CEID)上报、报告(RPTID)内容、Trace 采样数据' },
  S7:  { en: 'Recipe Management (Process Program)', zh: '配方管理：配方上下发、验证、删除、查询配方目录' },
  S8:  { en: 'Control Program Transfer', zh: '控制程序传输：程序/文件类数据的传输' },
  S9:  { en: 'System Errors', zh: '系统错误：协议层错误通知（报文不认识、超时、数据非法等）' },
  S10: { en: 'Terminal Services', zh: '终端服务：主机与设备之间的人工可读文本消息' },
  S12: { en: 'Wafer Mapping', zh: '晶圆映射：载具内晶圆分布图（Map）' },
  S14: { en: 'Object Services (E39)', zh: '对象服务：按对象模型读写属性/方法、订阅对象事件' },
  S16: { en: 'Process Job Management (E40)', zh: '工艺作业管理：创建/启动/查询工艺作业(PRJob)及其空间' }
};

// code: [英文名, 中文说明, 方向, 消息体说明]
var SECS_MESSAGES = {
  S1F1: ['Are You There', '主机问一句“你在吗”（心跳、通信握手的起手式）', 'H->E', '仅报头（Header Only）'],
  S1F2: ['On Line Data', '设备回答“我在”，并带上机型(MDLN)与软件版本(SOFTREV)', 'E->H', 'MDLN + SOFTREV'],
  S1F3: ['Selected Equipment Status Request', '主机按 SVID 列表查询设备状态变量(SV)', 'H->E', 'SVID 列表'],
  S1F4: ['Selected Equipment Status Data', '设备按同样顺序返回状态变量的值', 'E->H', '与 S1F3 一一对应的值列表'],
  S1F11: ['Status Variable Namelist Request', '主机请求设备上报“所有状态变量(SV)的清单”', 'H->E', ''],
  S1F12: ['Status Variable Namelist Reply', '设备返回状态变量清单（SVID/名称/单位）', 'E->H', ''],
  S1F13: ['Establish Communications Request', '主机请求建立通信（上线握手）', 'H->E', ''],
  S1F14: ['Establish Communications Request Acknowledge', '设备同意建立通信，并回送机型/软件版本', 'E->H', 'COMMACK + MDLN + SOFTREV'],
  S1F15: ['Request OFF-LINE', '主机要求设备转为离线(Off-Line)', 'H->E', '仅报头'],
  S1F16: ['OFF-LINE Acknowledge', '设备确认已离线(OFLACK)', 'E->H', 'OFLACK'],
  S1F17: ['Request ON-LINE', '主机要求设备转为在线(On-Line)', 'H->E', '仅报头'],
  S1F18: ['ON-LINE Acknowledge', '设备确认已在线(ONLACK)', 'E->H', 'ONLACK'],

  S2F13: ['Equipment Constant Request', '主机按 ECID 列表读取设备常数（Equipment Constant）', 'H->E', 'ECID 列表（U4）'],
  S2F14: ['Equipment Constant Data', '设备返回设备常数值，顺序与 S2F13 一一对应', 'E->H', '与 S2F13 一一对应的值'],
  S2F15: ['New Equipment Constant Send', '主机给设备写设备常数（设置 ECID 的值）', 'H->E', 'ECID + 新值'],
  S2F16: ['New Equipment Constant Acknowledge', '设备确认常数写入结果', 'E->H', 'EAC'],
  S2F17: ['Date and Time Request', '主机读取设备的日期时间', 'H->E', '仅报头'],
  S2F18: ['Date and Time Data', '设备返回日期时间', 'E->H', '时间字符串'],
  S2F23: ['Trace Initialize Send', '主机下发数据采集(Trace)任务：采哪些 SV、周期、采样点数', 'H->E', 'TRID + 采样参数'],
  S2F24: ['Trace Initialize Acknowledge', '设备确认 Trace 任务建立结果', 'E->H', 'TIAACK'],
  S2F25: ['Loopback Diagnostic Request', '通信回环自检（测链路是否正常）', 'H->E', '任意数据'],
  S2F26: ['Loopback Diagnostic Data', '设备原样回送数据', 'E->H', '与请求相同的数据'],
  S2F29: ['Equipment Constant Namelist Request', '主机请求设备上报全部 ECID 的清单（编号/名称/单位/范围）', 'H->E', ''],
  S2F30: ['Equipment Constant Namelist', '设备返回 ECID 清单', 'E->H', 'ECID 定义列表'],
  S2F31: ['Date and Time Set Request', '主机给设备校时（设置日期时间）', 'H->E', '时间字符串'],
  S2F32: ['Date and Time Set Acknowledge', '设备确认校时结果', 'E->H', 'TIACK'],
  S2F33: ['Define Report', '定义事件报告的内容：报告(RPTID)里放哪些变量', 'H->E', 'DATAID + 报告定义'],
  S2F34: ['Define Report Acknowledge', '设备确认报告已定义', 'E->H', 'DRACK'],
  S2F35: ['Link Event Report', '把事件(CEID)与报告(RPTID)绑定', 'H->E', '事件与报告的对应关系'],
  S2F36: ['Link Event Report Acknowledge', '设备确认绑定结果', 'E->H', 'LRACK'],
  S2F37: ['Enable/Disable Event Report', '打开或关闭一个/多个事件报告', 'H->E', 'CEED + CEID 列表'],
  S2F38: ['Enable/Disable Event Report Acknowledge', '设备确认事件报告开关结果', 'E->H', 'ERACK'],
  S2F41: ['Host Command Send', '主机下发远程命令（START / STOP / PP-SELECT / CANCEL 等）', 'H->E', 'RCMD + 参数'],
  S2F42: ['Host Command Acknowledge', '设备回命令执行结果', 'E->H', 'HCACK + 参数'],
  S2F43: ['Reset Spooling Streams and Functions', '复位设备的 spooling（断连期间缓存）设置', 'H->E', ''],
  S2F44: ['Reset Spooling Acknowledge', '设备确认 spooling 设置已复位', 'E->H', ''],
  S2F45: ['Define Variable Limit Attributes', '定义变量限值属性（上下限、触发方式）', 'H->E', '名称/字段随 E5 版本略有差异'],
  S2F46: ['Variable Limit Attributes Acknowledge', '设备对变量限值定义的应答', 'E->H', '名称/字段随 E5 版本略有差异'],
  S2F47: ['Variable Limit Attribute Request', '主机查询变量限值属性', 'H->E', '名称/字段随 E5 版本略有差异'],
  S2F48: ['Variable Limit Attribute Data', '设备返回变量限值属性', 'E->H', '名称/字段随 E5 版本略有差异'],
  S2F49: ['Enhanced Host Command Send', '增强版远程命令（多命令、多参数、带确认）', 'H->E', ''],
  S2F50: ['Enhanced Host Command Acknowledge', '设备回增强命令的结果', 'E->H', ''],

  S3F17: ['Carrier Action Request', '载具(Carrier)相关请求：S3 是材料状态流，常见于载具 ID/状态的读取与动作', 'H->E', '各厂家实现略有差异'],
  S3F18: ['Carrier Action Acknowledge', '载具相关请求的应答', 'E->H', '各厂家实现略有差异'],

  S5F1: ['Alarm Report Send', '设备上报报警：报警码(ALCD) + 报警文本(ALTX)', 'E->H', 'ALCD + ALID + ALTX'],
  S5F2: ['Alarm Report Acknowledge', '主机确认收到报警', 'H->E', 'ACKC5'],
  S5F3: ['Enable/Disable Alarm Send', '主机使能或禁止某个报警上报', 'H->E', 'ALED + ALID'],
  S5F4: ['Enable/Disable Alarm Acknowledge', '设备确认报警使能结果', 'E->H', 'ACKC5'],
  S5F5: ['List Alarms Request', '主机请求设备的报警清单', 'H->E', ''],
  S5F6: ['List Alarms Data', '设备返回报警清单', 'E->H', 'ALID 列表'],
  S5F7: ['List Enabled Alarms Request', '主机请求“当前已使能的报警”清单', 'H->E', ''],
  S5F8: ['List Enabled Alarms Data', '设备返回已使能报警清单', 'E->H', 'ALID 列表'],

  S6F1: ['Trace Data Send', '按 S2F23 建立的采集任务上报采样数据', 'E->H', 'TRID + 采样点'],
  S6F2: ['Trace Data Acknowledge', '主机确认收到采样数据', 'H->E', 'ACKC6'],
  S6F5: ['Multi-block Data Send Inquire', '大数据分段传输前的询问', 'E->H', '分段传输相关'],
  S6F6: ['Multi-block Data Send Grant', '主机同意设备发送多块数据', 'H->E', '分段传输相关'],
  S6F11: ['Event Report Send', '设备上报事件：事件号(CEID) + 报告数据（GEM 里最核心的上报）', 'E->H', 'DATAID + CEID + 报告内容'],
  S6F12: ['Event Report Acknowledge', '主机确认收到事件报告', 'H->E', 'ACKC6'],
  S6F13: ['Annotated Event Report Send', '带注释的事件报告上报', 'E->H', '事件 + 注释信息'],
  S6F14: ['Annotated Event Report Acknowledge', '主机确认收到带注释的事件报告', 'H->E', ''],
  S6F15: ['Event Report Request', '主机主动索取某个事件的最新报告数据', 'H->E', 'CEID'],
  S6F16: ['Event Report Data', '设备返回该事件的数据', 'E->H', '报告内容'],
  S6F19: ['Individual Report Request', '主机请求某个报告(RPTID)的内容', 'H->E', 'RPTID'],
  S6F20: ['Individual Report Data', '设备返回报告内容', 'E->H', '报告内容'],

  S7F1: ['Process Program Load Inquire', '主机先问设备“能不能接收配方”（协商超时时间）', 'H->E', 'PPID + 长度'],
  S7F2: ['Process Program Load Grant', '设备回答可以/不可以接收', 'E->H', 'PPGNT'],
  S7F3: ['Process Program Send', '主机把配方内容下发给设备', 'H->E', 'PPID + 配方正文'],
  S7F4: ['Process Program Send Acknowledge', '设备确认配方已收到', 'E->H', 'ACKC7'],
  S7F5: ['Process Program Request', '主机向设备索取配方', 'H->E', 'PPID'],
  S7F6: ['Process Program Data', '设备把配方内容发给主机', 'E->H', 'PPID + 配方正文'],
  S7F17: ['Delete Process Program Send', '主机要求删除配方', 'H->E', 'PPID 列表'],
  S7F18: ['Delete Process Program Acknowledge', '设备确认删除结果', 'E->H', 'ACKC7'],
  S7F19: ['Current Process Program Directory Request', '主机请求设备上“当前有哪些配方”（配方目录）', 'H->E', '仅报头'],
  S7F20: ['Current Process Program Directory', '设备返回配方目录清单', 'E->H', 'PPID 列表'],

  S9F1:  ['Unrecognized Device ID', '收到的报文不是发给自己的（DEVICEID 不匹配）', '双向', 'MHEAD'],
  S9F3:  ['Unrecognized Stream Type', '收到的 Stream 不认识', '双向', 'MHEAD'],
  S9F5:  ['Unrecognized Function Type', '收到的 Function 不认识', '双向', 'MHEAD'],
  S9F7:  ['Illegal Data', '报文体数据不合法（长度/格式不对）', '双向', 'MHEAD'],
  S9F9:  ['Transaction Timer Timeout', '等应答超时（T3 超时）', '双向', 'SHEAD'],
  S9F11: ['Data Too Long', '数据太长，超过允许长度', '双向', 'MHEAD'],
  S9F13: ['Conversation Timeout', '会话超时', '双向', 'MEXP'],

  S10F1: ['Terminal Request', '设备要求往主机终端打印一条消息', 'E->H', 'TID + 文本'],
  S10F2: ['Terminal Request Acknowledge', '主机确认收到终端消息', 'H->E', 'ACKC10'],
  S10F3: ['Terminal Display, Single', '主机往设备终端显示一条消息', 'H->E', 'TID + 文本'],
  S10F4: ['Terminal Display, Single Acknowledge', '设备确认已显示', 'E->H', 'ACKC10'],
  S10F5: ['Terminal Display, Multi-block', '主机往设备终端显示多块消息', 'H->E', 'TID + 多块文本'],
  S10F6: ['Terminal Display, Multi-block Acknowledge', '设备确认已显示', 'E->H', 'ACKC10'],

  S14F1: ['GetAttr Request', '读取对象属性（按对象模型 OBJID + 属性号）', 'H->E', 'OBJID + ATTRID 列表'],
  S14F2: ['GetAttr Data', '返回对象属性值', 'E->H', '属性值列表'],
  S14F3: ['SetAttr Request', '设置对象属性', 'H->E', 'OBJID + 属性 + 值'],
  S14F4: ['SetAttr Acknowledge', '确认属性设置结果', 'E->H', ''],

  S16F1:  ['Process Job Create', '主机要求创建一个工艺作业(PRJob)：用哪个配方、处理哪些材料', 'H->E', '名称/字段随 E40 版本略有差异'],
  S16F2:  ['Process Job Create Acknowledge', '设备回创建结果（含 PRJobID）', 'E->H', '名称/字段随 E40 版本略有差异'],
  S16F5:  ['Process Job Command', '主机对工艺作业下命令（启动/停止/暂停/中止）', 'H->E', '名称/字段随 E40 版本略有差异'],
  S16F6:  ['Process Job Command Acknowledge', '设备回命令执行结果', 'E->H', '名称/字段随 E40 版本略有差异'],
  S16F21: ['Process Job Get Space', '主机查询设备“还有多少空间可以创建新的工艺作业(PRJob)”', 'H->E', '仅报头（Header Only）'],
  S16F22: ['Process Job Get Space Acknowledge', '设备返回剩余可创建的作业数量', 'E->H', '剩余空间/数量']
};

// S16F21 -> S16（不能用 slice(0,2)，那会把 S16 当成 S1）
function secsStreamKey(code) {
  var m = /^S(\d+)F\d+$/.exec(String(code == null ? '' : code).toUpperCase().replace(/\s+/g, ''));
  return m ? 'S' + m[1] : null;
}

// 查一条消息的含义：优先用用户导入的表，再退回内置表，最后退回“流(Stream)的含义”
function secsInfo(code, userDict) {
  var c = String(code == null ? '' : code).toUpperCase().replace(/\s+/g, '');
  var hit = (userDict && userDict[c]) || SECS_MESSAGES[c] || null;
  var sk = secsStreamKey(c);
  var stream = (sk && SECS_STREAMS[sk]) || null;
  return {
    code: c,
    en: hit ? hit[0] || '' : '',
    zh: hit ? hit[1] || '' : '',
    dir: hit ? hit[2] || '' : '',
    body: hit ? hit[3] || '' : '',
    stream: stream,
    streamKey: sk,
    known: !!hit,
    from: (userDict && userDict[c]) ? 'user' : (hit ? 'builtin' : 'none')
  };
}

// 一行 CSV（支持 "双引号包起来的,逗号"）
function csvSplitLine(line) {
  var out = [], cur = '', q = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line.charAt(i);
    if (q) {
      if (ch === '"') { if (line.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  for (var k = 0; k < out.length; k++) out[k] = out[k].trim();
  return out;
}

// 解析用户导入的消息表：消息码,英文名,中文说明,方向,消息体说明（后两项可省）
function parseSecsDict(text) {
  var map = {}, bad = [], total = 0;
  var lines = String(text).split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i];
    if (!raw.trim() || raw.trim().charAt(0) === '#') continue;
    var f = raw.indexOf('\t') >= 0 ? raw.split('\t') : csvSplitLine(raw);
    for (var z = 0; z < f.length; z++) f[z] = String(f[z]).trim();
    var code = f[0].toUpperCase();
    if (!/^S\d+F\d+$/.test(code)) { bad.push(raw); continue; }
    if (!f[1]) { bad.push(raw); continue; }
    if (f.length >= 3) map[code] = [f[1], f[2], f[3] || '', f[4] || ''];
    else map[code] = ['', f[1], '', ''];
    total++;
  }
  return { map: map, bad: bad, total: total, size: Object.keys(map).length };
}

// 导出成可再导入的 CSV（内置表 + 自定义）
function secsDictCsv(userDict) {
  var q = function (v) { var s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  var codes = Object.keys(SECS_MESSAGES).concat(Object.keys(userDict || {}).filter(function (c) { return !SECS_MESSAGES[c]; }));
  codes.sort(function (a, b) {
    var ma = /^S(\d+)F(\d+)$/.exec(a), mb = /^S(\d+)F(\d+)$/.exec(b);
    return Number(ma[1]) - Number(mb[1]) || Number(ma[2]) - Number(mb[2]);
  });
  var out = ['# SECS 消息表：消息码,英文名,中文说明,方向,消息体说明（后两项可省略）',
    '# 改完存成 UTF-8 再导入本工具；同一个消息码会覆盖内置表'];
  codes.forEach(function (c) {
    var r = secsInfo(c, userDict);
    out.push([c, r.en, r.zh, r.dir, r.body].map(q).join(','));
  });
  return '\ufeff' + out.join('\r\n');
}

export {
  SECS_STREAMS,
  SECS_MESSAGES,
  secsStreamKey,
  secsInfo,
  csvSplitLine,
  parseSecsDict,
  secsDictCsv
};
