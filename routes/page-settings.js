const fs = require('fs');

function registerPageSettingsRoutes(app, deps) {
  const { dataPath } = deps;

  // API: 获取首页设置 (无需鉴权，供主显示页面使用)
  app.get('/api/page-settings', (req, res) => {
    try {
      const startTime = performance.now();
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      console.log(`数据读取时间: ${(performance.now() - startTime).toFixed(3)}ms`);

      // 如果没有首页设置，使用默认值
      const defaultSettings = {
        mainTitle: '徐州巴布',
        subTitle: '缜锦木断，水滴石穿',
        inquiryTitle: '询盘总数',
        dealTitle: '成交金额',
        progressTitle: '目标进度',
        teamTitle: '团队成员',
        activityTitle: '最近动态'
      };

      const pageSettings = data.pageSettings || defaultSettings;

      res.json({
        success: true,
        settings: pageSettings
      });
    } catch (error) {
      console.error('获取首页设置失败:', error);
      res.status(500).json({
        success: false,
        message: '获取首页设置失败',
        error: error.message
      });
    }
  });

  // API: 保存首页设置 (需要鉴权)
  app.post('/api/page-settings', (req, res) => {
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

      // 验证必要的字段
      const requiredFields = ['mainTitle', 'subTitle', 'inquiryTitle', 'dealTitle', 'progressTitle', 'teamTitle', 'activityTitle'];
      for (const field of requiredFields) {
        if (!settings[field] || settings[field].trim() === '') {
          return res.status(400).json({
            success: false,
            message: `${field} 不能为空`
          });
        }
      }

      // 保存首页设置
      data.pageSettings = {
        mainTitle: settings.mainTitle.trim(),
        subTitle: settings.subTitle.trim(),
        inquiryTitle: settings.inquiryTitle.trim(),
        dealTitle: settings.dealTitle.trim(),
        progressTitle: settings.progressTitle.trim(),
        teamTitle: settings.teamTitle.trim(),
        activityTitle: settings.activityTitle.trim(),
        updatedAt: new Date().toISOString()
      };

      const saveStartTime = performance.now();
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
      console.log(`数据保存时间: ${(performance.now() - saveStartTime).toFixed(3)}ms`);

      res.json({
        success: true,
        message: '首页设置保存成功',
        settings: data.pageSettings
      });
    } catch (error) {
      console.error('保存首页设置失败:', error);
      res.status(500).json({
        success: false,
        message: '保存首页设置失败',
        error: error.message
      });
    }
  });
}

module.exports = {
  registerPageSettingsRoutes
};
