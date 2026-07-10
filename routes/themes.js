function registerThemeRoutes(app, deps) {
  const { getData, saveData, requireLogin, themeRegistry } = deps;

  function buildThemeList(data) {
    const activeTheme = themeRegistry.getActiveTheme(data);
    return {
      activeThemeId: activeTheme ? activeTheme.id : '',
      themes: themeRegistry.listThemes().map((theme) => ({
        ...themeRegistry.toPublicTheme(theme),
        active: Boolean(activeTheme && activeTheme.id === theme.id)
      }))
    };
  }

  app.get('/api/themes/active', (req, res) => {
    const data = getData();
    const activeTheme = themeRegistry.getActiveTheme(data);
    if (!activeTheme) {
      return res.status(503).json({ success: false, message: '当前没有可用主题' });
    }

    res.json({
      success: true,
      activeThemeId: activeTheme.id,
      theme: themeRegistry.toPublicTheme(activeTheme)
    });
  });

  app.get('/api/themes', requireLogin, (req, res) => {
    try {
      res.json({ success: true, ...buildThemeList(getData()) });
    } catch (error) {
      console.error('读取主题列表失败:', error);
      res.status(500).json({ success: false, message: '读取主题列表失败' });
    }
  });

  app.post('/api/themes/activate', requireLogin, (req, res) => {
    const themeId = String((req.body && req.body.themeId) || '').trim();
    const theme = themeRegistry.getTheme(themeId);
    if (!theme) {
      return res.status(404).json({ success: false, message: '主题不存在或不完整' });
    }

    const data = getData();
    const activeTheme = themeRegistry.getActiveTheme(data);
    if (activeTheme && activeTheme.id === theme.id) {
      return res.json({
        success: true,
        message: '当前已在使用该主题',
        ...buildThemeList(data)
      });
    }

    data.themeSettings = {
      activeThemeId: theme.id,
      updatedAt: new Date().toISOString()
    };

    if (!saveData(data)) {
      return res.status(500).json({ success: false, message: '启用主题失败' });
    }

    res.json({
      success: true,
      message: `已启用主题“${theme.name}”`,
      ...buildThemeList(data)
    });
  });

  app.get('/theme-preview/:themeId', requireLogin, (req, res) => {
    const theme = themeRegistry.getTheme(req.params.themeId);
    if (!theme) {
      return res.status(404).send('主题不存在或不完整');
    }
    res.set('Cache-Control', 'no-store');
    res.sendFile(theme.entryPath);
  });

  app.get(['/', '/index.html'], (req, res) => {
    const theme = themeRegistry.getActiveTheme(getData());
    if (!theme) {
      return res.status(503).send('当前没有可用主题');
    }
    res.set('Cache-Control', 'no-store');
    res.sendFile(theme.entryPath);
  });
}

module.exports = {
  registerThemeRoutes
};

