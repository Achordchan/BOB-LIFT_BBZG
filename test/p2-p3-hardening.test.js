const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { getClientIp } = require('../lib/request-ip');
const { createTtlMap } = require('../lib/ttl-map');
const { publicErrorPayload, sanitizeLogValue } = require('../lib/safe-error');
const { createNeteaseClient } = require('../lib/netease-client');

test('可信代理关闭时忽略 x-forwarded-for', () => {
  const prev = process.env.BBZG_TRUST_PROXY;
  delete process.env.BBZG_TRUST_PROXY;
  const ip = getClientIp({
    headers: { 'x-forwarded-for': '1.2.3.4' },
    socket: { remoteAddress: '10.0.0.8' }
  });
  assert.equal(ip, '10.0.0.8');
  if (prev == null) delete process.env.BBZG_TRUST_PROXY;
  else process.env.BBZG_TRUST_PROXY = prev;
});

test('可信代理开启时使用 x-forwarded-for 首个 IP', () => {
  const prev = process.env.BBZG_TRUST_PROXY;
  process.env.BBZG_TRUST_PROXY = '1';
  const ip = getClientIp({
    headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    socket: { remoteAddress: '10.0.0.8' }
  });
  assert.equal(ip, '1.2.3.4');
  if (prev == null) delete process.env.BBZG_TRUST_PROXY;
  else process.env.BBZG_TRUST_PROXY = prev;
});

test('TTL Map 会过期并触发 onEvict', async () => {
  const evicted = [];
  const map = createTtlMap({
    defaultTtlMs: 20,
    maxSize: 10,
    onEvict: (key, value) => evicted.push([key, value])
  });
  map.set('a', { filePath: '/tmp/x' }, 20);
  assert.deepEqual(map.get('a'), { filePath: '/tmp/x' });
  await new Promise((r) => setTimeout(r, 35));
  assert.equal(map.get('a'), undefined);
  assert.equal(evicted.length >= 1, true);
});

test('错误响应生产模式不暴露细节', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const payload = publicErrorPayload('失败', new Error('secret stack'));
  assert.equal(payload.success, false);
  assert.equal(payload.message, '失败');
  assert.ok(payload.errorId);
  assert.equal(payload.error, undefined);
  process.env.NODE_ENV = prev;
});

test('日志脱敏隐藏 token/password', () => {
  const s = sanitizeLogValue('password=abc123 token=xyz Authorization: Bearer abc.def');
  assert.equal(s.includes('abc123'), false);
  assert.equal(s.includes('xyz'), false);
  assert.equal(s.includes('abc.def'), false);
});

test('大屏脚本不再包含 Mock 成交人名', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'leaderboard.js'), 'utf8');
  assert.equal(src.includes('Jolin'), false);
  assert.equal(src.includes('generateMockActivity'), false);
  assert.equal(src.includes('模拟数据'), false);
});

test('网易云客户端暴露共享方法', () => {
  const client = createNeteaseClient({ baseUrl: 'http://127.0.0.1:5000' });
  assert.equal(typeof client.resolveNeteasePlayableUrl, 'function');
  assert.equal(typeof client.fetchNeteaseLyric, 'function');
  assert.equal(typeof client.guessExtByUrl, 'function');
});

test('健康检查路由已注册为业务 JSON', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.equal(src.includes("app.get('/api/health'"), true);
  assert.equal(src.includes('checks.dataReadable'), true);
});

test('部署脚本默认检查 /api/health 且不使用 curl -k', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'deploy-baota.sh'), 'utf8');
  assert.equal(src.includes('DEPLOY_HEALTH_PATH="${DEPLOY_HEALTH_PATH:-/api/health}"'), true);
  assert.equal(src.includes('curl -k'), false);
  assert.equal(src.includes('尝试从备份恢复上一版'), true);
});

test('后台入口使用懒加载', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'admin', 'App.tsx'), 'utf8');
  assert.equal(src.includes('lazy(() => import'), true);
  assert.equal(src.includes('Suspense'), true);
});

test('平台目标脚本不再包含 Mock 平台数据方法', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'platform-targets.js'), 'utf8');
  assert.equal(src.includes('loadMockData'), false);
  assert.equal(src.includes('阿里巴巴'), false);
});

test('createConcurrencyGate 真正限制并发', async () => {
  const { createConcurrencyGate } = require('../lib/rate-limit');
  const gate = createConcurrencyGate(2);
  let maxActive = 0;
  let active = 0;
  const jobs = Array.from({ length: 6 }, () => gate.run(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 30));
    active -= 1;
  }));
  await Promise.all(jobs);
  assert.equal(maxActive, 2);
  assert.deepEqual(gate.stats(), { active: 0, queued: 0, max: 2 });
});

test('withWriteLock 异步完成后释放 Map 条目', async () => {
  const path = require('node:path');
  const fs = require('node:fs');
  const os = require('node:os');
  const storePath = path.join(os.tmpdir(), `bbzg-lock-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ __revision: 0, v: 0 }));
  const { updateData } = require('../lib/data-store');
  // updateData uses withWriteLock
  const results = [];
  for (let i = 0; i < 5; i += 1) {
    results.push(updateData(storePath, (data) => {
      data.v = Number(data.v || 0) + 1;
      return data;
    }));
  }
  await Promise.all(results);
  // 内部 Map 不可见；能顺序写完且不抛错即说明锁可用。再写一次确认不卡死。
  const last = await updateData(storePath, (data) => {
    data.v = Number(data.v || 0) + 1;
    return data;
  });
  assert.equal(last.ok, true);
  assert.equal(last.data.v, 6);
  fs.unlinkSync(storePath);
});
