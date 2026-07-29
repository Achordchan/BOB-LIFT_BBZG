const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const { registerDealRoutes } = require('../routes/deals');
const { registerSystemStatusRoutes } = require('../routes/system-status');

function findRouteHandler(app, method, routePath) {
  const layer = app._router.stack.find((entry) => (
    entry.route && entry.route.path === routePath && entry.route.methods[method]
  ));
  assert.ok(layer, `未找到路由 ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function invokeJson(handler, req = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ statusCode: this.statusCode, body: payload });
        return this;
      }
    };
    try {
      handler(req, res);
    } catch (error) {
      reject(error);
    }
  });
}

test('最近成交筛选发生在条数限制之前', async () => {
  const inquiriesHistory = Array.from({ length: 25 }, (_, index) => ({
    type: 'add',
    count: index + 1,
    timestamp: new Date(Date.UTC(2026, 6, 29, 12, index)).toISOString()
  }));
  const data = {
    inquiriesHistory,
    dealsHistory: [{
      person: '测试负责人',
      platform: '独立站',
      amount: 1000,
      timestamp: '2026-07-29T10:00:00.000Z'
    }]
  };
  const app = express();
  registerDealRoutes(app, { getData: () => data });

  const handler = findRouteHandler(app, 'get', '/api/deals/recent');
  const result = await invokeJson(handler, { query: { type: 'deal', limit: '8' } });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.deals.length, 1);
  assert.equal(result.body.deals[0].type, 'deal');
  assert.equal(result.body.deals[0].amount, 1000);
});

test('系统状态使用传入的会话目录并排除过期会话', async (t) => {
  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-sessions-'));
  t.after(() => fs.rmSync(sessionDir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(sessionDir, 'active.json'), JSON.stringify({
    expires: Date.now() + 60000,
    session: { loggedIn: true, adminUsername: 'admin' }
  }));
  fs.writeFileSync(path.join(sessionDir, 'expired.json'), JSON.stringify({
    expires: Date.now() - 60000,
    session: { loggedIn: true, adminUsername: 'admin' }
  }));

  const app = express();
  registerSystemStatusRoutes(app, { sessionDir, getData: () => ({}) });
  const handler = findRouteHandler(app, 'get', '/api/system/status');
  const result = await invokeJson(handler, { session: { loggedIn: true } });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.sessions.count, 1);
});

test('删除会话通过实际 Session Store 执行', async () => {
  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-sessions-'));
  const sid = 'target-session';
  fs.writeFileSync(path.join(sessionDir, `${sid}.json`), '{}');
  let destroyedSid = null;
  const sessionStore = {
    destroy(value, callback) {
      destroyedSid = value;
      fs.unlinkSync(path.join(sessionDir, `${value}.json`));
      callback(null);
    }
  };

  const app = express();
  registerSystemStatusRoutes(app, { sessionDir, sessionStore });
  const handler = findRouteHandler(app, 'delete', '/api/admin/sessions/:sid');
  const result = await invokeJson(handler, {
    session: { loggedIn: true },
    sessionID: 'current-session',
    params: { sid }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(destroyedSid, sid);
  fs.rmSync(sessionDir, { recursive: true, force: true });
});
