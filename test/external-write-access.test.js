const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { registerExternalAccessRoutes } = require('../routes/external-access');
const { configureApp } = require('../app/create-app');
const { createExternalWriteToken } = require('../lib/external-write-token');
const { registerInquiryRoutes } = require('../routes/inquiries');
const { registerDealRoutes } = require('../routes/deals');

function findRouteHandler(app, method, routePath) {
  const layer = app._router.stack.find((entry) => {
    return entry.route
      && entry.route.path === routePath
      && entry.route.methods[method];
  });
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

test('管理员可生成用于外部连接器绑定的 Token，明文只在生成时返回', async () => {
  let data = {};
  const app = express();
  registerExternalAccessRoutes(app, {
    requireLogin: (_req, _res, next) => next(),
    getData: () => data,
    saveData: (next) => {
      data = next;
      return true;
    },
    updateData: (mutator) => {
      data = mutator(data) || data;
      return { ok: true, data };
    }
  });

  const generate = findRouteHandler(app, 'post', '/api/admin/external-write-token/regenerate');
  const generated = await invokeJson(generate, { headers: {} });

  assert.equal(generated.statusCode, 200);
  assert.equal(generated.body.success, true);
  assert.match(generated.body.token, /^bbzg_[A-Za-z0-9_-]{32,}$/);
  assert.equal(generated.body.parameterName, 'token');
  assert.equal(generated.body.parameterLocation, 'Query');
  assert.equal(typeof data.externalWriteAccess.tokenHash, 'string');
  assert.equal(data.externalWriteAccess.tokenHash.length, 64);
  assert.equal(Object.prototype.hasOwnProperty.call(data.externalWriteAccess, 'token'), false);

  const status = findRouteHandler(app, 'get', '/api/admin/external-write-token');
  const current = await invokeJson(status, {});
  assert.equal(current.body.configured, true);
  assert.equal(Object.prototype.hasOwnProperty.call(current.body, 'token'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(current.body, 'tokenHash'), false);
});

test('连接器可用 Query Token 调用外部写接口，错误 Token 被拒绝', async () => {
  const generated = createExternalWriteToken();
  const data = { externalWriteAccess: generated.record };
  const app = express();
  app.set('bbzgGetData', () => data);
  configureApp(app);
  const authLayer = app._router.stack
    .filter((layer) => typeof layer.handle === 'function' && !layer.route)
    .slice(-1)[0];

  async function authorize(token) {
    return new Promise((resolve) => {
      const req = {
        method: 'GET',
        path: '/inquiries/add',
        session: {},
        query: { token },
        body: {},
        get() { return ''; }
      };
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          resolve({ statusCode: this.statusCode, body, authorized: !!req.bbzgExternalWriteAuthorized });
        }
      };
      authLayer.handle(req, res, () => resolve({ statusCode: 200, nextCalled: true, authorized: !!req.bbzgExternalWriteAuthorized }));
    });
  }

  const valid = await authorize(generated.token);
  assert.equal(valid.nextCalled, true);
  assert.equal(valid.authorized, true);

  const invalid = await authorize('bbzg_wrong');
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.nextCalled, undefined);
});

test('通过绑定 Token 鉴权的 GET 请求可继续调用现有钉钉写接口', async () => {
  let data = { inquiryCount: 4, inquiryConfig: {}, music: [] };
  const app = express();
  registerInquiryRoutes(app, {
    getData: () => data,
    saveData: (next) => {
      data = next;
      return true;
    },
    updateData: (mutator) => {
      data = mutator(data) || data;
      return { ok: true, data };
    }
  });

  const add = findRouteHandler(app, 'get', '/api/inquiries/add');
  const result = await invokeJson(add, {
    method: 'GET',
    bbzgExternalWriteAuthorized: true
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.count, 5);
});

test('通过绑定 Token 鉴权的 GET 成交请求可写入成交数据', async () => {
  let data = {
    dealAmount: 0,
    dealsHistory: [],
    dealsLedger: [],
    users: [],
    music: [],
    platformTargets: [],
    celebrationMessages: []
  };
  const app = express();
  registerDealRoutes(app, {
    getData: () => data,
    saveData: (next) => {
      data = next;
      return true;
    },
    updateData: (mutator) => {
      data = mutator(data) || data;
      return { ok: true, data };
    },
    uuidv4: () => 'deal-1',
    getUserMusicConfig: () => null,
    parseDealAmountInput: (value) => Number(value),
    formatDealAmountForTts: (_raw, value) => Number(value).toFixed(2)
  });

  const add = findRouteHandler(app, 'get', '/api/deals/add');
  const result = await invokeJson(add, {
    method: 'GET',
    bbzgExternalWriteAuthorized: true,
    query: {
      zongjine: '1000',
      fuzeren: '张三',
      laiyuanpingtai: '独立站'
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(data.dealAmount, 1000);
  assert.equal(data.dealsLedger.length, 1);
});
