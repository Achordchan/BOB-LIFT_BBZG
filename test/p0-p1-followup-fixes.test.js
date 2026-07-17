const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const { getData, saveData, updateDataSync } = require('../lib/data-store');
const { getClientIp } = require('../lib/request-ip');
const { registerDealRoutes } = require('../routes/deals');
const { registerTargetsRoutes } = require('../routes/targets');
const { configureApp } = require('../app/create-app');

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

function createAuthProbe() {
  const app = express();
  configureApp(app);
  let captured = null;
  app.use('/api/', (req, res) => {
    captured = { method: req.method, path: req.path };
    res.status(200).json({ ok: true, path: req.path });
  });
  return { app, getCaptured: () => captured };
}

function invokeMiddleware(app, req) {
  return new Promise((resolve) => {
    const middlewares = app._router.stack
      .filter((layer) => !layer.route && layer.name !== 'query' && layer.name !== 'expressInit')
      .map((layer) => layer.handle);

    const res = {
      statusCode: 200,
      body: null,
      headersSent: false,
      status(code) { this.statusCode = code; return this; },
      json(payload) {
        this.body = payload;
        this.headersSent = true;
        resolve({ statusCode: this.statusCode, body: payload });
        return this;
      },
      redirect() { resolve({ statusCode: this.statusCode, body: { redirect: true } }); }
    };

    let index = 0;
    const next = (err) => {
      if (err) {
        resolve({ statusCode: 500, body: { error: String(err) } });
        return;
      }
      const mw = middlewares[index++];
      if (!mw) {
        resolve({ statusCode: res.statusCode, body: res.body || { fellThrough: true } });
        return;
      }
      try {
        mw(req, res, next);
      } catch (error) {
        resolve({ statusCode: 500, body: { error: String(error) } });
      }
    };
    next();
  });
}

test('公开写接口默认拒绝匿名访问', async () => {
  const prevToken = process.env.BBZG_PUBLIC_WRITE_TOKEN;
  const prevAllow = process.env.BBZG_ALLOW_PUBLIC_WRITE;
  delete process.env.BBZG_PUBLIC_WRITE_TOKEN;
  delete process.env.BBZG_ALLOW_PUBLIC_WRITE;

  const app = express();
  configureApp(app);
  const layers = app._router.stack.filter((layer) => typeof layer.handle === 'function' && !layer.route);
  const authLayer = layers[layers.length - 1];
  const result = await new Promise((resolve) => {
    const req = {
      method: 'POST',
      path: '/deals/add',
      session: {},
      query: {},
      body: {},
      get() { return ''; }
    };
    req.method = 'POST';
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ statusCode: this.statusCode, body: payload }); }
    };
    authLayer.handle(req, res, () => resolve({ statusCode: 200, body: { next: true } }));
  });
  assert.equal(result.statusCode, 401);
  assert.equal(result.body.success, false);

  if (prevToken == null) delete process.env.BBZG_PUBLIC_WRITE_TOKEN;
  else process.env.BBZG_PUBLIC_WRITE_TOKEN = prevToken;
  if (prevAllow == null) delete process.env.BBZG_ALLOW_PUBLIC_WRITE;
  else process.env.BBZG_ALLOW_PUBLIC_WRITE = prevAllow;
});

test('公开写接口接受写入 token', async () => {
  const prevToken = process.env.BBZG_PUBLIC_WRITE_TOKEN;
  const prevAllow = process.env.BBZG_ALLOW_PUBLIC_WRITE;
  process.env.BBZG_PUBLIC_WRITE_TOKEN = 'secret-token';
  delete process.env.BBZG_ALLOW_PUBLIC_WRITE;

  const app = express();
  configureApp(app);
  // append terminal handler after auth middleware
  app.get('/api/deals/add', (req, res) => res.json({ success: true }));

  // Use full stack via handle is hard; verify middleware allows next by checking no 401 and no early json
  let nextCalled = false;
  const layers = app._router.stack.filter((layer) => typeof layer.handle === 'function' && !layer.route);
  const authLayer = layers[layers.length - 1];
  await new Promise((resolve) => {
    const req = {
      method: 'POST',
      path: '/deals/add',
      session: {},
      query: {},
      body: {},
      get(name) { return name.toLowerCase() === 'x-bbzg-write-token' ? 'secret-token' : ''; }
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ statusCode: this.statusCode, body: payload }); }
    };
    authLayer.handle(req, res, () => {
      nextCalled = true;
      resolve({ nextCalled: true });
    });
  }).then((result) => {
    assert.equal(result.nextCalled || nextCalled, true);
  });

  if (prevToken == null) delete process.env.BBZG_PUBLIC_WRITE_TOKEN;
  else process.env.BBZG_PUBLIC_WRITE_TOKEN = prevToken;
  if (prevAllow == null) delete process.env.BBZG_ALLOW_PUBLIC_WRITE;
  else process.env.BBZG_ALLOW_PUBLIC_WRITE = prevAllow;
});

test('/api/health 在公开只读白名单中', async () => {
  const prev = process.env.BBZG_PUBLIC_WRITE_TOKEN;
  delete process.env.BBZG_PUBLIC_WRITE_TOKEN;
  const app = express();
  configureApp(app);
  let nextCalled = false;
  const layers = app._router.stack.filter((layer) => typeof layer.handle === 'function' && !layer.route);
  const authLayer = layers[layers.length - 1];
  await new Promise((resolve) => {
    const req = { method: 'GET', path: '/health', session: {}, query: {}, body: {}, get() { return ''; } };
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ denied: true, payload, statusCode: this.statusCode }); }
    };
    authLayer.handle(req, res, () => {
      nextCalled = true;
      resolve({ nextCalled: true });
    });
  }).then((result) => {
    assert.equal(result.nextCalled || nextCalled, true);
  });
  if (prev == null) delete process.env.BBZG_PUBLIC_WRITE_TOKEN;
  else process.env.BBZG_PUBLIC_WRITE_TOKEN = prev;
});

test('首笔新成交会迁移历史账本而不是覆盖', async () => {
  let data = {
    dealAmount: 300,
    users: [{ id: 'u1', name: '张三', position: '运营' }],
    music: [],
    celebrationMessages: [],
    platformTargets: [],
    dealsHistory: [
      { id: 'old-1', amount: 100, person: '张三', userId: 'u1', platform: '阿里巴巴', timestamp: '2026-01-01T00:00:00.000Z' },
      { id: 'old-2', amount: 200, person: '张三', userId: 'u1', platform: '阿里巴巴', timestamp: '2026-01-02T00:00:00.000Z' }
    ]
    // 故意没有 dealsLedger
  };
  const app = express();
  registerDealRoutes(app, {
    getData: () => data,
    saveData: (next) => { data = next; return true; },
    uuidv4: () => 'deal-new',
    getUserMusicConfig: () => null,
    parseDealAmountInput: (v) => Number(String(v).replace(/[^\d.]/g, '')) || 0,
    formatDealAmountForTts: (_raw, n) => Number(n).toFixed(2)
  });
  const handler = findRouteHandler(app, 'post', '/api/deals/add');
  const { statusCode, body } = await invoke(handler, {
    method: 'POST',
    body: { zongjine: '50', fuzeren: '张三', laiyuanpingtai: '阿里巴巴' },
    query: {}
  });
  assert.equal(statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(data.dealsLedger.length, 3);
  assert.equal(data.dealsLedger[0].id, 'old-1');
  assert.equal(data.dealsLedger[2].id, 'deal-new');

  const lb = findRouteHandler(app, 'get', '/api/deals/leaderboard');
  const board = await invoke(lb, {});
  assert.equal(board.body.success, true);
  assert.equal(board.body.leaderboard[0].amount, 350);
});

test('目标首次迁移默认置零并标记 migrationPending', async () => {
  let data = {
    inquiryCount: 3904,
    dealAmount: 6031798.85,
    targets: {
      inquiryTarget: 11000,
      dealTarget: 35000000,
      resetPeriod: 'weekly',
      lastResetTime: '2026-07-15T01:58:33.023Z'
      // 无 periodKey / baseline
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
  assert.equal(body.periodInquiryCount, 0);
  assert.equal(body.periodDealAmount, 0);
  assert.equal(body.migrationPending, true);
  assert.equal(data.targets.periodBaselineInquiryCount, 3904);
  assert.equal(data.targets.periodBaselineDealAmount, 6031798.85);
});

test('目标跨周首次迁移默认也不伪装累计为周进度', async () => {
  let data = {
    inquiryCount: 3904,
    dealAmount: 6031798.85,
    targets: {
      inquiryTarget: 11000,
      dealTarget: 35000000,
      resetPeriod: 'weekly',
      lastResetTime: '2026-07-10T01:58:33.023Z'
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
  assert.equal(body.periodInquiryCount, 0);
  assert.equal(body.periodDealAmount, 0);
  assert.equal(body.migrationPending, true);
  assert.match(String(body.periodKey), /^\d{4}-W\d{2}$/);
});

test('管理员可写入本周期进度并反推基线', async () => {
  let data = {
    inquiryCount: 3904,
    dealAmount: 6031798.85,
    targets: {
      inquiryTarget: 11000,
      dealTarget: 35000000,
      resetPeriod: 'weekly',
      periodKey: '2026-W29',
      periodBaselineInquiryCount: 3904,
      periodBaselineDealAmount: 6031798.85,
      migrationPending: true
    }
  };
  const app = express();
  registerTargetsRoutes(app, {
    getData: () => data,
    saveData: (next) => { data = next; return true; }
  });
  const handler = findRouteHandler(app, 'post', '/api/targets');
  const { body } = await invoke(handler, {
    session: { loggedIn: true },
    body: {
      periodInquiryCount: 120,
      periodDealAmount: 50000,
      expectedInquiryCount: 3904,
      expectedDealAmount: 6031798.85,
      expectedRevision: 0
    }
  });
  assert.equal(body.success, true);
  assert.equal(body.periodInquiryCount, 120);
  assert.equal(body.periodDealAmount, 50000);
  assert.equal(data.targets.periodBaselineInquiryCount, 3904 - 120);
  assert.equal(data.targets.periodBaselineDealAmount, 6031798.85 - 50000);
  assert.equal(data.targets.migrationPending, false);
});

test('配置写 token 后 TTS POST 仍允许匿名（不与写凭证混用）', async () => {
  const prevToken = process.env.BBZG_PUBLIC_WRITE_TOKEN;
  const prevAllow = process.env.BBZG_ALLOW_PUBLIC_WRITE;
  process.env.BBZG_PUBLIC_WRITE_TOKEN = 'secret-token';
  delete process.env.BBZG_ALLOW_PUBLIC_WRITE;

  const app = express();
  configureApp(app);
  const layers = app._router.stack.filter((layer) => typeof layer.handle === 'function' && !layer.route);
  const authLayer = layers[layers.length - 1];
  const result = await new Promise((resolve) => {
    const req = {
      method: 'POST',
      path: '/text-to-speech',
      session: {},
      query: {},
      body: {},
      get() { return ''; }
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ statusCode: this.statusCode, body: payload }); }
    };
    authLayer.handle(req, res, () => resolve({ nextCalled: true }));
  });
  assert.equal(result.nextCalled, true);

  if (prevToken == null) delete process.env.BBZG_PUBLIC_WRITE_TOKEN;
  else process.env.BBZG_PUBLIC_WRITE_TOKEN = prevToken;
  if (prevAllow == null) delete process.env.BBZG_ALLOW_PUBLIC_WRITE;
  else process.env.BBZG_ALLOW_PUBLIC_WRITE = prevAllow;
});

test('TTS inflight Promise 有兜底 catch，避免 unhandledRejection', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'tts.js'), 'utf8');
  assert.equal(src.includes('inflightPromise.catch(() => {});'), true);
});

test('部署脚本包含生产环境变量预检', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'deploy-baota.sh'), 'utf8');
  assert.equal(src.includes('生产环境变量预检'), true);
  assert.equal(src.includes('BBZG_SESSION_SECRET'), true);
  assert.equal(src.includes('BBZG_PUBLIC_WRITE_TOKEN'), true);
});

test('updateDataSync 在锁内重读，避免旧快照覆盖', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-cas-'));
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify({ dealAmount: 1, __revision: 0 }));

  // 模拟持有旧快照
  const stale = getData(file);
  assert.equal(stale.dealAmount, 1);

  // 期间有新写入
  saveData(file, { ...getData(file), dealAmount: 999 });
  assert.equal(getData(file).dealAmount, 999);

  // 旧快照直接 save 应被拒绝
  const rejected = saveData(file, stale);
  assert.equal(rejected, false);
  assert.equal(getData(file).dealAmount, 999);

  // updateDataSync 基于最新数据修改
  const updated = updateDataSync(file, (latest) => {
    latest.dealAmount = Number(latest.dealAmount) + 1;
  });
  assert.equal(updated.ok, true);
  assert.equal(getData(file).dealAmount, 1000);
});

test('auth/tts 源码使用共享 getClientIp', () => {
  const auth = fs.readFileSync(path.join(__dirname, '..', 'routes', 'auth.js'), 'utf8');
  const tts = fs.readFileSync(path.join(__dirname, '..', 'routes', 'tts.js'), 'utf8');
  assert.equal(auth.includes("require('../lib/request-ip')"), true);
  assert.equal(tts.includes("require('../lib/request-ip')"), true);
  assert.equal(auth.includes('headers[\'x-forwarded-for\']'), false);
  assert.equal(tts.includes('headers[\'x-forwarded-for\']'), false);
});

test('TTS 不再遮蔽 rejectInFlight/clearInFlight/filePath', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'tts.js'), 'utf8');
  assert.equal(src.includes('let rejectInFlight;'), false);
  assert.equal(src.includes('const clearInFlight = () =>'), false);
  assert.equal(src.includes('let filePath = path.join'), false);
  assert.equal(src.includes('clearInFlight = () =>'), true);
});

test('部署 workflow 使用 /api/health', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'deploy-baota.yml'), 'utf8');
  assert.equal(src.includes('DEPLOY_HEALTH_PATH: /api/health'), true);
  assert.equal(src.includes('DEPLOY_HEALTH_PATH: /health-check'), false);
});

test('leaderboard 不再仅靠 jolin 等名字判定 mock', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'leaderboard.js'), 'utf8');
  assert.equal(src.includes('item.mock === true'), true);
  assert.equal(src.includes('mockNames = { jolin: 1'), false);
});

test('npm test 脚本关闭 TTS 维护任务', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.match(pkg.scripts.test, /BBZG_DISABLE_TTS_MAINTENANCE=1/);
  assert.match(pkg.scripts.test, /test-force-exit/);
});


test('写入 token 只接受请求头，不接受 query.token', async () => {
  const prevToken = process.env.BBZG_PUBLIC_WRITE_TOKEN;
  process.env.BBZG_PUBLIC_WRITE_TOKEN = 'secret-token';
  const app = express();
  configureApp(app);
  const authLayer = app._router.stack.filter((layer) => typeof layer.handle === 'function' && !layer.route).slice(-1)[0];
  const result = await new Promise((resolve) => {
    authLayer.handle(
      {
        method: 'POST',
        path: '/deals/add',
        session: {},
        query: { token: 'secret-token' },
        body: {},
        get() { return ''; }
      },
      {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { resolve({ statusCode: this.statusCode, body: payload }); }
      },
      () => resolve({ nextCalled: true })
    );
  });
  assert.equal(result.statusCode, 401);
  if (prevToken == null) delete process.env.BBZG_PUBLIC_WRITE_TOKEN;
  else process.env.BBZG_PUBLIC_WRITE_TOKEN = prevToken;
});


test('session 使用文件存储而非默认 MemoryStore', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'create-app.js'), 'utf8');
  assert.equal(src.includes("require('../lib/session-file-store')"), true);
  assert.equal(src.includes('new FileStore'), true);
});

test('部署环境预检在 rsync 之前且不信任项目 .env', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'deploy-baota.sh'), 'utf8');
  const pre = src.indexOf('远端生产环境变量预检（rsync 前）');
  const rsync = src.indexOf('rsync -az --delete');
  assert.ok(pre >= 0 && rsync >= 0 && pre < rsync);
  assert.equal(src.includes('不含项目 .env'), true);
  assert.equal(src.includes('项目目录 .env 不会被自动加载'), true);
});

test('默认禁用 GET 写入成交接口', async () => {
  const prev = process.env.BBZG_ALLOW_LEGACY_GET_WRITE;
  delete process.env.BBZG_ALLOW_LEGACY_GET_WRITE;
  let data = {
    dealAmount: 0,
    users: [],
    music: [],
    celebrationMessages: [],
    platformTargets: [],
    dealsHistory: []
  };
  const app = express();
  registerDealRoutes(app, {
    getData: () => data,
    saveData: (next) => { data = next; return true; },
    uuidv4: () => 'x',
    getUserMusicConfig: () => null,
    parseDealAmountInput: (v) => Number(String(v).replace(/[^\d.]/g, '')) || 0,
    formatDealAmountForTts: (_raw, n) => Number(n).toFixed(2)
  });
  const handler = findRouteHandler(app, 'get', '/api/deals/add');
  const { statusCode, body } = await invoke(handler, {
    query: { zongjine: '50', fuzeren: '张三', laiyuanpingtai: '阿里巴巴' }
  });
  assert.equal(statusCode, 405);
  assert.equal(body.success, false);
  if (prev == null) delete process.env.BBZG_ALLOW_LEGACY_GET_WRITE;
  else process.env.BBZG_ALLOW_LEGACY_GET_WRITE = prev;
});


test('无 periodKey 时首次 POST 校准进度不会被迁移覆盖', async () => {
  let data = {
    inquiryCount: 3904,
    dealAmount: 6031798.85,
    targets: {
      inquiryTarget: 11000,
      dealTarget: 35000000,
      resetPeriod: 'weekly',
      lastResetTime: '2026-07-10T01:58:33.023Z'
      // 无 periodKey
    }
  };
  const app = express();
  registerTargetsRoutes(app, {
    getData: () => data,
    saveData: (next) => { data = next; return true; }
  });
  const handler = findRouteHandler(app, 'post', '/api/targets');
  const { body } = await invoke(handler, {
    session: { loggedIn: true },
    body: {
      periodInquiryCount: 120,
      periodDealAmount: 50000,
      expectedInquiryCount: 3904,
      expectedDealAmount: 6031798.85,
      expectedRevision: Number(data.__revision || 0)
    }
  });
  assert.equal(body.success, true);
  assert.equal(body.periodInquiryCount, 120);
  assert.equal(body.periodDealAmount, 50000);
  assert.equal(data.targets.migrationPending, false);
  assert.equal(data.targets.periodBaselineInquiryCount, 3904 - 120);
  assert.equal(data.targets.periodBaselineDealAmount, 6031798.85 - 50000);
});

test('部署脚本 heredoc 结束符精确匹配', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'deploy-baota.sh'), 'utf8');
  assert.equal(src.includes("<<'REMOTE_BACKUP\\'"), false);
  assert.equal(src.includes("<<'REMOTE_BACKUP'"), true);
  // opener and closer both present as exact lines
  const lines = src.split(/\n/);
  assert.equal(lines.some((l) => l.trim() === "'bash -s' <<'REMOTE_BACKUP'" || l.includes("<<'REMOTE_BACKUP'")), true);
  assert.equal(lines.some((l) => l.trim() === 'REMOTE_BACKUP'), true);
});

test('session 临时文件名包含随机段且有 sid 串行', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'session-file-store.js'), 'utf8');
  assert.equal(src.includes('randomBytes'), true);
  assert.equal(src.includes('_withSidLock'), true);
});

test('main.js 不再暴露 testDealAPI', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'main.js'), 'utf8');
  assert.equal(src.includes('testDealAPI'), false);
});

test('后台首页设置包含本周期进度校准字段', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'admin', 'pages', 'HomeSettingsPage.tsx'), 'utf8');
  assert.equal(src.includes('migrationPending'), true);
  assert.equal(src.includes('periodInquiryCount'), true);
  assert.equal(src.includes('periodDealAmount'), true);
  assert.equal(src.includes('本周期进度待校准'), true);
  assert.equal(src.includes('确认周期进度'), true);
  assert.equal(src.includes('保存总目标'), true);
  // 保存总目标不应再附带 period 字段
  assert.equal(src.includes('保存总目标与本周期进度'), false);
  const saveTargetIdx = src.indexOf('async function saveTarget');
  const confirmIdx = src.indexOf('async function confirmPeriodProgress');
  assert.ok(saveTargetIdx >= 0 && confirmIdx > saveTargetIdx);
  const saveBody = src.slice(saveTargetIdx, confirmIdx);
  assert.equal(saveBody.includes('periodInquiryCount'), false);
  assert.equal(saveBody.includes('periodDealAmount'), false);
});


test('session 锁队列会在完成后释放', async () => {
  const session = require('express-session');
  const { createFileSessionStore } = require('../lib/session-file-store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-sess-queue-'));
  const FileStore = createFileSessionStore(session);
  const store = new FileStore({ path: dir, ttl: 3600 });
  await Promise.all(Array.from({ length: 100 }, (_, i) => new Promise((resolve, reject) => {
    store.set('sid-' + i, { cookie: { maxAge: 60000 }, n: i }, (err) => err ? reject(err) : resolve());
  })));
  // 等 microtask/finally 清理
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(store._queues.size, 0);
});

test('保存总目标不提交进度字段（源码约束）', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'admin', 'pages', 'HomeSettingsPage.tsx'), 'utf8');
  assert.match(src, /async function saveTarget[\s\S]*?apiJson\('\/api\/targets', 'POST', \{[\s\S]*?inquiryTarget[\s\S]*?dealTarget[\s\S]*?resetPeriod[\s\S]*?\}\)/);
  const m = src.match(/async function saveTarget[\s\S]*?async function confirmPeriodProgress/);
  assert.ok(m);
  assert.equal(m[0].includes('periodInquiryCount'), false);
});


test('过期校准表单会返回 409 且不修改基线', async () => {
  let data = {
    __revision: 3,
    inquiryCount: 202,
    dealAmount: 100100,
    targets: {
      inquiryTarget: 11000,
      dealTarget: 35000000,
      resetPeriod: 'weekly',
      periodKey: '2026-W29',
      periodBaselineInquiryCount: 1,
      periodBaselineDealAmount: 0,
      periodInquiryCount: 201,
      periodDealAmount: 100000,
      migrationPending: false
    }
  };
  // simulate new inquiry/deal after page load (page saw 201/100000 totals 201/100000? actually page load totals 201/100000 progress 201/100000)
  // page loaded when inquiryCount=201 dealAmount=100000 progress=201/100000 baseline 0/0
  data = {
    __revision: 4,
    inquiryCount: 202,
    dealAmount: 100100,
    targets: {
      inquiryTarget: 11000,
      dealTarget: 35000000,
      resetPeriod: 'weekly',
      periodKey: '2026-W29',
      periodBaselineInquiryCount: 0,
      periodBaselineDealAmount: 0,
      periodInquiryCount: 202,
      periodDealAmount: 100100,
      migrationPending: false
    }
  };
  const baselineBefore = { ...data.targets };
  const app = express();
  registerTargetsRoutes(app, {
    getData: () => data,
    saveData: (next) => { data = next; return true; }
  });
  const handler = findRouteHandler(app, 'post', '/api/targets');
  const { statusCode, body } = await invoke(handler, {
    session: { loggedIn: true },
    body: {
      periodInquiryCount: 201,
      periodDealAmount: 100000,
      expectedInquiryCount: 201,
      expectedDealAmount: 100000,
      expectedRevision: 3
    }
  });
  assert.equal(statusCode, 409);
  assert.equal(body.success, false);
  assert.equal(body.conflict, true);
  assert.equal(data.targets.periodBaselineInquiryCount, baselineBefore.periodBaselineInquiryCount);
  assert.equal(data.targets.periodBaselineDealAmount, baselineBefore.periodBaselineDealAmount);
  assert.equal(data.targets.periodInquiryCount, 202);
  assert.equal(data.targets.periodDealAmount, 100100);
});

test('匹配快照的校准请求成功', async () => {
  let data = {
    __revision: 4,
    inquiryCount: 202,
    dealAmount: 100100,
    targets: {
      inquiryTarget: 11000,
      dealTarget: 35000000,
      resetPeriod: 'weekly',
      periodKey: '2026-W29',
      periodBaselineInquiryCount: 0,
      periodBaselineDealAmount: 0,
      migrationPending: false
    }
  };
  const app = express();
  registerTargetsRoutes(app, {
    getData: () => data,
    saveData: (next) => { data = next; return true; }
  });
  const handler = findRouteHandler(app, 'post', '/api/targets');
  const { statusCode, body } = await invoke(handler, {
    session: { loggedIn: true },
    body: {
      periodInquiryCount: 202,
      periodDealAmount: 100100,
      expectedInquiryCount: 202,
      expectedDealAmount: 100100,
      expectedRevision: 4
    }
  });
  assert.equal(statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(body.periodInquiryCount, 202);
  assert.equal(body.periodDealAmount, 100100);
});

test('后台校准提交携带 expected 快照字段', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'admin', 'pages', 'HomeSettingsPage.tsx'), 'utf8');
  assert.equal(src.includes('expectedInquiryCount'), true);
  assert.equal(src.includes('expectedDealAmount'), true);
  assert.equal(src.includes('expectedRevision'), true);
});


test('不完整快照不能绕过成交冲突检查', async () => {
  let data = {
    __revision: 4,
    inquiryCount: 202,
    dealAmount: 100100,
    targets: {
      inquiryTarget: 11000,
      dealTarget: 35000000,
      resetPeriod: 'weekly',
      periodKey: '2026-W29',
      periodBaselineInquiryCount: 0,
      periodBaselineDealAmount: 0,
      periodInquiryCount: 202,
      periodDealAmount: 100100,
      migrationPending: false
    }
  };
  const app = express();
  registerTargetsRoutes(app, {
    getData: () => data,
    saveData: (next) => { data = next; return true; }
  });
  const handler = findRouteHandler(app, 'post', '/api/targets');
  // 只带匹配的 expectedInquiryCount，却提交过期成交进度
  const { statusCode, body } = await invoke(handler, {
    session: { loggedIn: true },
    body: {
      periodInquiryCount: 202,
      periodDealAmount: 100000,
      expectedInquiryCount: 202
      // 故意不带 expectedDealAmount / expectedRevision
    }
  });
  assert.equal(statusCode, 409);
  assert.equal(body.success, false);
  assert.equal(data.targets.periodDealAmount, 100100);
  assert.equal(data.targets.periodBaselineDealAmount, 0);
});

test('仅 expectedRevision 匹配时允许校准', async () => {
  let data = {
    __revision: 9,
    inquiryCount: 202,
    dealAmount: 100100,
    targets: {
      inquiryTarget: 11000,
      dealTarget: 35000000,
      resetPeriod: 'weekly',
      periodKey: '2026-W29',
      periodBaselineInquiryCount: 0,
      periodBaselineDealAmount: 0,
      migrationPending: false
    }
  };
  const app = express();
  registerTargetsRoutes(app, {
    getData: () => data,
    saveData: (next) => { data = next; return true; }
  });
  const handler = findRouteHandler(app, 'post', '/api/targets');
  const { statusCode, body } = await invoke(handler, {
    session: { loggedIn: true },
    body: {
      periodInquiryCount: 202,
      periodDealAmount: 100100,
      expectedRevision: 9
    }
  });
  assert.equal(statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(body.periodInquiryCount, 202);
  assert.equal(body.periodDealAmount, 100100);
});

test('校准在 updateData 锁内重检冲突，避免并发后假成功', async () => {
  let data = {
    __revision: 4,
    inquiryCount: 202,
    dealAmount: 100100,
    targets: {
      inquiryTarget: 11000,
      dealTarget: 35000000,
      resetPeriod: 'weekly',
      periodKey: '2026-W29',
      periodBaselineInquiryCount: 0,
      periodBaselineDealAmount: 0,
      periodInquiryCount: 202,
      periodDealAmount: 100100,
      migrationPending: false
    }
  };
  const app = express();
  registerTargetsRoutes(app, {
    getData: () => data,
    saveData: (next) => { data = next; return true; },
    updateData: (mutator) => {
      // 模拟锁内重读：进入 mutator 前成交已增加
      data = {
        ...data,
        __revision: 5,
        dealAmount: 100200,
        targets: {
          ...data.targets,
          periodDealAmount: 100200
        }
      };
      const result = mutator(data);
      if (result === false) return { ok: false, cancelled: true, data };
      data = result && typeof result === 'object' ? result : data;
      data.__revision = Number(data.__revision || 0) + 1;
      return { ok: true, cancelled: false, data };
    }
  });
  const handler = findRouteHandler(app, 'post', '/api/targets');
  const { statusCode, body } = await invoke(handler, {
    session: { loggedIn: true },
    body: {
      periodInquiryCount: 202,
      periodDealAmount: 100100,
      expectedInquiryCount: 202,
      expectedDealAmount: 100100,
      expectedRevision: 4
    }
  });
  assert.equal(statusCode, 409);
  assert.equal(body.success, false);
  assert.equal(data.dealAmount, 100200);
  assert.equal(data.targets.periodDealAmount, 100200);
});

test('校准拒绝非数字进度且不清除迁移状态', async () => {
  let data = {
    __revision: 9,
    inquiryCount: 202,
    dealAmount: 100100,
    targets: {
      inquiryTarget: 11000,
      dealTarget: 35000000,
      resetPeriod: 'weekly',
      periodKey: '2026-W29',
      periodBaselineInquiryCount: 0,
      periodBaselineDealAmount: 0,
      periodInquiryCount: 202,
      periodDealAmount: 100100,
      migrationPending: true
    }
  };
  const before = JSON.parse(JSON.stringify(data.targets));
  const app = express();
  registerTargetsRoutes(app, {
    getData: () => data,
    saveData: (next) => { data = next; return true; },
    updateData: (mutator) => {
      const result = mutator(data);
      if (result === false) return { ok: false, cancelled: true, data };
      data = result && typeof result === 'object' ? result : data;
      data.__revision = Number(data.__revision || 0) + 1;
      return { ok: true, cancelled: false, data };
    }
  });
  const handler = findRouteHandler(app, 'post', '/api/targets');
  const { statusCode, body } = await invoke(handler, {
    session: { loggedIn: true },
    body: {
      periodDealAmount: 'abc',
      expectedRevision: 9
    }
  });
  assert.equal(statusCode, 400);
  assert.equal(body.success, false);
  assert.deepEqual(data.targets, before);

  const booleanResult = await invoke(handler, {
    session: { loggedIn: true },
    body: {
      periodInquiryCount: true,
      expectedRevision: 9
    }
  });
  assert.equal(booleanResult.statusCode, 400);
  assert.equal(booleanResult.body.success, false);
  assert.deepEqual(data.targets, before);
});

test('校准拒绝超过累计值的进度', async () => {
  let data = {
    __revision: 9,
    inquiryCount: 202,
    dealAmount: 100100,
    targets: {
      inquiryTarget: 11000,
      dealTarget: 35000000,
      resetPeriod: 'weekly',
      periodKey: '2026-W29',
      periodBaselineInquiryCount: 0,
      periodBaselineDealAmount: 0,
      periodInquiryCount: 202,
      periodDealAmount: 100100,
      migrationPending: true
    }
  };
  const before = JSON.parse(JSON.stringify(data.targets));
  const app = express();
  registerTargetsRoutes(app, {
    getData: () => data,
    saveData: (next) => { data = next; return true; },
    updateData: (mutator) => {
      const result = mutator(data);
      if (result === false) return { ok: false, cancelled: true, data };
      data = result && typeof result === 'object' ? result : data;
      data.__revision = Number(data.__revision || 0) + 1;
      return { ok: true, cancelled: false, data };
    }
  });
  const handler = findRouteHandler(app, 'post', '/api/targets');
  const { statusCode, body } = await invoke(handler, {
    session: { loggedIn: true },
    body: {
      periodInquiryCount: 203,
      periodDealAmount: 100100.01,
      expectedRevision: 9
    }
  });
  assert.equal(statusCode, 400);
  assert.equal(body.success, false);
  assert.deepEqual(data.targets, before);
});

test('TTS 源码通过 ttsGate.run 执行合成任务', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'tts.js'), 'utf8');
  assert.equal(src.includes('ttsGate.run'), true);
  assert.equal(src.includes('await inflightPromise'), true);
});

test('部署预检强制要求 BBZG_TRUST_PROXY', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'deploy-baota.sh'), 'utf8');
  assert.equal(src.includes('required_proxy'), true);
  assert.equal(src.includes('has_trust_proxy'), true);
  assert.equal(src.includes('BBZG_TRUST_PROXY=1'), true);
  assert.match(src, /if not has_trust_proxy:[\s\S]*sys\.exit\(1\)/);
  assert.equal(src.includes('found_sources'), true);
  assert.equal(/found\[k\]\s*=\s*source/.test(src), false);
  assert.equal(src.includes('found[k] = str(v).strip()'), true);
  assert.equal(src.includes('int(proxy_val) >= 1'), true);
  assert.equal(src.includes('不要设 0/false'), true);
});

test('部署预检把环境变量值与来源路径分开存储（逻辑复现）', () => {
  const found = {};
  const found_sources = {};
  const keys = new Set(['BBZG_TRUST_PROXY', 'BBZG_SESSION_SECRET']);
  function absorb(source, mapping) {
    for (const [k, v] of Object.entries(mapping || {})) {
      if (keys.has(k) && String(v).trim() && !(k in found)) {
        found[k] = String(v).trim();
        found_sources[k] = source;
      }
    }
  }
  absorb('/www/server/panel/vhost/nodejs/env/bbzg_app', {
    BBZG_TRUST_PROXY: '1',
    BBZG_SESSION_SECRET: 'secret'
  });
  assert.equal(found.BBZG_TRUST_PROXY, '1');
  assert.equal(found_sources.BBZG_TRUST_PROXY.includes('/www/server'), true);
  const proxy_val = String(found.BBZG_TRUST_PROXY || '').trim().toLowerCase();
  const proxy_ok = proxy_val === '1' || proxy_val === 'true' || (/^\d+$/.test(proxy_val) && Number(proxy_val) >= 1);
  assert.equal(proxy_ok, true);
  assert.equal((() => {
    const zero = '0';
    return zero === '1' || zero === 'true' || (/^\d+$/.test(zero) && Number(zero) >= 1);
  })(), false);
});

test('GitHub Actions 部署前执行 npm test', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'deploy-baota.yml'), 'utf8');
  assert.equal(/npm test/.test(src), true);
  const testIdx = src.indexOf('npm test');
  const deployIdx = src.indexOf('bash scripts/deploy-baota.sh');
  assert.ok(testIdx >= 0 && deployIdx > testIdx);
});

test('默认密码强制修改由服务端中间件限制', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'create-app.js'), 'utf8');
  assert.equal(src.includes('mustChangePassword'), true);
  assert.equal(src.includes('请先修改默认密码后再使用后台功能'), true);
  assert.equal(src.includes('bbzgGetData'), true);
});

test('data.js 周期进度对 null 回退累计值', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'data.js'), 'utf8');
  assert.equal(src.includes('periodInquiryCount === null'), true);
  assert.equal(src.includes('periodDealAmount === null'), true);
});

test('data-store 异步写锁用同一 Promise 清理 Map', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'data-store.js'), 'utf8');
  assert.equal(src.includes('writeLocks.get(dataPath) === queued'), true);
  assert.equal(src.includes('writeLocks.set(dataPath, previous.then'), false);
});

test('music/egg 不再保留未使用的 NETEASE_API_BASE 常量', () => {
  const music = fs.readFileSync(path.join(__dirname, '..', 'routes', 'music.js'), 'utf8');
  const egg = fs.readFileSync(path.join(__dirname, '..', 'routes', 'egg.js'), 'utf8');
  assert.equal(music.includes('NETEASE_API_BASE'), false);
  assert.equal(egg.includes('NETEASE_API_BASE'), false);
});

test('强制改密时管理员会话不能写成交/询盘', async () => {
  const prevToken = process.env.BBZG_PUBLIC_WRITE_TOKEN;
  delete process.env.BBZG_PUBLIC_WRITE_TOKEN;
  const app = express();
  app.set('bbzgGetData', () => ({ admin: { username: 'admin', mustChangePassword: true } }));
  configureApp(app);
  const stack = app._router.stack.filter((l) => l.name === 'bound dispatch' || (l.handle && l.regexp)).map((l) => l.handle);
  // 找到 /api/ 鉴权中间件：遍历 stack 找有 length 3 的
  const mws = [];
  app._router.stack.forEach((layer) => {
    if (layer.name === 'router') return;
    if (typeof layer.handle === 'function' && layer.regexp && String(layer.regexp).includes('api')) {
      mws.push(layer.handle);
    } else if (!layer.route && typeof layer.handle === 'function') {
      mws.push(layer.handle);
    }
  });
  assert.ok(mws.length > 0);
  const authMw = mws[mws.length - 1];
  async function hit(path) {
    return new Promise((resolve) => {
      const req = {
        method: 'POST',
        path,
        session: { loggedIn: true },
        get() { return ''; }
      };
      const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; resolve({ statusCode: this.statusCode, body: payload }); }
      };
      authMw(req, res, () => resolve({ statusCode: 200, body: { passed: true } }));
    });
  }
  const users = await hit('/users/add');
  const deals = await hit('/deals/add');
  const inquiries = await hit('/inquiries/add');
  assert.equal(users.statusCode, 403);
  assert.equal(deals.statusCode, 403);
  assert.equal(inquiries.statusCode, 403);
  if (prevToken == null) delete process.env.BBZG_PUBLIC_WRITE_TOKEN;
  else process.env.BBZG_PUBLIC_WRITE_TOKEN = prevToken;
});

test('TTS completed 回调等待 fileStream finish 后再 stat', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'tts.js'), 'utf8');
  assert.equal(src.includes("fileStream.once('finish'"), true);
  const completedIdx = src.indexOf("tts.on('completed'");
  const finishIdx = src.indexOf("fileStream.once('finish'", completedIdx);
  const endIdx = src.indexOf('fileStream.end()', finishIdx);
  const statIdx = src.indexOf('fs.statSync(filePath)', finishIdx);
  assert.ok(completedIdx >= 0 && finishIdx > completedIdx);
  assert.ok(statIdx > finishIdx);
  assert.ok(endIdx > finishIdx);
});

test('.bbzg-cache 已进入 gitignore 与部署 exclude', () => {
  const gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  const deploy = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'deploy-baota.sh'), 'utf8');
  assert.equal(gi.includes('.bbzg-cache'), true);
  assert.equal(deploy.includes('.bbzg-cache'), true);
});

test('BBZG_TRUST_PROXY=0 在预检语义中应判为无效', () => {
  function isProxyOk(raw) {
    const proxy_val = String(raw || '').trim().toLowerCase();
    return proxy_val === '1' || proxy_val === 'true' || (/^\d+$/.test(proxy_val) && Number(proxy_val) >= 1);
  }
  assert.equal(isProxyOk('1'), true);
  assert.equal(isProxyOk('true'), true);
  assert.equal(isProxyOk('2'), true);
  assert.equal(isProxyOk('0'), false);
  assert.equal(isProxyOk('false'), false);
  assert.equal(isProxyOk(''), false);
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'deploy-baota.sh'), 'utf8');
  assert.equal(src.includes('int(proxy_val) >= 1'), true);
});

test('部署 rsync 排除本地快照与 bbzg_ikPyS 目录', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'deploy-baota.sh'), 'utf8');
  assert.equal(src.includes('bbzg_ikPyS/'), true);
  assert.equal(src.includes('bbzg_production_snapshot_*/'), true);
  assert.equal(src.includes('bbzg_*.tar.gz'), true);
});

test('TTS 生产路径默认不打印完整业务文本', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'tts.js'), 'utf8');
  assert.equal(src.includes('文本转语音最终文本(截断)'), false);
  assert.equal(/console\.log\(`文本转语音请求: \$\{text/.test(src), false);
  assert.equal(src.includes('ttsDebug'), true);
});

test('package.json 不再依赖未使用的 pro-components', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(!!(pkg.dependencies && pkg.dependencies['@ant-design/pro-components']), false);
  assert.ok(pkg.dependencies.axios);
  assert.ok(pkg.dependencies.express);
  assert.equal(pkg.overrides && pkg.overrides['form-data'], '^4.0.6');
  assert.equal(pkg.overrides && pkg.overrides.ws, '^8.21.1');
});
