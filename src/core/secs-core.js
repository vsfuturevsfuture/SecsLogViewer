/* secs-core.js
 * SECS 日志解析核心：消息头/项解析、名称表、键值配对、时间序列（纯逻辑，不依赖 DOM）
 *
 * 这段代码是从最初的单文件版本原样搬过来的（行为一致），只加了 export。
 */
// 消息头（可出现在行内任意位置：前面可能有 "2026-09-17 00:21:27.0088 [t:36][Debug]Secslog:" 前缀）
var SECS_HEADER_RE = /(\d{2}:\d{2}:\d{2}\.\d{1,4})\s+(S\d+F\d+)\s*\[\s*([^,\]]*?)\s*,\s*(\d+)\s*\]/;
var SECS_HEADER_NO_TS_RE = /(S\d+F\d+)\s*\[\s*([^,\]]*?)\s*,\s*(\d+)\s*\]/;
var OUTER_TS_RE = /(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}\.\d{1,4})/;
var ITEM_RE = /^<([A-Za-z]+\d*)\[(\d+)\]\s*(.*?)\s*>\s*$/;   // 单行完整项： <U4[1] 26555  >
var ITEM_OPEN_RE = /^<([A-Za-z]+\d*)\[(\d+)\]\s*(.*)$/;       // 可能是列表头： <L[4456]
var HEADER_ONLY = '<header only>';

function parseHeader(line) {
  var m = SECS_HEADER_RE.exec(line);
  var time = '', code = '', dir = '', msgId = '', noTs = false;
  if (m) { time = m[1]; code = m[2]; dir = m[3]; msgId = m[4]; }
  else {
    var m2 = SECS_HEADER_NO_TS_RE.exec(line);
    if (!m2) return null;
    code = m2[1]; dir = m2[2]; msgId = m2[3]; noTs = true;
  }
  var head = code ? line.slice(0, line.indexOf(code)) : '';
  var outer = OUTER_TS_RE.exec(head);
  return {
    time: time, code: code.toUpperCase(), dir: String(dir).trim(), msgId: msgId,
    date: outer ? outer[1] : '', outerTime: outer ? outer[2] : '', noTs: noTs, raw: line
  };
}

// 把一段消息正文（若干行）解析成项树
function parseBody(lines) {
  var root = { tag: 'ROOT', count: 0, value: '', children: [] };
  var stack = [root];
  for (var i = 0; i < lines.length; i++) {
    var line = String(lines[i]).trim();
    if (!line || line === HEADER_ONLY) continue;
    if (line === '>') { if (stack.length > 1) stack.pop(); continue; }
    var full = ITEM_RE.exec(line);
    if (full) {
      // <L[n] ... > 这种在同一行闭合的（例如 <L[0] >）仍然当成列表处理
      var isList = (full[1] === 'L');
      stack[stack.length - 1].children.push({
        tag: full[1], count: parseInt(full[2], 10),
        value: isList ? '' : full[3].trim(),
        children: isList ? [] : null, raw: line
      });
      continue;
    }
    var open = ITEM_OPEN_RE.exec(line);
    if (open) {
      var node = { tag: open[1], count: parseInt(open[2], 10), value: '', children: [], raw: line };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      continue;
    }
    stack[stack.length - 1].children.push({ tag: 'TEXT', count: 0, value: line, children: null, raw: line });
  }
  return root.children;
}

// 键值配对：请求项与应答项按位置一一对应（遇到嵌套列表则递归下去）
function flattenPairs(reqChildren, resChildren, path, out) {
  path = path || []; out = out || [];
  var n = Math.max(reqChildren.length, resChildren.length);
  for (var i = 0; i < n; i++) {
    var a = reqChildren[i], b = resChildren[i];
    var p = path.concat(i);
    if ((a && a.tag === 'L') || (b && b.tag === 'L')) {
      flattenPairs((a && a.children) || [], (b && b.children) || [], p, out);
    } else {
      out.push({
        path: p,
        keyNode: a || null, valNode: b || null,
        key: a ? a.value : '', keyTag: a ? a.tag : '',
        value: b ? b.value : '', valTag: b ? b.tag : ''
      });
    }
  }
  return out;
}

function nodeText(node) {
  if (!node) return '';
  if (node.tag === 'L') return '(' + node.children.map(nodeText).join(' ') + ')';
  return node.value;
}

// 名称表：ECID.cfg 与 SVID.cfg 的列格式一样
//   ECID.cfg : EC        ID FORMAT NAME UNITs IONAME IOTYPE
//   SVID.cfg : SV / DV   ID FORMAT NAME UNITs IONAME IOTYPE [LIST 数组]
function parseNameTable(text) {
  var map = new Map(), dup = [], bad = [], total = 0, kinds = {};
  var lines = String(text).split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (!t || t.charAt(0) === '#') continue;
    var tok = t.split(/\s+/);
    if (tok.length < 2 || !/^\d+$/.test(tok[1])) { bad.push(lines[i]); continue; }
    kinds[tok[0]] = (kinds[tok[0]] || 0) + 1;
    var rec = {
      kind: tok[0], id: tok[1], format: tok[2] || '', name: tok[3] || '',
      unit: tok[4] || '', ioName: tok[5] || '', ioType: tok[6] || '', line: i + 1
    };
    total++;
    var old = map.get(rec.id);
    if (old) {
      dup.push(rec.id);
      if (old.kind !== 'EC' && rec.kind === 'EC') map.set(rec.id, rec);
    } else map.set(rec.id, rec);
  }
  var hasEC = !!kinds.EC, hasSV = !!(kinds.SV || kinds.DV);
  return {
    map: map, dup: dup, bad: bad, total: total, size: map.size, kinds: kinds,
    type: hasEC && hasSV ? 'mixed' : (hasSV ? 'SVID' : (hasEC ? 'ECID' : 'other'))
  };
}
function parseEcidCfg(text) { return parseNameTable(text); }

function lookupName(table, key) {
  if (!table || !table.map) return null;
  var k = String(key == null ? '' : key).trim();
  if (table.map.has(k)) return table.map.get(k);
  var n = k.replace(/^0+(?=\d)/, '');
  if (n !== k && table.map.has(n)) return table.map.get(n);
  if (/^\d+$/.test(k)) {
    var num = String(Number(k));
    if (table.map.has(num)) return table.map.get(num);
  }
  return null;
}
function lookupEcid(table, key) { return lookupName(table, key); }

// 表角色：SVID（状态变量）还是 ECID（设备常数）
function guessTableRole(fileName, parsed) {
  var n = String(fileName || '').toUpperCase();
  if (/SVID/.test(n)) return 'SVID';
  if (/ECID/.test(n)) return 'ECID';
  if (parsed && parsed.type === 'SVID') return 'SVID';
  if (parsed && parsed.type === 'ECID') return 'ECID';
  return null;
}

/* 默认分流规则：S1 流的状态查询/上报对应 SVID，S2 流的常数读写对应 ECID。
   （S1F3/S1F4 的键是 SVID；S2F13/S2F14 的键是 ECID；其它流没有默认表，可在界面里指定） */
function defaultRoleForCode(code) {
  var m = /^S(\d+)F\d+$/.exec(String(code == null ? '' : code).toUpperCase());
  if (!m) return null;
  var s = Number(m[1]);
  if (s === 1) return 'SVID';
  if (s === 2) return 'ECID';
  return null;
}
function nameResolver(tables, mapping, fallbackRole) {
  return {
    tables: tables || {}, mapping: mapping || {}, fallbackRole: fallbackRole || null,
    roleFor: function (code) {
      var c = String(code == null ? '' : code).toUpperCase();
      if (Object.prototype.hasOwnProperty.call(this.mapping, c)) return this.mapping[c] || null;
      var role = defaultRoleForCode(c);
      if (role && this.tables[role]) return role;
      if (this.fallbackRole && this.tables[this.fallbackRole]) return this.fallbackRole;
      return role || this.fallbackRole || null;
    },
    pick: function (code) {
      var c = String(code == null ? '' : code).toUpperCase();
      if (Object.prototype.hasOwnProperty.call(this.mapping, c)) {
        var r0 = this.mapping[c];
        return r0 ? (this.tables[r0] || null) : null;      // 手工指定（空串 = 明确不用表）
      }
      var role = defaultRoleForCode(c);
      var t = role ? (this.tables[role] || null) : null;
      if (!t && this.fallbackRole) t = this.tables[this.fallbackRole] || null;  // 只导入了一张表时兜底
      return t;
    }
  };
}

// 一对消息 -> 明细行
function buildRows(pair, target) {
  var single = (target && target.map) ? target : null;
  var resolver = (!single && target && target.pick) ? target : null;
  var table = single || (resolver ? resolver.pick(pair.req.code) : null);
  var entries = flattenPairs(pair.req.items || [], pair.res.items || []);
  var rows = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i], info = lookupName(table, e.key);
    rows.push({
      no: i + 1,
      path: e.path.join('.'),
      id: String(e.key).trim(),
      name: info ? info.name : '',
      format: info ? info.format : '',
      unit: info ? info.unit : '',
      ioName: info ? info.ioName : '',
      ioType: info ? info.ioType : '',
      cfgLine: info ? info.line : 0,
      tableRole: table ? (table.role || (resolver ? resolver.roleFor(pair.req.code) : '') || '') : '',
      tableName: table ? (table.name || '') : '',
      keyTag: e.keyTag, valTag: e.valTag,
      value: e.value,
      issue: !e.keyNode ? '请求缺项' : (!e.valNode ? '应答缺项' : '')
    });
  }
  return rows;
}

// 横向对比（多对并列：行 = ECID，列 = 每一次配对）
function buildPivot(pairs, ecid) {
  var order = [], map = new Map();
  for (var ci = 0; ci < pairs.length; ci++) {
    var rows = buildRows(pairs[ci], ecid);
    for (var ri = 0; ri < rows.length; ri++) {
      var r = rows[ri], e = map.get(r.id);
      if (!e) {
        e = {
          id: r.id, name: r.name, unit: r.unit, format: r.format,
          values: new Array(pairs.length).fill(null), tags: new Array(pairs.length).fill('')
        };
        map.set(r.id, e); order.push(r.id);
      }
      if (!e.name && r.name) e.name = r.name;
      e.values[ci] = r.value;
      e.tags[ci] = r.valTag;
    }
  }
  return { columns: pairs, rows: order.map(function (id) { return map.get(id); }) };
}

/* ---------- 时间序列（SVID 这种一整天几千上万点的量，画折线图用） ---------- */

// 一对消息的时间 -> 秒（有日期就带日期，跨天也不会乱序）
// 一对消息的时间 -> 秒（有日期就带日期，跨天也不会乱序）
// 注意：日志里并不是每行都带外层日期前缀，所以支持传一个“基准日”兜底
function pairSeconds(pair, baseDay) {
  var t = String(pair && pair.time || '');
  var m = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,4}))?$/.exec(t);
  if (!m) return NaN;
  var sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number(('0.' + m[4])) : 0);
  var d = parseDateKey((pair && pair.date) || '');
  if (d == null && baseDay != null) d = baseDay;
  return d == null ? sec : d * 86400 + sec;
}
// 从这些配对里推断“基准日”：优先取出现次数最多的日期，其次看文件名里的日期
function inferDayBase(pairs) {
  var counts = {}, best = null;
  for (var i = 0; i < (pairs || []).length; i++) {
    var d = pairs[i].date;
    if (!d) continue;
    counts[d] = (counts[d] || 0) + 1;
    if (best == null || counts[d] > counts[best]) best = d;
  }
  if (best) return parseDateKey(best);
  for (var j = 0; j < (pairs || []).length; j++) {
    var m = /(\d{4}-\d{2}-\d{2})/.exec(String(pairs[j].file || ''));
    if (m) return parseDateKey(m[1]);
  }
  return null;
}
function parseDateKey(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}
function fmtSeconds(sec) {
  if (!isFinite(sec)) return '';
  var day = Math.floor(sec / 86400);
  var ms0 = Math.round((sec - day * 86400) * 1000);
  var h = Math.floor(ms0 / 3600000), mi = Math.floor((ms0 % 3600000) / 60000);
  var ss = Math.floor((ms0 % 60000) / 1000), ms = ms0 % 1000;
  var hhmmss = pad2(h) + ':' + pad2(mi) + ':' + pad2(ss) + (ms ? '.' + String(ms).padStart(3, '0') : '');
  if (!day) return hhmmss;
  var d = new Date(day * 86400000);
  return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + hhmmss;
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }

// 从已载入的配对里抽出若干变量的时间序列（只保留能转成数字的值）
function collectSeries(pairs, resolver, codes) {
  var want = {}, order = [];
  for (var i = 0; i < codes.length; i++) {
    var c = String(codes[i]).trim();
    if (!c || want[c]) continue;
    want[c] = { code: c, points: [] }; order.push(c);
  }
  var baseDay = inferDayBase(pairs);
  for (var p = 0; p < pairs.length; p++) {
    var pair = pairs[p], t = pairSeconds(pair, baseDay);
    if (!isFinite(t)) continue;
    var table = resolver ? resolver.pick(pair.req.code) : null;
    var entries = flattenPairs(pair.req.items || [], pair.res.items || []);
    for (var k = 0; k < entries.length; k++) {
      var id = String(entries[k].key).trim();
      var w = want[id];
      if (!w) continue;
      var v = Number(String(entries[k].value).trim());
      if (!isFinite(v)) continue;
      var info = table ? lookupName(table, id) : null;
      if (!w.name && info) { w.name = info.name; w.unit = info.unit; w.format = info.format; }
      w.points.push([t, v]);
    }
  }
  var out = [];
  for (var z = 0; z < order.length; z++) {
    var s = want[order[z]];
    s.points.sort(function (a, b) { return a[0] - b[0]; });
    var min = Infinity, max = -Infinity, sum = 0;
    for (var q = 0; q < s.points.length; q++) {
      var val = s.points[q][1];
      if (val < min) min = val;
      if (val > max) max = val;
      sum += val;
    }
    out.push({
      code: s.code, name: s.name || '', unit: s.unit || '', format: s.format || '',
      points: s.points, count: s.points.length,
      min: s.points.length ? min : NaN, max: s.points.length ? max : NaN,
      avg: s.points.length ? sum / s.points.length : NaN,
      last: s.points.length ? s.points[s.points.length - 1][1] : NaN
    });
  }
  return out;
}

// 数据点多于像素宽度时做 min/max 分桶降采样：保留每段的最高最低点，尖峰不会被画没
function downsampleMinMax(points, maxPoints) {
  var n = points.length;
  if (!(maxPoints > 2) || n <= maxPoints) return points;
  var per = Math.ceil(n / Math.max(1, Math.floor(maxPoints / 2)));
  var out = [];
  for (var i = 0; i < n; i += per) {
    var end = Math.min(n, i + per);
    var lo = i, hi = i;
    for (var j = i + 1; j < end; j++) {
      if (points[j][1] < points[lo][1]) lo = j;
      if (points[j][1] > points[hi][1]) hi = j;
    }
    var picks = [i, lo, hi, end - 1].filter(function (v, idx, arr) { return arr.indexOf(v) === idx; })
      .sort(function (a, b) { return a - b; });
    for (var k = 0; k < picks.length; k++) out.push(points[picks[k]]);
  }
  return out;
}

// Y 轴刻度
function niceScale(min, max, want) {
  want = want || 5;
  if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
  if (min === max) { var d = Math.abs(min) || 1; min -= d * 0.5; max += d * 0.5; }
  var span = max - min;
  var step = Math.pow(10, Math.floor(Math.log(span / want) / Math.LN10));
  var err = (span / want) / step;
  if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
  var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  var ticks = [];
  for (var v = lo; v <= hi + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return { min: lo, max: hi, step: step, ticks: ticks };
}
function fmtNum(v) {
  if (!isFinite(v)) return '';
  var a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1000000 || a < 0.001) return v.toExponential(2);
  return String(Number(v.toFixed(a < 1 ? 4 : (a < 100 ? 3 : 2))));
}

// 收集器：喂日志行，按“紧邻 + messageID 相同”配对
function createCollector(opts) {
  opts = opts || {};
  var reqCode = String(opts.reqCode || '').toUpperCase();
  var repCode = String(opts.repCode || '').toUpperCase();
  var maxPairs = opts.maxPairs == null ? 500 : opts.maxPairs;
  var skipPairs = Math.max(0, opts.skipPairs || 0);
  var keepRaw = opts.keepRaw !== false;
  var strict = opts.strictAdjacent !== false;
  var pairs = [], warnings = [], codeCounts = new Map();
  var cur = null, pending = null;
  var lastDate = '';                     // 日志里不是每行都带外层日期，用最近一次见到的日期补上
  var stat = { headers: 0, pairs: 0, skipped: 0, unmatchedReq: 0, orphanReply: 0, droppedPairs: 0 };

  function warn(type, msg) { if (warnings.length < 60) warnings.push({ type: type, msg: msg }); }
  function trimTail(arr) {
    var i = arr ? arr.length : 0;
    while (i > 0 && String(arr[i - 1]).trim() === '') i--;
    return arr.slice(0, i);
  }
  function makePair(req, res) {
    var reqLeaves = flattenPairs(req.items || [], []).length;
    var resLeaves = flattenPairs(res.items || [], []).length;
    return {
      req: { code: req.h.code, time: req.h.time, date: req.h.date, dir: req.h.dir, msgId: req.h.msgId, header: req.h.raw, items: req.items, raw: keepRaw ? trimTail(req.rawLines) : [] },
      res: { code: res.h.code, time: res.h.time, date: res.h.date, dir: res.h.dir, msgId: res.h.msgId, header: res.h.raw, items: res.items, raw: keepRaw ? trimTail(res.rawLines) : [] },
      time: req.h.time, date: req.h.date || res.h.date, msgId: req.h.msgId,
      reqItems: reqLeaves, resItems: resLeaves, itemCount: Math.max(reqLeaves, resLeaves),
      rawKept: keepRaw, ordinal: stat.pairs - 1
    };
  }
  function close() {
    if (!cur) return;
    var m = cur; cur = null;
    if (!m.body) return;
    m.items = parseBody(m.body);
    if (m.h.code === reqCode) {
      if (pending) warn('req-overlap', '请求 ' + pending.h.code + ' #' + pending.h.msgId + ' 还没配对，就来了新请求 ' + String(m.h.raw).trim());
      pending = m;
    } else if (m.h.code === repCode) {
      if (pending && pending.h.msgId === m.h.msgId) {
        stat.pairs++;
        if (stat.pairs <= skipPairs) stat.skipped++;                                  // 跳过窗口之前的对，不占内存
        else if (pairs.length < maxPairs) pairs.push(makePair(pending, m));
        else { stat.droppedPairs++; warn('limit', '配对数超过上限 ' + maxPairs + '，多余的对已忽略（可把“最多载入”调大，或用“跳到第 N 对”分段查看）'); }
        pending = null;
      } else {
        stat.orphanReply++;
        warn('orphan-reply', '应答 ' + m.h.code + ' #' + m.h.msgId + ' 找不到对应的请求');
      }
    }
  }
  return {
    stat: stat, pairs: pairs, warnings: warnings, codeCounts: codeCounts,
    feed: function (line) {
      var h = parseHeader(line);
      if (h) {
        if (h.date) lastDate = h.date;
        else if (lastDate) h.date = lastDate;
        close();
        stat.headers++;
        codeCounts.set(h.code, (codeCounts.get(h.code) || 0) + 1);
        if (pending && !(h.code === repCode && h.msgId === pending.h.msgId)) {
          stat.unmatchedReq++;
          warn('no-pair', '请求 ' + pending.h.code + ' #' + pending.h.msgId + ' 的紧邻下一条不是配对应答（实际是 ' + h.code + ' #' + h.msgId + '）');
          pending = null;
        }
        var want = (h.code === reqCode || h.code === repCode);
        cur = { h: h, body: want ? [] : null, rawLines: want ? [] : null };
        return;
      }
      if (cur && cur.body) { cur.body.push(line); cur.rawLines.push(String(line).replace(/\s+$/, '')); }
    },
    finish: function () {
      close();
      if (pending) {
        stat.unmatchedReq++;
        warn('no-pair', '请求 ' + pending.h.code + ' #' + pending.h.msgId + ' 到日志结束都没有等到应答');
        pending = null;
      }
      return pairs;
    }
  };
}

// 轻量检测：统计日志里所有“相邻且 messageID 相同”的消息对
function createPairDetector() {
  var counts = new Map(), prev = null, total = 0;
  var codeStats = new Map();     // code -> { count, dirs: Map(方向 -> 次数) }
  return {
    counts: counts, codeStats: codeStats,
    feed: function (line) {
      var h = parseHeader(line);
      if (!h) return;
      total++;
      var cs = codeStats.get(h.code);
      if (!cs) { cs = { count: 0, dirs: new Map() }; codeStats.set(h.code, cs); }
      cs.count++;
      cs.dirs.set(h.dir, (cs.dirs.get(h.dir) || 0) + 1);
      if (prev && prev.msgId === h.msgId && prev.code !== h.code) {
        var key = prev.code + '->' + h.code;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      prev = h;
    },
    finish: function () { return counts; },
    messagesSeen: function () { return total; }
  };
}

// 是否符合 F+1 的请求/应答约定（仅用于提示，不影响解析）
function isReplyConvention(reqCode, repCode) {
  var a = /^S(\d+)F(\d+)$/.exec(reqCode), b = /^S(\d+)F(\d+)$/.exec(repCode);
  if (!a || !b) return false;
  return a[1] === b[1] && (parseInt(b[2], 10) === parseInt(a[2], 10) + 1);
}

export {
  parseHeader,
  parseBody,
  flattenPairs,
  nodeText,
  parseNameTable,
  parseEcidCfg,
  lookupName,
  lookupEcid,
  guessTableRole,
  defaultRoleForCode,
  nameResolver,
  buildRows,
  buildPivot,
  pairSeconds,
  inferDayBase,
  fmtSeconds,
  pad2,
  collectSeries,
  downsampleMinMax,
  niceScale,
  fmtNum,
  createCollector,
  createPairDetector,
  isReplyConvention,
  SECS_HEADER_RE,
  ITEM_RE,
  HEADER_ONLY
};
