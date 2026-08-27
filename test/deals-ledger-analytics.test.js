const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { registerDealRoutes } = require('../routes/deals');
const ledgerLib = require('../lib/deals-ledger');

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
      headers: {},
      setHeader(name, value) {
        this.headers[String(name).toLowerCase()] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve({ statusCode: this.statusCode, body: payload, headers: this.headers });
        return this;
      },
      send(payload) {
        this.body = payload;
        resolve({ statusCode: this.statusCode, body: payload, headers: this.headers });
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

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function buildTestData() {
  return {
    users: [
      { id: 'u1', name: '张三', position: '销售' },
      { id: 'u2', name: '李四', position: '销售' }
    ],
    dealsHistory: [],
    dealsLedger: [
      { id: 'd1', amount: 100, person: '张三', userId: 'u1', platform: '阿里巴巴', timestamp: isoDaysAgo(0) },
      { id: 'd2', amount: 200, person: '李四', userId: 'u2', platform: '独立站', timestamp: isoDaysAgo(0) },
      { id: 'd3', amount: 1000, person: '张三', userId: 'u1', platform: '阿里巴巴', timestamp: isoDaysAgo(400) },
      { id: 'd4', amount: 50, person: '离职员工', userId: null, platform: '阿里巴巴', timestamp: isoDaysAgo(0) }
    ]
  };
}

function buildApp(data) {
  const app = express();
  registerDealRoutes(app, {
    getData: () => data,
    saveData: () => true,
    updateData: (mutator) => {
      mutator(data);
      return { ok: true, data };
    },
    uuidv4: () => 'test-uuid',
    getUserMusicConfig: () => null,
    parseDealAmountInput: (v) => Number(v) || 0,
    formatDealAmountForTts: (v) => String(v)
  });
  return app;
}

test('resolvePeriodRange 周期边界正确', () => {
  const now = new Date(2026, 7, 27, 15, 0, 0); // 2026-08-27 周四
  const daily = ledgerLib.resolvePeriodRange('daily', now);
  assert.equal(daily.start.getDate(), 27);
  assert.equal(daily.start.getHours(), 0);

  const weekly = ledgerLib.resolvePeriodRange('weekly', now);
  assert.equal(weekly.start.getDay(), 1); // 周一
  assert.equal(weekly.start.getDate(), 24);

  const monthly = ledgerLib.resolvePeriodRange('monthly', now);
  assert.equal(monthly.start.getDate(), 1);
  assert.equal(monthly.start.getMonth(), 7);

  const yearly = ledgerLib.resolvePeriodRange('yearly', now);
  assert.equal(yearly.start.getMonth(), 0);
  assert.equal(yearly.start.getDate(), 1);

  assert.equal(ledgerLib.resolvePeriodRange('all', now), null);
});

test('normalizePeriod 拒绝非法值并默认 all', () => {
  assert.equal(ledgerLib.normalizePeriod(undefined), 'all');
  assert.equal(ledgerLib.normalizePeriod(''), 'all');
  assert.equal(ledgerLib.normalizePeriod('Weekly'), 'weekly');
  assert.equal(ledgerLib.normalizePeriod('hack'), null);
});

test('排行榜按周期过滤：daily 不含 400 天前的成交', async () => {
  const app = buildApp(buildTestData());
  const handler = findRouteHandler(app, 'get', '/api/deals/leaderboard');

  const all = await invokeJson(handler, { query: {} });
  assert.equal(all.statusCode, 200);
  const allZhangsan = all.body.leaderboard.find((x) => x.name === '张三');
  assert.equal(allZhangsan.amount, 1100);

  const daily = await invokeJson(handler, { query: { period: 'daily' } });
  assert.equal(daily.body.period, 'daily');
  const dayZhangsan = daily.body.leaderboard.find((x) => x.name === '张三');
  assert.equal(dayZhangsan.amount, 100);
  // 无 userId 的历史人员进入临时行
  assert.ok(daily.body.leaderboard.find((x) => x.name === '离职员工' && x.amount === 50));
});

test('排行榜 period 非法时返回 400', async () => {
  const app = buildApp(buildTestData());
  const handler = findRouteHandler(app, 'get', '/api/deals/leaderboard');
  const bad = await invokeJson(handler, { query: { period: 'forever' } });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.success, false);
});

test('stats 聚合平台/负责人/按日，并标记数据覆盖范围', async () => {
  const app = buildApp(buildTestData());
  const handler = findRouteHandler(app, 'get', '/api/deals/stats');

  const daily = await invokeJson(handler, { query: { period: 'daily' } });
  assert.equal(daily.statusCode, 200);
  assert.equal(daily.body.stats.totalAmount, 350);
  assert.equal(daily.body.stats.dealCount, 3);
  const ali = daily.body.stats.byPlatform.find((x) => x.platform === '阿里巴巴');
  assert.equal(ali.amount, 150);
  assert.equal(ali.count, 2);
  assert.equal(daily.body.stats.byDay.length, 1);
  // daily 区间起点晚于最早流水，不应标记不完整
  assert.equal(daily.body.coverage.mayBeIncomplete, false);

  const all = await invokeJson(handler, { query: { period: 'all' } });
  assert.equal(all.body.stats.totalAmount, 1350);
  // 全时段无法保证账本完整（迁移自 dealsHistory 且有条数上限）
  assert.equal(all.body.coverage.mayBeIncomplete, true);
});

test('export 输出带 BOM 的 CSV 并正确转义', async () => {
  const data = buildTestData();
  data.dealsLedger.push({
    id: 'd5', amount: 9.5, person: '王"五", Jr', userId: null, platform: '独立站', timestamp: isoDaysAgo(0)
  });
  const app = buildApp(data);
  const handler = findRouteHandler(app, 'get', '/api/deals/export');
  const out = await invokeJson(handler, { query: { period: 'all' } });
  assert.equal(out.statusCode, 200);
  assert.ok(String(out.headers['content-type']).includes('text/csv'));
  assert.ok(String(out.headers['content-disposition']).includes('attachment'));
  assert.ok(out.body.startsWith('﻿'));
  const lines = out.body.replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], 'id,timestamp,person,platform,amount');
  assert.equal(lines.length, 1 + data.dealsLedger.length);
  assert.ok(out.body.includes('"王""五"", Jr"'));
});

test('CSV 导出中和以 = + - @ 开头的公式注入', async () => {
  const data = buildTestData();
  data.dealsLedger.push(
    { id: 'evil1', amount: 1, person: '=HYPERLINK("http://evil")', userId: null, platform: '@SUM(A1)', timestamp: isoDaysAgo(0) },
    { id: 'evil2', amount: 1, person: '+1+1', userId: null, platform: '-2+3', timestamp: isoDaysAgo(0) }
  );
  const app = buildApp(data);
  const handler = findRouteHandler(app, 'get', '/api/deals/export');
  const out = await invokeJson(handler, { query: { period: 'all' } });
  assert.ok(out.body.includes(`'=HYPERLINK`), '= 开头应被前置单引号中和');
  assert.ok(out.body.includes(`'@SUM`), '@ 开头应被中和');
  assert.ok(out.body.includes(`'+1+1`), '+ 开头应被中和');
  assert.ok(out.body.includes(`'-2+3`), '- 开头应被中和');
  assert.ok(!/(^|\r\n)=/.test(out.body), '不应存在裸 = 开头的单元格');
});

test('数据缓存：同尺寸同 mtime 的 rename 改写仍能读到新内容', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { getData } = require('../lib/data-store');
  const p = path.join(os.tmpdir(), `cache-ino-test-${Date.now()}.json`);
  fs.writeFileSync(p, JSON.stringify({ v: 'AAAA' }));
  const first = getData(p);
  assert.equal(first.v, 'AAAA');
  const stat = fs.statSync(p);

  // 模拟外部写：新 inode（tmp+rename），尺寸相同，mtime 强制回拨到与旧文件一致
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ v: 'BBBB' }));
  fs.renameSync(tmp, p);
  fs.utimesSync(p, stat.atime, stat.mtime);

  assert.equal(getData(p).v, 'BBBB', 'inode 变化必须使缓存失效');
  fs.unlinkSync(p);
});

test('stats 与 export 不在公开白名单（需管理员会话）', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'app', 'create-app.js'), 'utf8');
  assert.ok(!source.includes("'/deals/stats'"), 'stats 不应加入公开白名单');
  assert.ok(!source.includes("'/deals/export'"), 'export 不应加入公开白名单');
  assert.ok(!source.includes("'/aliyun-tts-config'"), 'TTS 配置不应回到公开白名单');
});
