const fs = require('fs');
const path = require('path');

const shouldProfileDataIo = process.env.BBZG_PROFILE_DATA_IO === '1';
const writeLocks = new Map();
const syncBusy = new Map();

function ensureRevision(data) {
  if (!data || typeof data !== 'object') return data;
  if (!Number.isFinite(Number(data.__revision))) {
    data.__revision = 0;
  }
  return data;
}

function getData(dataPath) {
  if (shouldProfileDataIo) console.time('数据读取时间');
  const raw = fs.readFileSync(dataPath, 'utf8');
  const result = ensureRevision(JSON.parse(raw));
  if (shouldProfileDataIo) console.timeEnd('数据读取时间');
  return result;
}

function writeAtomically(dataPath, data) {
  const dir = path.dirname(dataPath);
  const base = path.basename(dataPath);
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  const payload = JSON.stringify(data);
  fs.writeFileSync(tmpPath, payload, { encoding: 'utf8' });
  try {
    const fd = fs.openSync(tmpPath, 'r+');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // 部分环境不支持 fsync，继续原子重命名
  }
  fs.renameSync(tmpPath, dataPath);
}

function withWriteLock(dataPath, fn) {
  const previous = writeLocks.get(dataPath) || Promise.resolve();
  // 链式 Promise 与 Map 清理必须用同一对象，否则异步 API 永不释放
  let resolveResult;
  let rejectResult;
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const queued = previous
    .catch(() => {})
    .then(() => Promise.resolve().then(fn))
    .then((value) => {
      resolveResult(value);
      return value;
    }, (error) => {
      rejectResult(error);
      throw error;
    })
    .finally(() => {
      if (writeLocks.get(dataPath) === queued) {
        writeLocks.delete(dataPath);
      }
    });
  writeLocks.set(dataPath, queued);
  return result;
}

function saveData(dataPath, data) {
  if (shouldProfileDataIo) console.time('数据保存时间');
  return withWriteLock(dataPath, () => {
    try {
      ensureRevision(data);
      data.__revision = Number(data.__revision || 0) + 1;
      data.__updatedAt = new Date().toISOString();
      writeAtomically(dataPath, data);
      if (shouldProfileDataIo) console.timeEnd('数据保存时间');
      return true;
    } catch (error) {
      console.error('保存数据失败:', error);
      if (shouldProfileDataIo) console.timeEnd('数据保存时间');
      return false;
    }
  });
}

/**
 * 串行更新：进入写锁后重新读取最新数据，再执行 mutator 并写回。
 * mutator 可返回 false 表示取消写入。
 */
function updateData(dataPath, mutator) {
  return withWriteLock(dataPath, () => {
    try {
      if (shouldProfileDataIo) console.time('数据更新时间');
      const latest = getData(dataPath);
      const expectedRevision = Number(latest.__revision || 0);
      const result = typeof mutator === 'function' ? mutator(latest) : undefined;
      if (result === false) {
        if (shouldProfileDataIo) console.timeEnd('数据更新时间');
        return { ok: false, cancelled: true, data: latest };
      }
      const next = result && typeof result === 'object' ? result : latest;
      ensureRevision(next);
      next.__revision = expectedRevision + 1;
      next.__updatedAt = new Date().toISOString();
      writeAtomically(dataPath, next);
      if (shouldProfileDataIo) console.timeEnd('数据更新时间');
      return { ok: true, cancelled: false, data: next };
    } catch (error) {
      console.error('更新数据失败:', error);
      if (shouldProfileDataIo) console.timeEnd('数据更新时间');
      return { ok: false, cancelled: false, error, data: null };
    }
  });
}

// 同步 API 兼容现有调用：在锁链中执行同步写
function saveDataCompat(dataPath, data) {
  while (syncBusy.get(dataPath)) {
    // busy-wait 极短；Node 单线程下主要用于 await 后的交错路径
  }
  syncBusy.set(dataPath, true);
  try {
    if (shouldProfileDataIo) console.time('数据保存时间');
    try {
      if (fs.existsSync(dataPath)) {
        const disk = getData(dataPath);
        const diskRev = Number(disk && disk.__revision) || 0;
        const incomingRev = Number(data && data.__revision) || 0;
        if (diskRev > incomingRev) {
          console.error(`保存数据被拒绝：磁盘 revision=${diskRev} > 入参 revision=${incomingRev}`);
          if (shouldProfileDataIo) console.timeEnd('数据保存时间');
          return false;
        }
      }
    } catch (checkError) {
      console.error('保存前 revision 检查失败，继续写入:', checkError);
    }
    ensureRevision(data);
    data.__revision = Number(data.__revision || 0) + 1;
    data.__updatedAt = new Date().toISOString();
    writeAtomically(dataPath, data);
    if (shouldProfileDataIo) console.timeEnd('数据保存时间');
    return true;
  } catch (error) {
    console.error('保存数据失败:', error);
    if (shouldProfileDataIo) console.timeEnd('数据保存时间');
    return false;
  } finally {
    syncBusy.delete(dataPath);
  }
}

function updateDataSync(dataPath, mutator) {
  while (syncBusy.get(dataPath)) {}
  syncBusy.set(dataPath, true);
  try {
    if (shouldProfileDataIo) console.time('数据更新时间');
    const latest = getData(dataPath);
    const expectedRevision = Number(latest.__revision || 0);
    const result = typeof mutator === 'function' ? mutator(latest) : undefined;
    if (result === false) {
      if (shouldProfileDataIo) console.timeEnd('数据更新时间');
      return { ok: false, cancelled: true, data: latest };
    }
    const next = result && typeof result === 'object' ? result : latest;
    ensureRevision(next);
    next.__revision = expectedRevision + 1;
    next.__updatedAt = new Date().toISOString();
    writeAtomically(dataPath, next);
    if (shouldProfileDataIo) console.timeEnd('数据更新时间');
    return { ok: true, cancelled: false, data: next };
  } catch (error) {
    console.error('同步更新数据失败:', error);
    if (shouldProfileDataIo) console.timeEnd('数据更新时间');
    return { ok: false, cancelled: false, error, data: null };
  } finally {
    syncBusy.delete(dataPath);
  }
}

module.exports = {
  getData,
  saveData: saveDataCompat,
  saveDataAsync: saveData,
  updateData,
  updateDataSync,
  ensureRevision
};
