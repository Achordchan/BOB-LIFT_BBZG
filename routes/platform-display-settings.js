const fs = require('fs');

function buildDefaultSettings() {
  return {
    showPlatformTargets: false,
    autoScroll: true,
    scrollInterval: 3000
  };
}

function normalizeSettings(rawSettings) {
  const defaults = buildDefaultSettings();
  const src = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};

  return {
    showPlatformTargets: Boolean(src.showPlatformTargets),
    autoScroll: src.autoScroll !== false,
    scrollInterval: Number.isFinite(Number(src.scrollInterval)) ? Number(src.scrollInterval) : defaults.scrollInterval,
    ...(src.updatedAt ? { updatedAt: src.updatedAt } : {})
  };
}

function registerPlatformDisplaySettingsRoutes(app, deps) {
  const { dataPath, getData: injectedGetData, saveData: injectedSaveData } = deps || {};

  const getData = typeof injectedGetData === 'function'
    ? injectedGetData
    : () => JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  const saveData = typeof injectedSaveData === 'function'
    ? injectedSaveData
    : (data) => {
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
        return true;
      };

  // API: 获取平台显示设置
  app.get('/api/platform-display-settings', (req, res) => {
    try {
      const data = getData();
      const platformDisplaySettings = normalizeSettings(data.platformDisplaySettings);

      res.json({
        success: true,
        settings: platformDisplaySettings
      });
    } catch (error) {
      console.error('获取平台显示设置失败:', error);
      res.status(500).json({
        success: false,
        message: '获取平台显示设置失败',
        error: error.message
      });
    }
  });

  // API: 保存平台显示设置 (需要鉴权)
  app.post('/api/platform-display-settings', (req, res) => {
    if (!req.session || !req.session.loggedIn) {
      return res.status(401).json({ success: false, message: '未授权访问' });
    }

    try {
      const data = getData();
      const { settings } = req.body || {};

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({
          success: false,
          message: '缺少设置数据'
        });
      }

      data.platformDisplaySettings = {
        ...normalizeSettings(settings),
        updatedAt: new Date().toISOString()
      };

      const saved = saveData(data);
      if (!saved) {
        return res.status(500).json({
          success: false,
          message: '保存平台显示设置失败'
        });
      }

      return res.json({
        success: true,
        message: '平台显示设置保存成功',
        settings: data.platformDisplaySettings
      });
    } catch (error) {
      console.error('保存平台显示设置失败:', error);
      return res.status(500).json({
        success: false,
        message: '保存平台显示设置失败',
        error: error.message
      });
    }
  });
}

module.exports = {
  registerPlatformDisplaySettingsRoutes
};
