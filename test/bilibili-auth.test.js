const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-bili-audit-test-'));
process.env.BBZG_AUDIT_DIR = auditDir;
test.after(() => fs.rmSync(auditDir, { recursive: true, force: true }));
const { registerBilibiliAuthRoutes } = require('../routes/bilibili-auth');

async function fixture(t, request, options = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.sessionID = req.headers['x-session'] || 'admin-one';
    req.session = { loggedIn: req.headers['x-admin'] === 'yes' };
    next();
  });
  registerBilibiliAuthRoutes(app, { request }, { pollMs: 5, lifetimeMs: 1000, ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return (endpoint, method = 'GET', extra = {}) => fetch(base + '/api/bilibili' + endpoint, {
    method, headers: { 'x-admin': 'yes', ...extra }, signal: AbortSignal.timeout(3000)
  });
}

const qr = { ok: true, url: 'https://account.bilibili.com/h5/account-h5/auth/scan-web?test=1', key: 'test-only-key' };

test('二维码只对管理员开放，并绑定到创建它的会话', async t => {
  const request = await fixture(t, async () => qr);
  assert.equal((await request('/qr', 'POST', { 'x-admin': 'no' })).status, 401);
  const result = await (await request('/qr', 'POST')).json();
  assert.equal(result.url, qr.url);
  assert.equal(result.key, undefined);
  assert.equal((await request('/qr/events', 'GET', { 'x-session': 'other-admin' })).status, 410);
  await request('/qr', 'DELETE');
  assert.equal((await request('/qr/events')).status, 410);
});

test('扫码状态通过 SSE 推送，成功后终止查询且不暴露 Cookie', async t => {
  let polls = 0;
  const request = await fixture(t, async endpoint => {
    if (endpoint === '/api/login/qrcode') return qr;
    polls += 1;
    return polls === 1 ? { state: 'scanned' } : { state: 'confirmed', logged_in: true, uname: '测试账户', cookie: 'must-not-leak' };
  });
  await request('/qr', 'POST');
  const events = await (await request('/qr/events')).text();
  assert.match(events, /"state":"waiting"/);
  assert.match(events, /"state":"scanned"/);
  assert.match(events, /"state":"confirmed"/);
  assert.doesNotMatch(events, /must-not-leak|cookie/);
  assert.equal(polls, 2);
  assert.equal((await request('/qr/events')).status, 410);
});

test('二维码到期关闭 SSE，不无限查询', async t => {
  const request = await fixture(t, async endpoint => endpoint === '/api/login/qrcode' ? qr : { state: 'waiting' }, { lifetimeMs: 80 });
  await request('/qr', 'POST');
  assert.match(await (await request('/qr/events')).text(), /"state":"expired"/);
  assert.equal((await request('/qr/events')).status, 410);
});

test('连续上游错误退避三次后结束授权', async t => {
  let polls = 0;
  const request = await fixture(t, async endpoint => {
    if (endpoint === '/api/login/qrcode') return qr;
    polls += 1;
    throw new Error('test upstream unavailable');
  });
  await request('/qr', 'POST');
  assert.match(await (await request('/qr/events')).text(), /"state":"error"/);
  assert.equal(polls, 3);
});

test('较早的二维码请求不能覆盖后生成的二维码', async t => {
  let resolveFirst;
  let started;
  const firstStarted = new Promise(resolve => { started = resolve; });
  let calls = 0;
  const request = await fixture(t, async () => {
    calls += 1;
    if (calls === 1) { started(); return new Promise(resolve => { resolveFirst = resolve; }); }
    return { ...qr, key: 'new-key' };
  });
  const first = request('/qr', 'POST');
  await firstStarted;
  assert.equal((await request('/qr', 'POST')).status, 200);
  resolveFirst(qr);
  assert.equal((await first).status, 409);
  await request('/qr', 'DELETE');
});
