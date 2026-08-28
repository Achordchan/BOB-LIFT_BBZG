const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-audit-'));
process.env.BBZG_AUDIT_DIR = tmpDir;

const { writeAudit, readAudit, auditMiddleware } = require('../lib/audit');

function runMiddleware(mw, { method, url, session = {}, status = 200, body = {} }) {
  let finishCb = null;
  const req = { method, path: url.split('?')[0], originalUrl: url, session, body, headers: {}, id: 'req-1', socket: {} };
  const res = { statusCode: status, on: (evt, cb) => { if (evt === 'finish') finishCb = cb; } };
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  if (finishCb) finishCb();
  return { nextCalled };
}

test('writeAudit / readAudit 往返并按最新在前返回', () => {
  writeAudit({ actor: 'admin', actorType: 'admin', action: '录入成交', detail: 'amount=100' });
  writeAudit({ actor: 'admin', actorType: 'admin', action: '新增询盘', detail: 'platform=google' });
  const { entries, scanned } = readAudit({ limit: 10 });
  assert.ok(scanned >= 2);
  assert.equal(entries[0].action, '新增询盘'); // 最新在前
});

test('readAudit 支持按身份与关键字过滤', () => {
  writeAudit({ actor: 'wangwu', actorType: 'staff', action: '删除音乐', detail: '慢灵魂' });
  const byStaff = readAudit({ actorType: 'staff', limit: 50 });
  assert.ok(byStaff.entries.every((e) => e.actorType === 'staff'));
  const byKeyword = readAudit({ q: '慢灵魂', limit: 50 });
  assert.ok(byKeyword.entries.some((e) => e.action === '删除音乐'));
});

test('auditMiddleware 记录白名单内的成功变更，忽略未匹配路径', () => {
  const mw = auditMiddleware();
  const before = readAudit({ limit: 1000 }).scanned;

  runMiddleware(mw, { method: 'POST', url: '/api/deals/add', session: { loggedIn: true, adminUsername: 'admin' }, status: 200, body: { amount: 8888, platform: '独立站' } });
  runMiddleware(mw, { method: 'GET', url: '/api/deals', session: { loggedIn: true }, status: 200 }); // 非白名单，忽略

  const after = readAudit({ limit: 1000 });
  assert.equal(after.scanned, before + 1);
  const latest = after.entries[0];
  assert.equal(latest.action, '录入成交');
  assert.equal(latest.actor, 'admin');
  assert.ok(String(latest.detail).includes('8888'));
});

test('登录失败按会话判定标记（失败）', () => {
  const mw = auditMiddleware();
  runMiddleware(mw, { method: 'POST', url: '/login', session: {}, status: 302, body: { username: 'tester' } });
  const latest = readAudit({ limit: 5 }).entries[0];
  assert.equal(latest.action, '登录后台（失败）');
  assert.equal(latest.actorType, 'anon');
});

test('登录成功记录管理员', () => {
  const mw = auditMiddleware();
  runMiddleware(mw, { method: 'POST', url: '/login', session: { loggedIn: true, adminUsername: 'boss' }, status: 302, body: { username: 'boss' } });
  const latest = readAudit({ limit: 5 }).entries[0];
  assert.equal(latest.action, '登录后台');
  assert.equal(latest.actor, 'boss');
});
