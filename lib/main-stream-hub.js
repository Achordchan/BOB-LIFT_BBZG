const fs = require('fs');

function createMainStreamHub(deps) {
  const { getData, dataPath } = deps || {};
  const clients = new Set();
  let watcherStarted = false;
  let lastWatchBroadcastAt = 0;
  let lastDirectBroadcastAt = 0;

  function normalizeLatestDeal(latestDealRaw) {
    if (!latestDealRaw || typeof latestDealRaw !== 'object') {
      return null;
    }

    const latestDeal = {};

    if (latestDealRaw.announcement) {
      latestDeal.announcement = String(latestDealRaw.announcement).replace(/\s+/g, ' ').trim();
    } else {
      latestDeal.announcement = '';
    }

    if (latestDealRaw.musicToPlay && typeof latestDealRaw.musicToPlay === 'object') {
      latestDeal.musicToPlay = {
        ...latestDealRaw.musicToPlay,
        userName: latestDealRaw.musicToPlay.userName
          ? String(latestDealRaw.musicToPlay.userName).replace(/\s+/g, ' ').trim()
          : latestDealRaw.musicToPlay.userName,
        userPosition: latestDealRaw.musicToPlay.userPosition
          ? String(latestDealRaw.musicToPlay.userPosition).replace(/\s+/g, ' ').trim()
          : latestDealRaw.musicToPlay.userPosition
      };
    }

    if (latestDealRaw.person) {
      latestDeal.person = String(latestDealRaw.person).replace(/\s+/g, ' ').trim();
    }

    if (latestDealRaw.platform) {
      latestDeal.platform = String(latestDealRaw.platform).replace(/\s+/g, ' ').trim();
    }

    return latestDeal;
  }

  function buildDashboard(data) {
    const latestInquiry = data.latestInquiry && typeof data.latestInquiry === 'object' ? data.latestInquiry : null;
    const latestDeal = normalizeLatestDeal(data.latestDeal);

    return {
      inquiryCount: typeof data.inquiryCount === 'number' ? data.inquiryCount : 0,
      dealAmount: typeof data.dealAmount === 'number' ? data.dealAmount : 0,
      latestInquiry,
      latestDeal
    };
  }

  function buildRecentActivity(data) {
    const recentActivity = [];

    if (Array.isArray(data.inquiriesHistory)) {
      const processedTimestamps = new Set();
      data.inquiriesHistory.forEach((inquiry) => {
        if (!inquiry || processedTimestamps.has(inquiry.timestamp)) return;
        processedTimestamps.add(inquiry.timestamp);
        recentActivity.push({
          type: 'inquiry',
          action: inquiry.type,
          timestamp: inquiry.timestamp,
          count: inquiry.count
        });
      });
    }

    if (Array.isArray(data.dealsHistory)) {
      data.dealsHistory.forEach((deal) => {
        if (!deal) return;
        recentActivity.push({
          type: 'deal',
          person: deal.person,
          platform: deal.platform,
          amount: deal.amount,
          timestamp: deal.timestamp
        });
      });
    }

    recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return recentActivity.slice(0, 20);
  }

  function buildPlatformDisplaySettings(data) {
    const settings = data.platformDisplaySettings;
    if (!settings || typeof settings !== 'object') {
      return {
        showPlatformTargets: false,
        autoScroll: true,
        scrollInterval: 3000
      };
    }

    return {
      showPlatformTargets: Boolean(settings.showPlatformTargets),
      autoScroll: settings.autoScroll !== false,
      scrollInterval: Number.isFinite(Number(settings.scrollInterval)) ? Number(settings.scrollInterval) : 3000,
      ...(settings.updatedAt ? { updatedAt: settings.updatedAt } : {})
    };
  }

  function buildPersonalizedFire(data) {
    const ev = data.personalizedFire;
    if (!ev || !ev.id || !ev.audioPath) return null;
    return {
      id: ev.id,
      audioPath: ev.audioPath,
      firedAt: ev.firedAt
    };
  }

  function buildPlatformTargets(data) {
    if (!Array.isArray(data.platformTargets)) return [];
    return data.platformTargets.map((platform) => {
      const target = Number(platform && platform.target) || 0;
      const current = Number(platform && platform.current) || 0;
      const percentage = target > 0 ? Math.round((current / target) * 100) : 0;
      return {
        ...platform,
        target,
        current,
        percentage
      };
    });
  }

  function buildSnapshotFromData(data) {
    if (!data || typeof data !== 'object') {
      return {
        dashboard: { inquiryCount: 0, dealAmount: 0, latestInquiry: null, latestDeal: null },
        recentActivity: [],
        platformDisplaySettings: { showPlatformTargets: false, autoScroll: true, scrollInterval: 3000 },
        personalizedFire: null
      };
    }

    return {
      dashboard: buildDashboard(data),
      recentActivity: buildRecentActivity(data),
      platformDisplaySettings: buildPlatformDisplaySettings(data),
      personalizedFire: buildPersonalizedFire(data),
      platformTargets: buildPlatformTargets(data)
    };
  }

  function buildSnapshot() {
    if (typeof getData !== 'function') {
      return buildSnapshotFromData(null);
    }
    const data = getData();
    return buildSnapshotFromData(data);
  }

  function writeSse(res, event, payload) {
    if (event) {
      res.write(`event: ${event}\n`);
    }
    if (payload !== undefined) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } else {
      res.write('\n');
    }
  }

  function writeSnapshot(res, payload) {
    // 同时发送自定义事件与默认message，提升对部分浏览器SSE实现的兼容性
    writeSse(res, 'snapshot', payload);
    writeSse(res, null, payload);
  }

  function closeClient(client) {
    if (!client || client.closed) return;
    client.closed = true;
    if (client.heartbeatTimer) {
      clearInterval(client.heartbeatTimer);
    }
    clients.delete(client);
  }

  function broadcastSnapshot(reason, dataHint) {
    if (clients.size === 0) return;

    let snapshot;
    try {
      if (dataHint && typeof dataHint === 'object') {
        snapshot = buildSnapshotFromData(dataHint);
      } else {
        snapshot = buildSnapshot();
      }
    } catch (error) {
      console.error('构建main stream snapshot失败:', error);
      return;
    }

    const payload = {
      success: true,
      reason: reason || 'update',
      snapshot,
      ts: new Date().toISOString()
    };

    if (reason === 'saveData') {
      lastDirectBroadcastAt = Date.now();
    }

    console.log(`[SSE] broadcast snapshot reason=${payload.reason} clients=${clients.size}`);

    Array.from(clients).forEach((client) => {
      try {
        writeSnapshot(client.res, payload);
      } catch (error) {
        closeClient(client);
      }
    });
  }

  function startDataFileWatcher() {
    if (watcherStarted) return;
    if (!dataPath || typeof dataPath !== 'string') return;
    if (!fs.existsSync(dataPath)) return;

    watcherStarted = true;

    fs.watchFile(dataPath, { interval: 500 }, (curr, prev) => {
      if (!curr || !prev) return;
      if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size) return;
      if (clients.size === 0) return;

      const now = Date.now();
      // saveData 已主动广播；文件监控回调会紧随触发，避免重复推送。
      if (now - lastDirectBroadcastAt < 1200) return;
      if (now - lastWatchBroadcastAt < 200) return;
      lastWatchBroadcastAt = now;

      broadcastSnapshot('data-file-change');
    });
  }

  function registerRoutes(app) {
    startDataFileWatcher();

    app.get('/api/stream/main', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      const client = {
        res,
        closed: false,
        heartbeatTimer: null
      };

      clients.add(client);
      console.log(`[SSE] client connected, total=${clients.size}`);

      client.heartbeatTimer = setInterval(() => {
        try {
          res.write(': heartbeat\n\n');
        } catch (error) {
          closeClient(client);
        }
      }, 20000);

      try {
        writeSnapshot(res, {
          success: true,
          reason: 'init',
          snapshot: buildSnapshot(),
          ts: new Date().toISOString()
        });
      } catch (error) {
        closeClient(client);
        return;
      }

      const onClose = () => {
        closeClient(client);
        console.log(`[SSE] client disconnected, total=${clients.size}`);
      };

      req.on('close', onClose);
      req.on('aborted', onClose);
      res.on('close', onClose);
    });
  }

  return {
    registerRoutes,
    buildSnapshot,
    broadcastSnapshot
  };
}

module.exports = {
  createMainStreamHub
};
