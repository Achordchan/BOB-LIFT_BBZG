const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { registerInquiryRoutes } = require('../routes/inquiries');

function findRouteHandler(app, method, routePath) {
  const layer = app._router.stack.find((entry) => {
    return entry.route
      && entry.route.path === routePath
      && entry.route.methods[method];
  });
  assert.ok(layer, `未找到路由 ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack[0].handle;
}

function invokeJson(handler, req = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
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

test('公开 GET /api/inquiries 只返回 inquiryCount，不泄露敏感字段', async () => {
  const data = {
    inquiryCount: 17,
    admin: { username: 'admin', password: 'secret-password' },
    users: [{ id: 'u1', password: 'member-secret' }],
    aliyunTtsConfig: { accessKeyId: 'ak', accessKeySecret: 'sk' },
    operationLogs: [{ action: 'login' }],
    music: [],
    inquiryConfig: { addInquiryMusicId: null, reduceInquiryMusicId: null }
  };

  const app = express();
  registerInquiryRoutes(app, {
    getData: () => data,
    saveData: () => true
  });

  const handler = findRouteHandler(app, 'get', '/api/inquiries');
  const { statusCode, body } = await invokeJson(handler, {});

  assert.equal(statusCode, 200);
  assert.deepEqual(body, { inquiryCount: 17 });
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'admin'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'users'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'aliyunTtsConfig'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'operationLogs'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'password'), false);
});

test('公开 GET /api/inquiries 在 inquiryCount 非法时回退为 0', async () => {
  const app = express();
  registerInquiryRoutes(app, {
    getData: () => ({ inquiryCount: 'bad', music: [] }),
    saveData: () => true
  });

  const handler = findRouteHandler(app, 'get', '/api/inquiries');
  const { body } = await invokeJson(handler, {});
  assert.deepEqual(body, { inquiryCount: 0 });
});
