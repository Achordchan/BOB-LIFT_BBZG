function registerPlatformTargetsRoutes(app, deps) {
  const { getData, saveData, uuidv4 } = deps;

  // API: 获取平台目标数据
  app.get('/api/platforms/targets', (req, res) => {
    try {
      const data = getData();

      // 确保platformTargets字段存在
      if (!data.platformTargets) {
        data.platformTargets = [];
      }

      // 计算每个平台的完成百分比
      const platforms = data.platformTargets.map(platform => ({
        ...platform,
        percentage: platform.target > 0 ? Math.round((platform.current / platform.target) * 100) : 0
      }));

      res.json({
        success: true,
        platforms: platforms
      });
    } catch (error) {
      console.error('获取平台目标数据失败:', error);
      res.status(500).json({
        success: false,
        message: '获取平台目标数据失败',
        error: error.message
      });
    }
  });

  // API: 更新平台目标设置
  app.post('/api/platforms/targets', (req, res) => {
    try {
      const data = getData();
      const { platforms } = req.body;

      if (!Array.isArray(platforms)) {
        return res.status(400).json({
          success: false,
          message: '平台数据格式错误'
        });
      }

      // 更新平台目标，保持current值不变
      data.platformTargets = platforms.map(platform => ({
        id: platform.id || uuidv4(),
        name: platform.name,
        target: parseFloat(platform.target) || 0,
        current: platform.current || 0,
        enabled: platform.enabled !== false
      }));

      saveData(data);

      res.json({
        success: true,
        message: '平台目标更新成功',
        platforms: data.platformTargets
      });
    } catch (error) {
      console.error('更新平台目标失败:', error);
      res.status(500).json({
        success: false,
        message: '更新平台目标失败',
        error: error.message
      });
    }
  });

  // API: 重置平台数据
  app.post('/api/platforms/reset', (req, res) => {
    try {
      const data = getData();

      if (!data.platformTargets) {
        data.platformTargets = [];
      }

      // 重置所有平台的current值为0
      data.platformTargets.forEach(platform => {
        platform.current = 0;
      });

      saveData(data);

      res.json({
        success: true,
        message: '平台数据重置成功',
        platforms: data.platformTargets
      });
    } catch (error) {
      console.error('重置平台数据失败:', error);
      res.status(500).json({
        success: false,
        message: '重置平台数据失败',
        error: error.message
      });
    }
  });
}

module.exports = {
  registerPlatformTargetsRoutes
};
