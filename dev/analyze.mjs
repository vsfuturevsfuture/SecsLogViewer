// One-off analysis of the real SECS log to pin down the exact structure.
import fs from 'node:fs';

const LOG = 'C:\\Users\\17140\\Desktop\\sesloftool\\2026917_SW_LOG\\Fa\\Fa\\LogSecslog\\2026-09-17\\2026-09-17.txt';

const text = fs.readFileSync(LOG, 'utf8');
console.log('file bytes:', fs.statSync(LOG).size);
console.log('CRLF count:', (text.match(/\r\n/g) || []).length, 'bare LF:', (text.match(/(?<!\r)\n/g) || []).length);
console.log('non-ascii chars:', (text.match(/[^\x00-\x7F]/g) || []).length);

const lines = text.split(/\r?\n/);
console.log('total lines:', lines.length);

const headerRe = /(\d{2}:\d{2}:\d{2}\.\d{3})\s+(S\d+F\d+)\s+\[([^\]]*?),\s*(\d+)\]/;

const codes = new Map();
const dirs = new Set();
const msgs = [];
let orphanItemLines = 0;
const itemLineRe = /^\s*<([A-Za-z0-9]+)\[(\d+)\]/;
const itemTags = new Map();
let bodyLineShapes = new Map();
let headerNoise = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = headerRe.exec(line);
  if (m) {
    const before = line.slice(0, m.index);
    const after = line.slice(m.index + m[0].length);
    if (/S\d+F\d+/.test(before) || after.trim() !== '') headerNoise++;
    codes.set(m[2], (codes.get(m[2]) || 0) + 1);
    dirs.add(m[3]);
    msgs.push({ line: i + 1, ts: m[1], code: m[2], dir: m[3], id: m[4], body: [] });
    continue;
  }
  const cur = msgs[msgs.length - 1];
  const im = itemLineRe.exec(line);
  if (im) {
    itemTags.set(im[1], (itemTags.get(im[1]) || 0) + 1);
    if (!cur || line.trim() === '') { /* ignore */ } else cur.body.push(line.trim());
    continue;
  }
  if (line.trim() === '' || /^\s*[<>]\s*$/.test(line)) continue;
  if (itemLineRe.test(line)) continue;
  // anything else that is not a header / item / closer
  const key = line.trim().slice(0, 40);
  bodyLineShapes.set(key, (bodyLineShapes.get(key) || 0) + 1);
  if (/^\s*</.test(line)) orphanItemLines++;
}

console.log('header-noise lines:', headerNoise);
console.log('codes:', [...codes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40));
console.log('directions:', [...dirs]);
console.log('item tags:', [...itemTags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30));
console.log('non item/header lines:', [...bodyLineShapes.entries()].slice(0, 30));

// pairing analysis for S2F13 / S2F14
let pairs = 0, sameIdGap1 = 0, gaps = new Map(), idMismatch = 0, unmatchedReq = 0;
let lenMismatch = 0, lenSamples = [];
for (let i = 0; i < msgs.length; i++) {
  const a = msgs[i];
  if (a.code !== 'S2F13') continue;
  const b = msgs[i + 1];
  if (!b || b.code !== 'S2F14') { unmatchedReq++; continue; }
  const gap = b.line - a.line;
  gaps.set(gap, (gaps.get(gap) || 0) + 1);
  if (b.id === a.id) { sameIdGap1++; pairs++; } else { idMismatch++; }
  const la = /<L\[(\d+)\]/.exec(a.body[0] || '');
  const lb = /<L\[(\d+)\]/.exec(b.body[0] || '');
  if (!la || !lb || la[1] !== lb[1]) {
    lenMismatch++;
    if (lenSamples.length < 5) lenSamples.push([a.ts, a.id, la && la[1], lb && lb[1]]);
  }
}
console.log({ s2f13: codes.get('S2F13'), s2f14: codes.get('S2F14'), pairs, sameIdGap1, idMismatch, unmatchedReq, lenMismatch });
console.log('gap distribution:', [...gaps.entries()].sort((a, b) => a[0] - b[0]).slice(0, 10));
console.log('len mismatch samples:', lenSamples);

// a couple of full sample pairs
const sample = msgs.filter((m) => m.code === 'S2F13' || m.code === 'S2F14').slice(0, 4);
for (const s of sample) {
  console.log('---', s.line, s.ts, s.code, s.dir, s.id, 'bodylines=' + s.body.length);
  console.log(s.body.slice(0, 3).join('\n'));
  console.log('...');
  console.log(s.body.slice(-3).join('\n'));
}
