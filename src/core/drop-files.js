/* drop-files.js —— 拖进来的可能是文件，也可能是整个文件夹，这里统一展开成 File[] */

export async function filesFromDataTransfer(dataTransfer) {
  const items = dataTransfer && dataTransfer.items;
  const out = [];
  if (items && items.length && items[0].webkitGetAsEntry) {
    const entries = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    for (const entry of entries) await walkEntry(entry, out);
    return out;
  }
  if (dataTransfer && dataTransfer.files) return Array.from(dataTransfer.files);
  return out;
}

export async function walkEntry(entry, out) {
  if (entry.isFile) {
    await new Promise((resolve) => {
      entry.file((file) => {
        try { file.webkitRelativePath = entry.fullPath || file.name; } catch { /* 只读属性，忽略 */ }
        out.push(file);
        resolve();
      }, () => resolve());
    });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch = [];
    const all = [];
    do {
      batch = await new Promise((resolve) => {
        reader.readEntries((r) => resolve(r), () => resolve([]));
      });
      all.push(...batch);
    } while (batch.length);
    for (const child of all) await walkEntry(child, out);
  }
}

export function filesFromInputEvent(event) {
  const list = event.target.files;
  const out = list ? Array.from(list) : [];
  event.target.value = '';        // 允许同一个文件连续选两次
  return out;
}
