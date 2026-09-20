const { pipeline } = require('stream/promises');
const { createBilibiliClient, assertMp3Response } = require('../lib/bilibili-client');
const { createRateLimiter } = require('../lib/rate-limit');
const { registerBilibiliAuthRoutes } = require('./bilibili-auth');
const { getClientIp } = require('../lib/request-ip');

function registerBilibiliMusicRoutes(app, options = {}) {
  const client = options.client || createBilibiliClient();
  const limiter = createRateLimiter({ max: 90, windowMs: 60000 });
  let activeStreams = 0;
  const prefix = '/api/public/music/bilibili';
  app.use(prefix, (req, res, next) => {
    if (!req.session?.loggedIn && !req.session?.eggUserId) return res.status(401).json({ success: false, message: '请先登录' });
    if (!limiter.hit(getClientIp(req)).allowed) return res.status(429).json({ success: false, message: '请求过于频繁，请稍后重试' });
    next();
  });
  const fail = (res, error) => {
    if (!res.headersSent) res.status(error.status || 502).json({ success: false, message: error.message });
    else res.destroy();
  };
  app.get(`${prefix}/search`, async (req, res) => {
    try {
      const keyword = String(req.query.keywords || '').trim();
      const page = Number(req.query.page || 1);
      if (!keyword || keyword.length > 200 || !Number.isInteger(page) || page < 1 || page > 50) {
        return res.status(400).json({ success: false, message: '请输入关键词，页码范围为 1–50' });
      }
      const songs = await client.search(keyword, page);
      // 上游会过滤无效条目，非满页不代表结束；以空页或平台页码上限结束。
      res.json({ success: true, songs, page, hasMore: songs.length > 0 && page < 50 });
    } catch (error) { fail(res, error); }
  });
  for (const action of ['stream', 'download', 'image']) {
    app.get(`${prefix}/${action}`, async (req, res) => {
      if (activeStreams >= 8) return res.status(429).json({ success: false, message: '音频服务繁忙，请稍后重试' });
      activeStreams += 1;
      let upstream;
      const close = () => upstream?.data.destroy();
      res.once('close', close);
      try {
        const url = action === 'image' ? client.imageUrl(String(req.query.url || '')) : await client.resolve(req.query.id);
        if (res.destroyed) return;
        upstream = await client.stream(url, action === 'stream' ? req.headers.range : undefined);
        if (res.destroyed) { close(); return; }
        if (![200, 206, 416].includes(upstream.status)) {
          close();
          throw new Error('哔哩哔哩资源暂时无法读取');
        }
        if (action !== 'image' && upstream.status !== 416) assertMp3Response(upstream);
        res.status(upstream.status);
        for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
          if (upstream.headers[key]) res.setHeader(key, upstream.headers[key]);
        }
        res.setHeader('Cache-Control', 'private, no-store');
        if (action === 'download') {
          const name = String(req.query.name || req.query.id).replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 100);
          res.setHeader('Content-Disposition', `attachment; filename="audio.mp3"; filename*=UTF-8''${encodeURIComponent(name)}.mp3`);
        }
        await pipeline(upstream.data, res);
      } catch (error) { fail(res, error); }
      finally { activeStreams -= 1; res.off('close', close); close(); }
    });
  }
  registerBilibiliAuthRoutes(app, client, options);
}
module.exports = { registerBilibiliMusicRoutes };
