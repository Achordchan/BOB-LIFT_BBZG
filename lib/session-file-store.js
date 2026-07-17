const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 轻量 session 文件存储：避免 express-session 默认 MemoryStore 在多进程/重启后丢会话。
 * 兼容 express-session Store 接口（get/set/destroy/touch）。
 * set/touch 按 sid 串行，临时文件带随机后缀，避免同毫秒 rename ENOENT。
 */
function createFileSessionStore(session, options = {}) {
  const Store = session.Store;
  const ttlSec = Number(options.ttl || 3600);
  const dir = String(options.path || path.join(process.cwd(), 'storage', 'sessions'));

  class FileSessionStore extends Store {
    constructor(opts = {}) {
      super(opts);
      this.ttl = Number(opts.ttl || ttlSec);
      this.path = String(opts.path || dir);
      this._queues = new Map();
      fs.mkdirSync(this.path, { recursive: true });
    }

    _file(sid) {
      const safe = String(sid || '').replace(/[^a-zA-Z0-9._-]/g, '_');
      return path.join(this.path, `${safe}.json`);
    }

    _withSidLock(sid, fn) {
      const key = String(sid || '');
      const previous = this._queues.get(key) || Promise.resolve();
      const current = previous.catch(() => {}).then(fn);
      // 必须把“存入 Map 的 Promise”与 finally 清理比较的对象设为同一个
      const queued = current.finally(() => {
        if (this._queues.get(key) === queued) {
          this._queues.delete(key);
        }
      });
      this._queues.set(key, queued);
      return current;
    }

    get(sid, cb) {
      const file = this._file(sid);
      fs.readFile(file, 'utf8', (err, raw) => {
        if (err) {
          if (err.code === 'ENOENT') return cb(null, null);
          return cb(err);
        }
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.expires && Date.now() > Number(parsed.expires)) {
            fs.unlink(file, () => cb(null, null));
            return;
          }
          return cb(null, parsed && parsed.session ? parsed.session : null);
        } catch (error) {
          return cb(error);
        }
      });
    }

    set(sid, sessionData, cb) {
      this._withSidLock(sid, () => new Promise((resolve) => {
        const file = this._file(sid);
        const maxAge = sessionData && sessionData.cookie && sessionData.cookie.maxAge
          ? Number(sessionData.cookie.maxAge)
          : this.ttl * 1000;
        const payload = {
          expires: Date.now() + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge : this.ttl * 1000),
          session: sessionData
        };
        const tmp = `${file}.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString('hex')}.tmp`;
        fs.writeFile(tmp, JSON.stringify(payload), 'utf8', (err) => {
          if (err) {
            if (cb) cb(err);
            resolve();
            return;
          }
          fs.rename(tmp, file, (renameErr) => {
            if (renameErr) {
              fs.unlink(tmp, () => {});
              if (cb) cb(renameErr);
              resolve();
              return;
            }
            if (cb) cb(null);
            resolve();
          });
        });
      }));
    }

    destroy(sid, cb) {
      this._withSidLock(sid, () => new Promise((resolve) => {
        fs.unlink(this._file(sid), (err) => {
          if (err && err.code !== 'ENOENT') {
            if (cb) cb(err);
            resolve();
            return;
          }
          if (cb) cb(null);
          resolve();
        });
      }));
    }

    touch(sid, sessionData, cb) {
      this.set(sid, sessionData, cb);
    }

    // 启动或定时清理过期 session 文件
    purgeExpired(cb) {
      fs.readdir(this.path, (err, files) => {
        if (err) {
          if (cb) cb(err);
          return;
        }
        let pending = 0;
        let firstErr = null;
        const doneOne = (e) => {
          if (e && !firstErr) firstErr = e;
          pending -= 1;
          if (pending <= 0 && cb) cb(firstErr);
        };
        const now = Date.now();
        for (const name of files || []) {
          if (!name.endsWith('.json')) continue;
          pending += 1;
          const full = path.join(this.path, name);
          fs.readFile(full, 'utf8', (readErr, raw) => {
            if (readErr) return doneOne(readErr);
            try {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.expires && now > Number(parsed.expires)) {
                fs.unlink(full, () => doneOne(null));
                return;
              }
              doneOne(null);
            } catch (parseErr) {
              // 损坏文件直接删除
              fs.unlink(full, () => doneOne(null));
            }
          });
        }
        if (pending === 0 && cb) cb(null);
      });
    }
  }

  return FileSessionStore;
}

module.exports = {
  createFileSessionStore
};
