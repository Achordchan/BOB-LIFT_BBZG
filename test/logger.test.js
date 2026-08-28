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

test('元数据中的敏感字段按键名打码', async () => {
  logger.error('元数据脱敏检查', { password: 'hunter2', token: 'TOKENVALUE', nested: { apiKey: 'AKID999', keep: '保留' } });
  await new Promise((resolve) => setTimeout(resolve, 400));

  const errFiles = fs.readdirSync(tmpDir).filter((f) => f.startsWith('error-') && f.endsWith('.log'));
  const content = fs.readFileSync(path.join(tmpDir, errFiles[0]), 'utf8');

  for (const secret of ['hunter2', 'TOKENVALUE', 'AKID999']) {
    assert.ok(!content.includes(secret), `${secret} 不应出现在日志`);
  }
  assert.ok(content.includes('保留'), '非敏感字段应保留');
});

test('未捕获异常记录后以非零状态退出，交由进程管理器重启', () => {
  const { spawnSync } = require('node:child_process');
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-fatal-'));
  const repo = path.resolve(__dirname, '..');
  const script = `
    const { installProcessHandlers } = require(${JSON.stringify(path.join(repo, 'lib', 'logger'))});
    installProcessHandlers({ exitDelayMs: 150 });
    setTimeout(() => { throw new Error('故意抛出的致命错误'); }, 10);
    setInterval(() => {}, 1000); // 保持事件循环，确保退出确实来自 handler
  `;
  const res = spawnSync(process.execPath, ['-e', script], {
    env: { ...process.env, BBZG_LOG_DIR: logDir, BBZG_LOG_LEVEL: 'debug' },
    encoding: 'utf8',
    timeout: 10000
  });

  assert.equal(res.status, 1, '致命异常后应以非零状态退出');
  const errFiles = fs.readdirSync(logDir).filter((f) => f.startsWith('error-'));
  assert.ok(errFiles.length >= 1, '应写入 error 日志');
  const content = fs.readFileSync(path.join(logDir, errFiles[0]), 'utf8');
  assert.ok(content.includes('故意抛出的致命错误'), '日志应包含异常信息');
  assert.ok(content.includes('uncaughtException'), '应标注为未捕获异常');
});

test('文件日志写入失败时停用该输出而非崩溃', async () => {
  const winston = require('winston');
  const before = logger.transports.length;
  const fileTransport = logger.transports.find((t) => t instanceof winston.transports.DailyRotateFile);
  assert.ok(fileTransport, '应存在文件 transport');

  // 模拟运行期异步错误（目录不可写/磁盘满/轮转失败）
  fileTransport.emit('error', new Error('EACCES: permission denied'));
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.ok(logger.transports.length < before, '故障 transport 应被移除');
  assert.ok(!logger.transports.includes(fileTransport), '不应再持有故障 transport');
  // 后续写日志不应抛出
  assert.doesNotThrow(() => logger.info('transport 移除后仍可记录'));
});
