const os = require('os');
const fs = require('fs');
const path = require('path');

function parseSessionFile(sid, filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.expires && Date.now() > Number(parsed.expires)) return null;
    const session = parsed.session || {};
    if (!session.loggedIn) return null;
    return {
      sid,
      username: session.adminUsername || 'admin',
      loginAt: session.loginAt || null,
      loginIp: session.loginIp || null,
      loginUserAgent: session.loginUserAgent || null,
      expiresAt: parsed.expires ? new Date(Number(parsed.expires)).toISOString() : null
    };
  } catch {
    return null;
  }
}

function registerSystemStatusRoutes(app, deps) {
  const { getData, dataPath, getMainStreamHub, sessionStore } = deps || {};
  const sessionDir = String((deps && deps.sessionDir) || path.join(process.cwd(), 'storage', 'sessions'));

  function listActiveSessions() {
    if (!fs.existsSync(sessionDir)) return [];
    return fs.readdirSync(sessionDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const sid = file.slice(0, -5);
        return parseSessionFile(sid, path.join(sessionDir, file));
      })
      .filter(Boolean);
  }

  app.get('/api/system/status', (req, res) => {
    if (!req.session || !req.session.loggedIn) {
      return res.status(401).json({ success: false, message: '未授权访问' });
    }

    const status = {
      success: true,
      timestamp: new Date().toISOString()
    };

    status.process = {
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid
    };

    // 进度条用 V8 堆使用率（heapUsed/heapTotal）：这是真正反映内存压力的指标。
    // RSS/系统总内存 会被 OS 磁盘缓存等无关占用干扰（尤其在 macOS/Linux 上空闲内存常年偏低），不适合作为健康指标。
    const memUsage = process.memoryUsage();
    status.memory = {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      usagePercent: memUsage.heapTotal > 0 ? Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100) : 0
    };

    const loadAvg = os.loadavg();
    status.cpu = {
      cores: os.cpus().length,
      loadAvg1min: loadAvg[0],
      loadAvg5min: loadAvg[1],
      loadAvg15min: loadAvg[2]
    };

    try {
      if (dataPath && typeof dataPath === 'string' && fs.existsSync(dataPath)) {
        const stat = fs.statSync(dataPath);
        status.dataFile = { exists: true, size: stat.size, mtime: stat.mtime, readable: true };
        if (typeof getData === 'function') {
          try {
            const data = getData();
            status.dataFile.valid = !!(data && typeof data === 'object');
            status.dataFile.recordCount = {
              users: Array.isArray(data.users) ? data.users.length : 0,
              music: Array.isArray(data.music) ? data.music.length : 0,
              platforms: Array.isArray(data.platformTargets) ? data.platformTargets.length : 0,
              dealsLedger: Array.isArray(data.dealsLedger) ? data.dealsLedger.length : 0
            };
          } catch { status.dataFile.valid = false; }
        }
      } else {
        status.dataFile = { exists: false, readable: false };
      }
    } catch (error) {
      status.dataFile = { exists: false, error: error.message };
    }

    try {
      status.sessions = { count: listActiveSessions().length };
    } catch (error) {
      status.sessions = { count: 0, error: error.message };
    }

    if (typeof getMainStreamHub === 'function') {
      try {
        const hub = getMainStreamHub();
        if (hub && typeof hub.getClientCount === 'function') {
          status.sse = { clients: hub.getClientCount() };
        }
      } catch {
        status.sse = { clients: 0 };
      }
    }

    const musicApiBase = process.env.BBZG_MUSIC_API_BASE || 'http://127.0.0.1:5000';
    status.externalServices = {
      musicApi: { baseUrl: musicApiBase, configured: true }
    };

    res.json(status);
  });

  // 会话列表
  app.get('/api/admin/sessions', (req, res) => {
    if (!req.session || !req.session.loggedIn) {
      return res.status(401).json({ success: false, message: '未授权访问' });
    }
    const currentSid = req.sessionID;
    try {
      const sessions = listActiveSessions();
      sessions.forEach(info => { info.isCurrent = info.sid === currentSid; });
      sessions.sort((a, b) => {
        if (a.isCurrent) return -1;
        if (b.isCurrent) return 1;
        return (b.expiresAt || '').localeCompare(a.expiresAt || '');
      });
      res.json({ success: true, sessions });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message || '获取会话列表失败' });
    }
  });

  // 删除会话
  app.delete('/api/admin/sessions/:sid', (req, res) => {
    if (!req.session || !req.session.loggedIn) {
      return res.status(401).json({ success: false, message: '未授权访问' });
    }
    // 只允许安全字符，防止路径穿越
    const sid = String(req.params.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
    if (!sid) {
      return res.status(400).json({ success: false, message: '无效的会话 ID' });
    }
    if (sid === req.sessionID) {
      return res.status(400).json({ success: false, message: '不能删除当前登录会话' });
    }
    const filePath = path.join(sessionDir, `${sid}.json`);
    // 确保路径在 SESSION_DIR 内
    if (!filePath.startsWith(sessionDir + path.sep)) {
      return res.status(400).json({ success: false, message: '无效路径' });
    }
    try {
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: '会话不存在或已过期' });
      }
      if (sessionStore && typeof sessionStore.destroy === 'function') {
        sessionStore.destroy(sid, (error) => {
          if (error) {
            res.status(500).json({ success: false, message: error.message || '删除失败' });
            return;
          }
          res.json({ success: true, message: '会话已删除' });
        });
        return;
      }
      fs.unlinkSync(filePath);
      res.json({ success: true, message: '会话已删除' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message || '删除失败' });
    }
  });
}

module.exports = { registerSystemStatusRoutes };
