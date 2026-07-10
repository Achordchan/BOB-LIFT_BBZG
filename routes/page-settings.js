const {
  getSavedThemePageSettings,
  resolveThemePageSettings,
  saveThemePageSettings
} = require('../lib/theme-page-settings');

function registerPageSettingsRoutes(app, deps) {
  const { getData, saveData, themeRegistry } = deps;

  function findTheme(data, requestedThemeId) {
    if (requestedThemeId) {
      return themeRegistry.getTheme(String(requestedThemeId).trim());
    }
    return themeRegistry.getActiveTheme(data);
  }

  function buildResponse(data, theme) {
    const activeTheme = themeRegistry.getActiveTheme(data);
    return {
      success: true,
      theme: {
        id: theme.id,
        name: theme.name,
        active: Boolean(activeTheme && activeTheme.id === theme.id)
      },
      definition: theme.pageSettings,
      settings: resolveThemePageSettings(data, theme),
      saved: Boolean(getSavedThemePageSettings(data, theme.id))
    };
  }

  // 不传 themeId 时读取当前启用主题，供首页运行时使用。
  app.get('/api/page-settings', (req, res) => {
    try {
      const data = getData();
      const theme = findTheme(data, req.query.themeId);
      if (!theme) {
        return res.status(404).json({ success: false, message: '主题不存在或不可用' });
      }
      res.json(buildResponse(data, theme));
    } catch (error) {
      console.error('获取主题首页设置失败:', error);
      res.status(500).json({
        success: false,
        message: '获取主题首页设置失败'
      });
    }
  });

  app.post('/api/page-settings', (req, res) => {
    if (!req.session || !req.session.loggedIn) {
      return res.status(401).json({ success: false, message: '未授权访问' });
    }

    try {
      const data = getData();
      const themeId = String((req.body && req.body.themeId) || '').trim();
      const theme = findTheme(data, themeId);
      if (!theme) {
        return res.status(404).json({ success: false, message: '主题不存在或不可用' });
      }

      const result = saveThemePageSettings(data, theme, req.body && req.body.settings);
      if (!saveData(data)) {
        return res.status(500).json({ success: false, message: '保存主题首页设置失败' });
      }

      res.json({
        ...buildResponse(data, theme),
        message: `“${theme.name}”首页文案已保存`,
        updatedAt: result.updatedAt
      });
    } catch (error) {
      console.error('保存主题首页设置失败:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : '保存主题首页设置失败'
      });
    }
  });
}

module.exports = {
  registerPageSettingsRoutes
};
