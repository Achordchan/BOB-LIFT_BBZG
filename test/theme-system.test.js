const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const { createThemeRegistry } = require('../lib/theme-registry');
const { createMainStreamHub } = require('../lib/main-stream-hub');
const { registerPageSettingsRoutes } = require('../routes/page-settings');
const { registerThemeRoutes } = require('../routes/themes');
const {
  getSavedThemePageSettings,
  resolveThemePageSettings,
  saveThemePageSettings
} = require('../lib/theme-page-settings');

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
  assert.equal(registry.getTheme('classic-red').contractVersion, 2);
  assert.deepEqual(
    registry.getTheme('classic-red').pageSettings.fields.map((field) => field.key),
    ['mainTitle', 'subTitle', 'inquiryTitle', 'dealTitle', 'progressTitle', 'teamTitle', 'activityTitle']
  );
  assert.deepEqual(
    registry.getTheme('ocean-command').pageSettings.fields.map((field) => field.key),
    ['eyebrowTitle', 'mainTitle', 'subTitle', 'overviewTitle', 'inquiryTitle', 'dealTitle', 'teamTitle', 'activityTitle']
  );
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

test('深海指挥舱为成交庆祝层提供独立样式', () => {
  const panelsCss = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'themes', 'ocean-command', 'panels.css'),
    'utf8'
  );

  assert.match(panelsCss, /body\.theme-ocean-command \.celebration-content\s*\{/);
  assert.match(panelsCss, /DEAL CONFIRMED\s+\/\s+成交喜报/);
  assert.match(panelsCss, /body\.theme-ocean-command \.celebration-person\s*\{/);
  assert.match(panelsCss, /body\.theme-ocean-command\.celebration-mode \.lyrics-container\s*\{/);
});

test('TV 共享业务脚本不使用旧浏览器无法解析的空值合并语法', () => {
  const sharedScript = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'leaderboard.js'),
    'utf8'
  );

  assert.equal(sharedScript.includes('??'), false);
});

test('主题首页文案按主题独立保存并兼容旧全局文案', () => {
  const themesDir = path.join(__dirname, '..', 'public', 'themes');
  const registry = createThemeRegistry({ themesDir });
  const classicTheme = registry.getTheme('classic-red');
  const oceanTheme = registry.getTheme('ocean-command');
  const data = {
    pageSettings: {
      mainTitle: '旧版统一标题',
      subTitle: '旧版统一副标题',
      inquiryTitle: '旧询盘',
      dealTitle: '旧成交',
      progressTitle: '旧进度',
      teamTitle: '旧团队',
      activityTitle: '旧动态'
    },
    themeSettings: {
      activeThemeId: 'classic-red',
      configurations: {}
    }
  };

  assert.equal(resolveThemePageSettings(data, classicTheme).mainTitle, '旧版统一标题');
  assert.equal(resolveThemePageSettings(data, oceanTheme).eyebrowTitle, '实时经营指挥中心');
  assert.equal('progressTitle' in resolveThemePageSettings(data, oceanTheme), false);

  const oceanSettings = resolveThemePageSettings(data, oceanTheme);
  oceanSettings.mainTitle = '深海专属标题';
  saveThemePageSettings(data, oceanTheme, oceanSettings);

  assert.equal(resolveThemePageSettings(data, oceanTheme).mainTitle, '深海专属标题');
  assert.equal(resolveThemePageSettings(data, classicTheme).mainTitle, '旧版统一标题');
  assert.equal(getSavedThemePageSettings(data, 'classic-red'), null);
  assert.equal(getSavedThemePageSettings(data, 'ocean-command').mainTitle, '深海专属标题');
});

test('主题声明的文案字段都存在对应页面挂载点', () => {
  const themesDir = path.join(__dirname, '..', 'public', 'themes');
  const registry = createThemeRegistry({ themesDir });

  registry.listThemes().forEach((theme) => {
    const html = fs.readFileSync(theme.entryPath, 'utf8');
    theme.pageSettings.fields.forEach((field) => {
      assert.equal(
        html.includes(`data-theme-setting="${field.key}"`),
        true,
        `${theme.id} 缺少 ${field.key} 文案挂载点`
      );
    });
  });
});

test('主题文案接口保存后切换主题不会丢失独立配置', async (t) => {
  const themesDir = path.join(__dirname, '..', 'public', 'themes');
  const themeRegistry = createThemeRegistry({ themesDir });
  let data = {
    pageSettings: {
      mainTitle: '旧版统一标题',
      subTitle: '旧版统一副标题',
      inquiryTitle: '旧询盘',
      dealTitle: '旧成交',
      progressTitle: '旧进度',
      teamTitle: '旧团队',
      activityTitle: '旧动态'
    },
    themeSettings: {
      activeThemeId: 'classic-red',
      configurations: {}
    }
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { loggedIn: true };
    next();
  });
  const dependencies = {
    getData: () => data,
    saveData: (nextData) => {
      data = nextData;
      return true;
    },
    requireLogin: (req, res, next) => next(),
    themeRegistry
  };
  registerPageSettingsRoutes(app, dependencies);
  registerThemeRoutes(app, dependencies);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const initialOcean = await fetch(`${baseUrl}/api/page-settings?themeId=ocean-command`).then((response) => response.json());
  const oceanSettings = { ...initialOcean.settings, mainTitle: '深海接口专属标题' };
  const savedOcean = await fetch(`${baseUrl}/api/page-settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ themeId: 'ocean-command', settings: oceanSettings })
  }).then((response) => response.json());
  assert.equal(savedOcean.success, true);

  const activated = await fetch(`${baseUrl}/api/themes/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ themeId: 'ocean-command' })
  }).then((response) => response.json());
  assert.equal(activated.success, true);
  assert.equal(data.themeSettings.configurations['ocean-command'].pageSettings.mainTitle, '深海接口专属标题');

  const activeSettings = await fetch(`${baseUrl}/api/page-settings`).then((response) => response.json());
  const classicSettings = await fetch(`${baseUrl}/api/page-settings?themeId=classic-red`).then((response) => response.json());
  assert.equal(activeSettings.theme.id, 'ocean-command');
  assert.equal(activeSettings.settings.mainTitle, '深海接口专属标题');
  assert.equal(classicSettings.settings.mainTitle, '旧版统一标题');
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
    getActiveTheme: () => ({ id: 'classic-red' }),
    getPageSettings: () => ({ mainTitle: '主题独立标题' })
  });
  const snapshot = hub.buildSnapshot();

  assert.equal(snapshot.dashboard.inquiryCount, 12);
  assert.deepEqual(snapshot.pageSettings, { mainTitle: '主题独立标题' });
  assert.deepEqual(snapshot.theme, {
    activeThemeId: 'classic-red',
    updatedAt: '2026-07-10T00:00:00.000Z'
  });
});
