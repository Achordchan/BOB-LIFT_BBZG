const fs = require('fs');

function registerPlatformDisplaySettingsRoutes(app, deps) {
  const { dataPath } = deps;

  // API: 获取平台显示设置
  app.get('/api/platform-display-settings', (req, res) => {
    try {
      const startTime = performance.now();
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      console.log(`数据读取时间: ${(performance.now() - startTime).toFixed(3)}ms`);

      // 如果没有平台显示设置，使用默认值
      const platformDisplaySettings = data.platformDisplaySettings || {
        showPlatformTargets: false,
        autoScroll: true,
        scrollInterval: 3000
      };

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
    // 确保用户已登录
    if (!req.session || !req.session.loggedIn) {
      return res.status(401).json({ success: false, message: '未授权访问' });
    }

    try {
      const startTime = performance.now();
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      console.log(`数据读取时间: ${(performance.now() - startTime).toFixed(3)}ms`);
      const { settings } = req.body;

      if (!settings) {
        return res.status(400).json({
          success: false,
          message: '缺少设置数据'
        });
      }

      // 保存平台显示设置
      data.platformDisplaySettings = {
        showPlatformTargets: Boolean(settings.showPlatformTargets),
        autoScroll: Boolean(settings.autoScroll || true),
        scrollInterval: parseInt(settings.scrollInterval) || 3000,
        updatedAt: new Date().toISOString()
      };

      const saveStartTime = performance.now();
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
      console.log(`数据保存时间: ${(performance.now() - saveStartTime).toFixed(3)}ms`);

      res.json({
        success: true,
        message: '平台显示设置保存成功',
        settings: data.platformDisplaySettings
      });
    } catch (error) {
      console.error('保存平台显示设置失败:', error);
      res.status(500).json({
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
