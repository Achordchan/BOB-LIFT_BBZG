const fs = require('fs');
const path = require('path');
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
  const FILE_RE = /^(app|error)-\d{4}-\d{2}-\d{2}\.log$/;
  const MAX_TAIL_BYTES = 1024 * 1024; // 每次最多读取尾部 1MB

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
        return { name: n, size, mtime, kind: n.startsWith('error-') ? 'error' : 'app' };
      })
      // 文件名内含日期，倒序即最新在前
      .sort((a, b) => (a.name < b.name ? 1 : (a.name > b.name ? -1 : 0)));
  }

  function safeResolve(name) {
    if (!FILE_RE.test(String(name || ''))) return null;
    const full = path.join(dir, name);
    const rel = path.relative(dir, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return full;
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

  app.get('/api/logs/tail', requireLogin, (req, res) => {
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
      raw = readTail(full, MAX_TAIL_BYTES);
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
