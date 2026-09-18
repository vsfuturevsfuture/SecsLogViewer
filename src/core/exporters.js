/* exporters.js —— 导出/复制的小工具（CSV 带 BOM，Excel 打开不乱码） */

export function toCSV(head, body) {
  const q = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '\ufeff' + [head.map(q).join(',')]
    .concat(body.map((row) => row.map(q).join(',')))
    .join('\r\n');
}

export function toTSV(head, body) {
  return [head.join('\t')]
    .concat(body.map((row) => row.map((v) => String(v == null ? '' : v).replace(/[\t\r\n]/g, ' ')).join('\t')))
    .join('\r\n');
}

export function download(text, filename, mime) {
  const blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
