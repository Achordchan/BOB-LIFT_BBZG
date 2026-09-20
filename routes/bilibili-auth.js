const { recordAudit } = require('../lib/audit');
const { createRateLimiter } = require('../lib/rate-limit');

function registerBilibiliAuthRoutes(app, client, options = {}) {
  const sessions = new Map();
  const limiter = createRateLimiter({ max: 10, windowMs: 60000 });
  const pollMs = options.pollMs || 3000;
  const lifetimeMs = options.lifetimeMs || 180000;
  const fail = (res, error) => res.status(error.status || 502).json({ success: false, message: error.message });
  const admin = (req, res, next) => req.session?.loggedIn
    ? next() : res.status(401).json({ success: false, message: '请先登录管理员账号' });

  function remove(id) {
    const state = sessions.get(id);
    if (!state) return;
    sessions.delete(id);
    clearTimeout(state.expiry);
    state.stop?.();
  }

  app.post('/api/bilibili/qr', admin, async (req, res) => {
    if (!limiter.hit(req.sessionID).allowed) return res.status(429).json({ success: false, message: '操作频繁，请稍后重试' });
    if (!sessions.has(req.sessionID) && sessions.size >= 100) return res.status(503).json({ success: false, message: '授权服务繁忙' });
    // 先登记生成中的会话，防止旧二维码请求较晚返回后覆盖新二维码。
    remove(req.sessionID);
    const state = { expiresAt: Date.now() + lifetimeMs, key: '', stop: null, expiry: null };
    sessions.set(req.sessionID, state);
    state.expiry = setTimeout(() => remove(req.sessionID), lifetimeMs).unref();
    try {
      const result = await client.request('/api/login/qrcode');
      const url = new URL(result.url);
      if (!result.key || url.protocol !== 'https:' || !['passport.bilibili.com', 'account.bilibili.com'].includes(url.hostname)) throw new Error('二维码数据无效');
      if (sessions.get(req.sessionID) !== state) return res.status(409).json({ success: false, message: '二维码已更新，请使用新的二维码' });
      state.key = result.key;
      res.json({ success: true, url: result.url, expiresAt: state.expiresAt });
    } catch (error) {
      if (sessions.get(req.sessionID) === state) remove(req.sessionID);
      fail(res, error);
    }
  });

  app.delete('/api/bilibili/qr', admin, (req, res) => {
    remove(req.sessionID);
    res.json({ success: true });
  });

  app.get('/api/bilibili/qr/events', admin, (req, res) => {
    const state = sessions.get(req.sessionID);
    if (!state?.key || state.expiresAt <= Date.now()) return res.status(410).json({ success: false, message: '二维码已过期，请重新生成' });
    state.stop?.();
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    let stopped = false;
    let timer;
    let failures = 0;
    const send = payload => { if (!stopped) res.write(`event: status\ndata: ${JSON.stringify(payload)}\n\n`); };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      res.end();
    };
    state.stop = () => { send({ state: 'expired' }); stop(); };
    res.once('close', stop);
    send({ state: 'waiting' });
    const check = async () => {
      if (stopped || sessions.get(req.sessionID) !== state) return;
      try {
        const result = await client.request('/api/login/poll', { key: state.key });
        if (stopped || sessions.get(req.sessionID) !== state) return;
        failures = 0;
        const terminal = ['confirmed', 'expired'].includes(result.state);
        send({ state: result.state, uname: result.uname, logged_in: result.logged_in });
        if (terminal) {
          if (result.state === 'confirmed') recordAudit(req, '扫码授权哔哩哔哩', { status: 200 });
          stop();
          remove(req.sessionID);
          return;
        }
      } catch (_) {
        if (stopped) return;
        failures += 1;
        if (failures >= 3) { send({ state: 'error', message: '授权状态获取失败，请重新扫码' }); stop(); remove(req.sessionID); return; }
      }
      // B 站扫码协议只提供查询接口；浏览器端使用 SSE，上游查询有退避和三分钟硬截止。
      if (!stopped) timer = setTimeout(check, pollMs * (2 ** failures));
    };
    void check();
  });

  app.get('/api/bilibili/status', admin, async (_req, res) => {
    try { res.json({ success: true, data: await client.request('/api/login/status') }); }
    catch (error) { fail(res, error); }
  });
  app.post('/api/bilibili/cookie', admin, async (req, res) => {
    const cookie = req.body?.cookie;
    if (typeof cookie !== 'string' || cookie.length > 8192 || !cookie.includes('SESSDATA=')) {
      return res.status(400).json({ success: false, message: '请提供包含 SESSDATA 的 Cookie' });
    }
    remove(req.sessionID);
    try { res.json({ success: true, data: await client.request('/api/login/manual', undefined, 'POST', { cookie }) }); }
    catch (error) { fail(res, error); }
  });
  app.delete('/api/bilibili/cookie', admin, async (req, res) => {
    remove(req.sessionID);
    try { await client.request('/api/login/logout', undefined, 'POST'); res.json({ success: true }); }
    catch (error) { fail(res, error); }
  });
}

module.exports = { registerBilibiliAuthRoutes };
