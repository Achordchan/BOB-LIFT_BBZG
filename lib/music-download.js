const fs = require('fs');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

let activeImports = 0;
function acquireMusicImportSlot() {
  if (activeImports >= 2) throw Object.assign(new Error('已有音乐正在导入，请稍后重试'), { status: 429 });
  activeImports += 1;
  let released = false;
  return () => { if (!released) { released = true; activeImports -= 1; } };
}

// 两个导入入口共用流式大小限制，失败时先关闭文件再清理残片。
async function saveMusicStream(response, filePath, onProgress = () => {}) {
  const configuredMax = Number(process.env.BBZG_MUSIC_MAX_DOWNLOAD_BYTES);
  const maxBytes = Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : 30 * 1024 * 1024;
  const total = Number(response.headers?.['content-length']) || null;
  if (total && total > maxBytes) {
    response.data.destroy();
    throw new Error('音频文件超过导入大小限制');
  }
  let received = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) return callback(new Error('音频文件超过导入大小限制'));
      onProgress(received, total);
      callback(null, chunk);
    }
  });
  let sourceError;
  const rememberSourceError = error => { sourceError = error; };
  response.data.on('error', rememberSourceError);
  const deadline = setTimeout(() => response.data.destroy(new Error('音频下载超时')),
    Number(process.env.BBZG_MUSIC_DOWNLOAD_TIMEOUT_MS || 30000));
  let file;
  try {
    // 先取得独占文件句柄，避免 pipeline 提前失败后异步 open 才创建残片。
    file = await fs.promises.open(filePath, 'wx');
    if (sourceError) throw sourceError;
    const writer = file.createWriteStream();
    await pipeline(response.data, meter, writer);
    if (!received) throw new Error('音频文件为空');
  } catch (error) {
    response.data.destroy();
    if (file) {
      await file.close().catch(() => {});
      await fs.promises.rm(filePath, { force: true });
    }
    throw error;
  } finally {
    clearTimeout(deadline);
    response.data.off('error', rememberSourceError);
  }
}
module.exports = { saveMusicStream, acquireMusicImportSlot };
