function registerTargetsRoutes(app, deps) {
  const { getData, saveData } = deps;

  // 获取日期的周数（用于周重置）
  function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  // API: 获取目标设置
  app.get('/api/targets', (req, res) => {
    const data = getData();

    // 确保目标数据存在
    if (!data.targets) {
      data.targets = {
        inquiryTarget: 0,
        dealTarget: 0,
        resetPeriod: 'weekly',
        lastResetTime: new Date().toISOString()
      };
      saveData(data);
    }

    // 检查是否需要重置目标进度
    const now = new Date();
    const lastResetTime = new Date(data.targets.lastResetTime);
    let needsReset = false;

    switch (data.targets.resetPeriod) {
      case 'daily':
        // 如果日期不同，需要重置
        needsReset = now.getDate() !== lastResetTime.getDate() ||
                    now.getMonth() !== lastResetTime.getMonth() ||
                    now.getFullYear() !== lastResetTime.getFullYear();
        break;

      case 'weekly':
        // 计算两个日期的星期
        const nowWeek = getWeekNumber(now);
        const lastWeek = getWeekNumber(lastResetTime);
        needsReset = nowWeek !== lastWeek;
        break;

      case 'monthly':
        // 如果月份不同，需要重置
        needsReset = now.getMonth() !== lastResetTime.getMonth() ||
                    now.getFullYear() !== lastResetTime.getFullYear();
        break;

      case 'yearly':
        // 如果年份不同，需要重置
        needsReset = now.getFullYear() !== lastResetTime.getFullYear();
        break;

      case 'never':
        // 永不重置
        needsReset = false;
        break;
    }

    // 如果需要重置，更新最后重置时间
    if (needsReset) {
      data.targets.lastResetTime = now.toISOString();
      saveData(data);

      // 在真实场景中，这里可能还需要重置一些累计数据
      console.log('目标进度已重置，时间:', now);
    }

    // 返回成功状态和目标数据
    res.json({
      success: true,
      inquiryTarget: data.targets.inquiryTarget,
      dealTarget: data.targets.dealTarget,
      resetPeriod: data.targets.resetPeriod,
      lastResetTime: data.targets.lastResetTime
    });
  });

  // API: 设置目标
  app.post('/api/targets', (req, res) => {
    // 确保用户已登录
    if (!req.session || !req.session.loggedIn) {
      return res.status(401).json({ success: false, message: '未授权访问' });
    }

    const data = getData();

    // 确保目标数据结构存在
    if (!data.targets) {
      data.targets = {
        inquiryTarget: 0,
        dealTarget: 0,
        resetPeriod: 'weekly',
        lastResetTime: new Date().toISOString()
      };
    }

    // 更新目标数据
    if (req.body.inquiryTarget !== undefined) {
      data.targets.inquiryTarget = parseInt(req.body.inquiryTarget) || 0;
    }

    if (req.body.dealTarget !== undefined) {
      data.targets.dealTarget = parseInt(req.body.dealTarget) || 0;
    }

    if (req.body.resetPeriod !== undefined) {
      const validPeriods = ['daily', 'weekly', 'monthly', 'yearly', 'never'];
      if (validPeriods.includes(req.body.resetPeriod)) {
        data.targets.resetPeriod = req.body.resetPeriod;
      }
    }

    // 保存更新后的数据
    if (saveData(data)) {
      res.json({
        success: true,
        message: '目标设置已更新',
        ...data.targets
      });
    } else {
      res.status(500).json({
        success: false,
        message: '保存目标设置失败'
      });
    }
  });
}

module.exports = {
  registerTargetsRoutes
};
