const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const { hashPassword, verifyPassword, needsRehash } = require('../lib/password');
const { sanitizeDealPerson, sanitizeDealPlatform } = require('../lib/sanitize-text');
const { getData, saveData } = require('../lib/data-store');
const { createRateLimiter } = require('../lib/rate-limit');
const { registerDealRoutes } = require('../routes/deals');
const { registerTargetsRoutes } = require('../routes/targets');
const { registerTtsRoutes } = require('../routes/tts');

function findRouteHandler(app, method, routePath) {
  const layer = app._router.stack.find((entry) => entry.route && entry.route.path === routePath && entry.route.methods[method]);
  assert.ok(layer, `missing route ${method} ${routePath}`);
  return layer.route.stack[0].handle;
}

function invoke(handler, req = {}, resExtras = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: undefined,
      headersSent: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        this.headersSent = true;
        resolve({ statusCode: this.statusCode, body: payload });
        return this;
      },
      ...resExtras
    };
    try {
      const maybe = handler(req, res);
      if (maybe && typeof maybe.then === 'function') {
        maybe.then(() => {
          if (!res.headersSent) resolve({ statusCode: res.statusCode, body: res.body });
        }).catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

test('密码哈希与兼容明文校验', () => {
  const hashed = hashPassword('S3cret!');
  assert.equal(needsRehash(hashed), false);
  assert.equal(verifyPassword('S3cret!', hashed), true);
  assert.equal(verifyPassword('wrong', hashed), false);
  assert.equal(verifyPassword('plain', 'plain'), true);
  assert.equal(needsRehash('plain'), true);
});

test('业务文本清洗去除尖括号并截断', () => {
  const person = sanitizeDealPerson('<script>alert(1)</script>张三');
  assert.equal(person.includes('<'), false);
  assert.equal(person.includes('>'), false);
  assert.ok(person.length > 0);
  assert.equal(sanitizeDealPerson('<img onerror=alert(1)>'), 'img onerror=alert(1)');
  assert.equal(sanitizeDealPlatform('A'.repeat(100)).length, 40);
  assert.equal(sanitizeDealPerson(''), '匿名');
});

test('data-store 原子写入不会留下半截 JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-data-'));
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify({ inquiryCount: 1, __revision: 0 }));
  const ok = saveData(file, { inquiryCount: 2, secret: 'x' });
  assert.equal(ok, true);
  const loaded = getData(file);
  assert.equal(loaded.inquiryCount, 2);
  assert.equal(loaded.__revision, 1);
  assert.equal(fs.readdirSync(dir).some((name) => name.endsWith('.tmp')), false);
});

test('成交公开入口清洗负责人/平台，并写入长期账本', async () => {
  let data = {
    dealAmount: 0,
    users: [{ id: 'u1', name: '张三', position: '运营' }],
    music: [],
    celebrationMessages: [],
    platformTargets: [],
    dealsHistory: [],
    dealsLedger: []
  };
  const app = express();
  registerDealRoutes(app, {
    getData: () => data,
    saveData: (next) => { data = next; return true; },
    uuidv4: () => 'deal-1',
    getUserMusicConfig: () => null,
    parseDealAmountInput: (v) => Number(String(v).replace(/[^\d.]/g, '')) || 0,
    formatDealAmountForTts: (_raw, n) => Number(n).toFixed(2)
  });
  const handler = findRouteHandler(app, 'post', '/api/deals/add');
  const { statusCode, body } = await invoke(handler, {
    method: 'POST',
    body: {
      zongjine: '100',
      fuzeren: '<script>hack</script>',
      laiyuanpingtai: '<b>平台</b>'
    },
    query: {}
  });
  assert.equal(statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(data.dealsHistory.length, 1);
  assert.equal(data.dealsLedger.length, 1);
  assert.equal(data.dealsHistory[0].person.includes('<'), false);
  assert.equal(data.dealsHistory[0].platform.includes('<'), false);
  assert.equal(data.dealsLedger[0].userId, null);
});

test('目标周期使用 year-week 键并重置周期进度而非全量总额', async () => {
  let data = {
    inquiryCount: 100,
    dealAmount: 5000,
    targets: {
      inquiryTarget: 10,
      dealTarget: 1000,
      resetPeriod: 'weekly',
      lastResetTime: '2020-01-01T00:00:00.000Z',
      periodKey: '2020-W01',
      periodBaselineInquiryCount: 0,
      periodBaselineDealAmount: 0,
      periodInquiryCount: 100,
      periodDealAmount: 5000
    }
  };
  const app = express();
  registerTargetsRoutes(app, {
    getData: () => data,
    saveData: (next) => { data = next; return true; }
  });
  const handler = findRouteHandler(app, 'get', '/api/targets');
  const { body } = await invoke(handler, {});
  assert.equal(body.success, true);
  assert.match(String(body.periodKey), /^\d{4}-W\d{2}$/);
  assert.equal(data.inquiryCount, 100);
  assert.equal(data.dealAmount, 5000);
  assert.equal(body.periodInquiryCount, 0);
  assert.equal(body.periodDealAmount, 0);
});

test('公开 TTS 拒绝超长文本', async () => {
  const app = express();
  registerTtsRoutes(app, {
    requireLogin: (req, res, next) => next(),
    getData: () => ({ aliyunTtsConfig: {} }),
    saveData: () => true,
    baseDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-tts-')),
    parseDealAmountInput: () => 0,
    formatDealAmountForTts: () => '0.00'
  });
  const handler = findRouteHandler(app, 'post', '/api/text-to-speech');
  const { statusCode, body } = await invoke(handler, {
    body: { text: '测'.repeat(500) },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' }
  });
  assert.equal(statusCode, 400);
  assert.equal(body.success, false);
  assert.match(String(body.message), /过长|文本/);
});

test('限流器在超过阈值后拒绝', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, blockMs: 60_000 });
  assert.equal(limiter.hit('k').allowed, true);
  assert.equal(limiter.hit('k').allowed, true);
  assert.equal(limiter.hit('k').allowed, false);
});
