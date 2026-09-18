/* file-reader.js —— 把 File 变成一行行文本（供解析器消费）
 *
 * 要点：
 *  - 40MB+ 的日志用 stream 分块读，边读边喂给解析器，内存占用小；
 *  - 自动识别编码：先按 UTF-8 严格解码试一段，失败就退回 GBK（老设备日志常见）；
 *  - 没有 Blob.stream() 的环境（比如单元测试用的 jsdom）走 arrayBuffer/FileReader 兜底。
 */

const CHUNK_PROBE = 256 * 1024;

export function makeDecoder(firstBytes) {
  const probe = firstBytes.length > 8 ? firstBytes.subarray(0, firstBytes.length - 4) : firstBytes;
  let encoding = 'utf-8';
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(probe);
  } catch {
    encoding = 'gbk';       // 解不出来就按 GBK 处理
  }
  return { encoding, decoder: new TextDecoder(encoding) };
}

function emitLines(text, carry, onLine) {
  const parts = (carry + text).split('\n');
  const rest = parts.pop();
  for (const raw of parts) onLine(raw.endsWith('\r') ? raw.slice(0, -1) : raw);
  return rest;
}

export async function streamFileLines(file, { onLine, onBytes, shouldCancel }) {
  // ① 首选：流式读取
  if (typeof file.stream === 'function') {
    const reader = file.stream().getReader();
    let first = true, box = null, carry = '', read = 0;
    try {
      for (;;) {
        if (shouldCancel && shouldCancel()) {
          try { await reader.cancel(); } catch { /* 忽略 */ }
          return { encoding: box ? box.encoding : 'utf-8', bytes: read };
        }
        const { value, done } = await reader.read();
        if (done) break;
        read += value.byteLength;
        if (first) { box = makeDecoder(value.subarray(0, Math.min(value.byteLength, CHUNK_PROBE))); first = false; }
        carry = emitLines(box.decoder.decode(value, { stream: true }), carry, onLine);
        if (onBytes) onBytes(read);
      }
      const tail = carry + (box ? box.decoder.decode() : '');
      if (tail !== '') onLine(tail.endsWith('\r') ? tail.slice(0, -1) : tail);
      return { encoding: box ? box.encoding : 'utf-8', bytes: read };
    } finally {
      try { reader.releaseLock(); } catch { /* 忽略 */ }
    }
  }

  // ② 兜底：一次性读进来（测试环境 / 老浏览器）
  const buffer = await readAll(file);
  const bytes = new Uint8Array(buffer);
  const box = makeDecoder(bytes.subarray(0, Math.min(bytes.length, CHUNK_PROBE)));
  let carry = '';
  const text = box.decoder.decode(bytes);
  carry = emitLines(text, '', onLine);
  if (carry !== '') onLine(carry);
  if (onBytes) onBytes(bytes.length);
  return { encoding: box.encoding, bytes: bytes.length };
}

function readAll(file) {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(file);
  });
}

/** 读小文件（.cfg / .csv）为文本：老环境里 Blob.text() 可能没有，退回 FileReader */
export function readFileText(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file);
  });
}
