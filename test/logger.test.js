const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 隔离日志目录，须在 require 之前设置（logger 在加载时读取该变量）
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-log-'));
process.env.BBZG_LOG_DIR = tmpDir;
process.env.BBZG_LOG_LEVEL = 'debug';

const { logger, httpLogger } = require('../lib/logger');

function fakeRes() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    setHeader(k, v) { headers[k] = v; },
    getHeader() { return undefined; },
    on() { /* 不触发 finish，避免本用例产生访问日志 */ }
  };
}

test('httpLogger 为请求分配 requestId 并回写 X-Request-Id 响应头', () => {
  const mw = httpLogger();
  const req = { headers: {}, method: 'GET', originalUrl: '/x', session: {}, socket: {} };
  const res = fakeRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(typeof req.id, 'string');
  assert.ok(req.id.length > 0);
  assert.equal(res.headers['X-Request-Id'], req.id);
});

test('httpLogger 沿用调用方传入的 x-request-id', () => {
  const mw = httpLogger();
  const req = { headers: { 'x-request-id': 'caller-abc-123' }, method: 'GET', originalUrl: '/x', session: {}, socket: {} };
  const res = fakeRes();
  mw(req, res, () => {});

  assert.equal(req.id, 'caller-abc-123');
});

test('日志写入文件并对敏感信息脱敏', async () => {
  logger.error('外部回调 token=SUPERSECRET123 password=hunter2 已处理');
  await new Promise((resolve) => setTimeout(resolve, 400));

  const errFiles = fs.readdirSync(tmpDir).filter((f) => f.startsWith('error-') && f.endsWith('.log'));
  assert.ok(errFiles.length >= 1, '应生成 error 日志文件');
  const content = fs.readFileSync(path.join(tmpDir, errFiles[0]), 'utf8');

  assert.ok(!content.includes('SUPERSECRET123'), 'token 明文不应出现在日志');
  assert.ok(!content.includes('hunter2'), 'password 明文不应出现在日志');
  assert.ok(content.includes('token'), '字段名应保留便于排查');
  assert.ok(content.includes('***'), '敏感值应被替换为 ***');
});
