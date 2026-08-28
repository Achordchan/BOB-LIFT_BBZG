const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { registerLogRoutes } = require('../routes/logs');

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
      handler({ headers: {}, query: {}, ...req }, res);
    } catch (error) {
      reject(error);
    }
  });
}

function setupApp(logDir) {
  const app = express();
  registerLogRoutes(app, { requireLogin: (_req, _res, next) => next(), logDir });
  return app;
}

test('列出 logs 目录中的合法日志文件', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-logs-'));
  fs.writeFileSync(path.join(dir, 'app-2026-08-28.log'), '');
  fs.writeFileSync(path.join(dir, 'error-2026-08-28.log'), '');
  fs.writeFileSync(path.join(dir, 'random.txt'), 'nope'); // 非法命名，应被过滤

  const app = setupApp(dir);
  const res = await invoke(findRouteHandler(app, 'get', '/api/logs/files'));

  assert.equal(res.statusCode, 200);
  const names = res.body.files.map((f) => f.name).sort();
  assert.deepEqual(names, ['app-2026-08-28.log', 'error-2026-08-28.log']);
});

test('tail 解析 JSON 行并支持级别过滤', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-logs-'));
  const lines = [
    JSON.stringify({ level: 'info', message: 'GET /api/health 200', timestamp: 't1', tag: 'http', status: 200 }),
    JSON.stringify({ level: 'error', message: '请求处理异常', timestamp: 't2', errorId: 'E123', stack: 'Error: boom' }),
    JSON.stringify({ level: 'info', message: '普通信息', timestamp: 't3' })
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'app-2026-08-28.log'), lines);

  const app = setupApp(dir);
  const all = await invoke(findRouteHandler(app, 'get', '/api/logs/tail'), { query: { file: 'app-2026-08-28.log' } });
  assert.equal(all.statusCode, 200);
  assert.equal(all.body.entries.length, 3);

  const onlyError = await invoke(findRouteHandler(app, 'get', '/api/logs/tail'), { query: { file: 'app-2026-08-28.log', level: 'error' } });
  assert.equal(onlyError.body.entries.length, 1);
  assert.equal(onlyError.body.entries[0].message, '请求处理异常');
  assert.equal(onlyError.body.entries[0].stack, 'Error: boom');
  assert.equal(onlyError.body.entries[0].meta.errorId, 'E123');
});

test('tail 拒绝目录穿越 / 非法文件名', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-logs-'));
  fs.writeFileSync(path.join(dir, 'app-2026-08-28.log'), '{}\n');
  const app = setupApp(dir);

  for (const bad of ['../../etc/passwd', '..%2f..%2fpasswd', 'app-2026-08-28.txt', 'app-2026-08-28.log.x', 'audit.jsonl']) {
    const res = await invoke(findRouteHandler(app, 'get', '/api/logs/tail'), { query: { file: bad } });
    assert.equal(res.statusCode, 404, `非法文件名应 404: ${bad}`);
  }
});

test('白名单覆盖按大小切割的分片与 .gz 归档', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-logs-'));
  fs.writeFileSync(path.join(dir, 'app-2026-08-28.log'), '{}\n');
  fs.writeFileSync(path.join(dir, 'app-2026-08-28.log.1'), '{}\n');
  fs.writeFileSync(path.join(dir, 'error-2026-08-28.log.12'), '{}\n');
  fs.writeFileSync(path.join(dir, 'app-2026-08-27.log.gz'), '');

  const app = setupApp(dir);
  const res = await invoke(findRouteHandler(app, 'get', '/api/logs/files'));
  const names = res.body.files.map((f) => f.name).sort();
  assert.deepEqual(names, ['app-2026-08-27.log.gz', 'app-2026-08-28.log', 'app-2026-08-28.log.1', 'error-2026-08-28.log.12']);
  assert.equal(res.body.files.find((f) => f.name.endsWith('.gz')).compressed, true);
});

test('可读取 .gz 归档中的日志内容', async () => {
  const zlib = require('node:zlib');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-logs-'));
  const payload = JSON.stringify({ level: 'error', message: '归档里的错误', timestamp: 't1' }) + '\n';
  fs.writeFileSync(path.join(dir, 'app-2026-08-27.log.gz'), zlib.gzipSync(Buffer.from(payload, 'utf8')));

  const app = setupApp(dir);
  const res = await invoke(findRouteHandler(app, 'get', '/api/logs/tail'), { query: { file: 'app-2026-08-27.log.gz' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.entries.length, 1);
  assert.equal(res.body.entries[0].message, '归档里的错误');
});
