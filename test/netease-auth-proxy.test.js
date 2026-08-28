const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const express = require('express');
const { registerNeteaseAuthRoutes } = require('../routes/netease-auth');

function findRouteHandler(app, method, routePath) {
  const layer = app._router.stack.find((entry) => entry.route
    && entry.route.path === routePath
    && entry.route.methods[method]);
  assert.ok(layer, `未找到路由 ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function invoke(handler, req = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ statusCode: this.statusCode, body: payload }); return this; }
    };
    try {
      const maybe = handler({ headers: {}, query: {}, body: {}, ...req }, res);
      if (maybe && typeof maybe.catch === 'function') maybe.catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

function startFakeUpstream(routes) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const key = `${req.method} ${req.url.split('?')[0]}`;
      const handler = routes[key];
      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'not found' }));
        return;
      }
      handler(req, res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('扫码登录接口透传上游二维码数据', async () => {
  const upstream = await startFakeUpstream({
    'POST /qrlogin/create': (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { key: 'unikey-1', qr_image: 'data:image/svg+xml;base64,AA', login_url: 'x', expires_in: 180 } }));
    }
  });
  const { port } = upstream.address();

  const app = express();
  registerNeteaseAuthRoutes(app, {
    requireLogin: (_req, _res, next) => next(),
    musicApiBase: `http://127.0.0.1:${port}`
  });

  const handler = findRouteHandler(app, 'post', '/api/netease/qr/create');
  const result = await invoke(handler);

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.key, 'unikey-1');
  upstream.close();
});

test('轮询接口缺少 key 时返回 400 且不打扰上游', async () => {
  const app = express();
  registerNeteaseAuthRoutes(app, {
    requireLogin: (_req, _res, next) => next(),
    musicApiBase: 'http://127.0.0.1:59999'
  });

  const handler = findRouteHandler(app, 'get', '/api/netease/qr/check');
  const result = await invoke(handler, { query: {} });

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.success, false);
});

test('清除授权代理到上游的 /cookie/clear', async () => {
  let cleared = false;
  const upstream = await startFakeUpstream({
    'POST /cookie/clear': (_req, res) => {
      cleared = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { logged_in: false, cookie_present: false } }));
    }
  });
  const { port } = upstream.address();

  const app = express();
  registerNeteaseAuthRoutes(app, {
    requireLogin: (_req, _res, next) => next(),
    musicApiBase: `http://127.0.0.1:${port}`
  });

  const handler = findRouteHandler(app, 'delete', '/api/netease/cookie');
  const result = await invoke(handler);

  assert.equal(result.statusCode, 200);
  assert.equal(cleared, true);
  assert.equal(result.body.data.logged_in, false);
  upstream.close();
});

test('配置管理令牌时，代理请求携带 X-Netease-Admin-Token 头', async () => {
  let seenToken = null;
  const upstream = await startFakeUpstream({
    'GET /cookie/status': (req, res) => {
      seenToken = req.headers['x-netease-admin-token'] || null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { logged_in: false, cookie_present: false } }));
    }
  });
  const { port } = upstream.address();

  const app = express();
  registerNeteaseAuthRoutes(app, {
    requireLogin: (_req, _res, next) => next(),
    musicApiBase: `http://127.0.0.1:${port}`,
    adminToken: 'secret-token-123'
  });

  const handler = findRouteHandler(app, 'get', '/api/netease/cookie');
  const result = await invoke(handler);

  assert.equal(result.statusCode, 200);
  assert.equal(seenToken, 'secret-token-123');
  upstream.close();
});

test('上游不可达时返回 502 可读提示', async () => {
  const app = express();
  registerNeteaseAuthRoutes(app, {
    requireLogin: (_req, _res, next) => next(),
    musicApiBase: 'http://127.0.0.1:1',
    timeoutMs: 1000
  });

  const handler = findRouteHandler(app, 'get', '/api/netease/cookie');
  const result = await invoke(handler);

  assert.equal(result.statusCode, 502);
  assert.equal(result.body.success, false);
  assert.match(result.body.message, /音乐服务/);
});
