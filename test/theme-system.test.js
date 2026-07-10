const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createThemeRegistry } = require('../lib/theme-registry');
const { createMainStreamHub } = require('../lib/main-stream-hub');

function writeTheme(root, id, manifestPatch) {
  const directory = path.join(root, id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><title>theme</title>');
  fs.writeFileSync(path.join(directory, 'theme.json'), JSON.stringify({
    id,
    name: id,
    entry: 'index.html',
    ...manifestPatch
  }));
}

test('主题注册表读取默认主题并为无效配置回退', () => {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-themes-'));
  writeTheme(themesDir, 'classic-red', { isDefault: true });
  writeTheme(themesDir, 'spring-sale', { name: '春季主题' });
  const registry = createThemeRegistry({ themesDir });

  assert.equal(registry.listThemes().length, 2);
  assert.equal(registry.getActiveTheme({}).id, 'classic-red');
  assert.equal(registry.getActiveTheme({ themeSettings: { activeThemeId: 'spring-sale' } }).id, 'spring-sale');
  assert.equal(registry.getActiveTheme({ themeSettings: { activeThemeId: 'missing' } }).id, 'classic-red');
});

test('项目内置经典红榜和深海指挥舱两套主题', () => {
  const themesDir = path.join(__dirname, '..', 'public', 'themes');
  const registry = createThemeRegistry({ themesDir });

  assert.deepEqual(
    registry.listThemes().map((theme) => theme.id),
    ['classic-red', 'ocean-command']
  );
  assert.equal(registry.getTheme('ocean-command').name, '深海指挥舱');
});

test('深海指挥舱移除无意义品牌方块并提供经营脉冲区', () => {
  const themeHtml = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'themes', 'ocean-command', 'index.html'),
    'utf8'
  );

  assert.equal(themeHtml.includes('theme-brand-mark'), false);
  assert.equal(themeHtml.includes('stats-panel-heading'), true);
  assert.equal(themeHtml.includes('经营脉冲'), true);
});

test('TV 共享业务脚本不使用旧浏览器无法解析的空值合并语法', () => {
  const sharedScript = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'leaderboard.js'),
    'utf8'
  );

  assert.equal(sharedScript.includes('??'), false);
});

test('主题注册表忽略越界入口和损坏的主题包', () => {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-themes-'));
  writeTheme(themesDir, 'classic-red', { isDefault: true });
  writeTheme(themesDir, 'invalid-entry', { entry: '../classic-red/index.html' });
  fs.mkdirSync(path.join(themesDir, 'broken-json'));
  fs.writeFileSync(path.join(themesDir, 'broken-json', 'theme.json'), '{broken');
  const registry = createThemeRegistry({ themesDir });

  assert.deepEqual(registry.listThemes().map((theme) => theme.id), ['classic-red']);
  assert.equal(registry.getTheme('../classic-red'), null);
});

test('首页 SSE 快照包含主题和首页文案', () => {
  const data = {
    inquiryCount: 12,
    dealAmount: 3456,
    pageSettings: { mainTitle: '测试标题' },
    themeSettings: { activeThemeId: 'classic-red', updatedAt: '2026-07-10T00:00:00.000Z' }
  };
  const hub = createMainStreamHub({
    getData: () => data,
    getActiveTheme: () => ({ id: 'classic-red' })
  });
  const snapshot = hub.buildSnapshot();

  assert.equal(snapshot.dashboard.inquiryCount, 12);
  assert.equal(snapshot.pageSettings.mainTitle, '测试标题');
  assert.equal(snapshot.pageSettings.dealTitle, '成交金额');
  assert.deepEqual(snapshot.theme, {
    activeThemeId: 'classic-red',
    updatedAt: '2026-07-10T00:00:00.000Z'
  });
});
