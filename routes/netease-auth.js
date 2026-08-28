const axios = require('axios');

/**
 * 网易云音乐授权（扫码登录 / Cookie 管理）代理路由。
 *
 * 后台通过这些接口驱动内网的 Python 音乐服务完成扫码登录、查看/清除授权，
 * 从而彻底摆脱手工提取 Cookie、录入环境变量的流程。所有接口均需登录后台。
 */
function registerNeteaseAuthRoutes(app, deps) {
  const { requireLogin } = deps || {};

  const baseUrl = String(
    (deps && deps.musicApiBase) ||
    process.env.BBZG_MUSIC_API_BASE ||
    'http://127.0.0.1:5000'
  ).replace(/\/+$/, '');
  const timeoutMs = Number.parseInt(
    String((deps && deps.timeoutMs) || process.env.BBZG_MUSIC_API_TIMEOUT_MS || '12000'),
    10
  );

  const client = axios.create({
    baseURL: baseUrl,
    timeout: timeoutMs,
    // 只要拿到 HTTP 响应就交给业务层处理，避免 4xx/5xx 直接抛异常丢失 Flask 的错误信息
    validateStatus: () => true
  });

  function isUpstreamDown(error) {
    const code = error && error.code;
    return code === 'ECONNREFUSED' || code === 'ECONNABORTED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT';
  }

  // 将 Flask 的响应透传给前端；上游不可达时给出可读提示
  async function proxy(res, doRequest) {
    try {
      const upstream = await doRequest();
      const status = upstream.status || 502;
      const payload = upstream.data;
      if (payload && typeof payload === 'object') {
        return res.status(status).json(payload);
      }
      return res.status(status).json({
        success: false,
        message: '音乐服务返回了非预期的响应'
      });
    } catch (error) {
      if (isUpstreamDown(error)) {
        return res.status(502).json({
          success: false,
          message: '音乐服务未启动或不可达，请检查 netease_music_api 服务'
        });
      }
      return res.status(502).json({
        success: false,
        message: `音乐服务请求失败: ${error && error.message ? error.message : '未知错误'}`
      });
    }
  }

  // 生成扫码登录二维码
  app.post('/api/netease/qr/create', requireLogin, (req, res) => {
    return proxy(res, () => client.post('/qrlogin/create'));
  });

  // 轮询扫码登录状态（成功时 Flask 侧会写入 Cookie）
  app.get('/api/netease/qr/check', requireLogin, (req, res) => {
    const key = String(req.query.key || '').trim();
    if (!key) {
      return res.status(400).json({ success: false, message: '缺少 key 参数' });
    }
    return proxy(res, () => client.get('/qrlogin/check', { params: { key } }));
  });

  // 查询当前授权状态
  app.get('/api/netease/cookie', requireLogin, (req, res) => {
    return proxy(res, () => client.get('/cookie/status'));
  });

  // 手动录入 Cookie（粘贴方式）
  app.post('/api/netease/cookie', requireLogin, (req, res) => {
    const cookie = String((req.body && (req.body.cookie || req.body.content)) || '').trim();
    if (!cookie) {
      return res.status(400).json({ success: false, message: 'cookie 内容不能为空' });
    }
    return proxy(res, () => client.post('/cookie/set', { cookie }));
  });

  // 清除授权（登出）
  app.delete('/api/netease/cookie', requireLogin, (req, res) => {
    return proxy(res, () => client.post('/cookie/clear'));
  });
}

module.exports = { registerNeteaseAuthRoutes };
