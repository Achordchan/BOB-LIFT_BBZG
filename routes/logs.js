const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { logDir } = require('../lib/logger');

/**
 * 后台「运行日志」只读接口（仅管理员）。
 * - 只允许读取 logs 目录下形如 app-YYYY-MM-DD.log / error-YYYY-MM-DD.log 的文件；
 * - 严格校验文件名并二次校验解析路径，杜绝目录穿越；
 * - tail 只读文件尾部有限字节，避免大文件拖垮内存。
 */
function registerLogRoutes(app, deps) {
  const { requireLogin } = deps || {};
  const dir = String((deps && deps.logDir) || logDir || path.join(process.cwd(), 'logs'));
  // 覆盖 DailyRotateFile 实际产物：按天文件、按大小切割的 .N 分片、以及 zippedArchive 的 .gz
  const FILE_RE = /^(app|error)-\d{4}-\d{2}-\d{2}\.log(\.\d+)?(\.gz)?$/;
  const MAX_TAIL_BYTES = 1024 * 1024; // 每次最多读取尾部 1MB（解压亦按此上限保留尾部）

  function listFiles() {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { return []; }
    return names
      .filter((n) => FILE_RE.test(n))
      .map((n) => {
        let size = 0;
        let mtime = null;
        try {
          const s = fs.statSync(path.join(dir, n));
          size = s.size;
          mtime = s.mtime.toISOString();
        } catch (_) { /* ignore */ }
        return {
          name: n,
          size,
          mtime,
          kind: n.startsWith('error-') ? 'error' : 'app',
          compressed: n.endsWith('.gz')
        };
      })
      // 先按修改时间倒序（最新写入的分片在前），时间相同再按文件名倒序
      .sort((a, b) => {
        const ta = a.mtime ? Date.parse(a.mtime) : 0;
        const tb = b.mtime ? Date.parse(b.mtime) : 0;
        if (ta !== tb) return tb - ta;
        return a.name < b.name ? 1 : (a.name > b.name ? -1 : 0);
      });
  }

  function safeResolve(name) {
    if (!FILE_RE.test(String(name || ''))) return null;
    const full = path.join(dir, name);
    const rel = path.relative(dir, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return full;
  }

  // 流式解压 .gz，仅保留尾部 maxBytes，避免整份解压占用内存
  function readGzipTail(full, maxBytes) {
    return new Promise((resolve, reject) => {
      let tail = '';
      let truncated = false; // 仅当确实丢弃过前部内容时，首行才可能不完整
      const stream = fs.createReadStream(full).pipe(zlib.createGunzip());
      stream.on('data', (chunk) => {
        tail += chunk.toString('utf8');
        if (tail.length > maxBytes) {
          tail = tail.slice(tail.length - maxBytes);
          truncated = true;
        }
      });
      stream.on('end', () => {
        if (!truncated) return resolve(tail);
        const nl = tail.indexOf('\n');
        resolve(nl >= 0 ? tail.slice(nl + 1) : tail); // 丢弃被截断的首行
      });
      stream.on('error', reject);
    });
  }

  function readTail(full, maxBytes) {
    const stat = fs.statSync(full);
    const start = Math.max(0, stat.size - maxBytes);
    const len = stat.size - start;
    if (len <= 0) return '';
    const fd = fs.openSync(full, 'r');
    try {
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      let text = buf.toString('utf8');
      if (start > 0) {
        const nl = text.indexOf('\n');
        if (nl >= 0) text = text.slice(nl + 1); // 丢弃可能被截断的首行
      }
      return text;
    } finally {
      fs.closeSync(fd);
    }
  }

  app.get('/api/logs/files', requireLogin, (req, res) => {
    res.json({ success: true, dir, files: listFiles() });
  });

  app.get('/api/logs/tail', requireLogin, async (req, res) => {
    const files = listFiles();
    let name = String(req.query.file || '').trim();
    if (!name) {
      const preferred = files.find((f) => f.kind === 'app') || files[0];
      name = preferred ? preferred.name : '';
    }
    const full = name ? safeResolve(name) : null;
    if (!full || !fs.existsSync(full)) {
      return res.status(404).json({ success: false, message: '日志文件不存在', files });
    }

    const lines = Math.min(2000, Math.max(1, parseInt(String(req.query.lines), 10) || 300));
    const level = String(req.query.level || '').trim().toLowerCase();
    const q = String(req.query.q || '').trim().toLowerCase();

    let raw = '';
    try {
      raw = name.endsWith('.gz')
        ? await readGzipTail(full, MAX_TAIL_BYTES)
        : readTail(full, MAX_TAIL_BYTES);
    } catch (_) {
      return res.status(500).json({ success: false, message: '读取日志失败' });
    }

    const rows = raw.split(/\r?\n/).filter(Boolean);
    const entries = rows.map((line) => {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (_) {
        parsed = { level: 'info', message: line, timestamp: '' };
      }
      const { level: lv, message, timestamp, stack, ...meta } = parsed;
      return {
        timestamp: timestamp || '',
        level: String(lv || 'info'),
        message: String(message == null ? '' : message),
        stack: stack ? String(stack) : undefined,
        meta
      };
    });

    let filtered = entries;
    if (level) filtered = filtered.filter((e) => e.level === level);
    if (q) {
      filtered = filtered.filter((e) => {
        const hay = `${e.message} ${e.stack || ''} ${JSON.stringify(e.meta)}`.toLowerCase();
        return hay.includes(q);
      });
    }
    const tail = filtered.slice(-lines);

    res.json({
      success: true,
      file: name,
      dir,
      scanned: entries.length,
      returned: tail.length,
      entries: tail
    });
  });
}

module.exports = { registerLogRoutes };
