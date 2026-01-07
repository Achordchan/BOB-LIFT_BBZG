function registerMiscRoutes(app, deps) {
  const { getData } = deps;

  // 添加ping API端点
  app.get('/api/ping', (req, res) => {
    res.json({ status: 'ok', message: '服务器正常运行' });
  });

  // API: 获取最近活动记录
  app.get('/api/activities', (req, res) => {
    const data = getData();
    const activities = [];

    // 收集最近的询盘记录
    if (data.inquiriesHistory && Array.isArray(data.inquiriesHistory)) {
      data.inquiriesHistory.forEach(inquiry => {
        activities.push({
          type: inquiry.type === 'add' ? 'inquiry-add' : 'inquiry-reduce',
          message: inquiry.type === 'add' ? '新增询盘1条' : '减少询盘1条',
          timestamp: new Date(inquiry.timestamp).getTime(),
          amount: inquiry.type === 'add' ? 1 : -1
        });
      });
    }

    // 收集最近的成交记录
    if (data.dealsHistory && Array.isArray(data.dealsHistory)) {
      data.dealsHistory.forEach(deal => {
        activities.push({
          type: 'deal',
          message: deal.announcement || `${deal.person || '未知用户'}成交了${deal.amount}元`,
          timestamp: new Date(deal.timestamp).getTime(),
          amount: deal.amount,
          person: deal.person
        });
      });
    }

    // 如果没有历史记录，返回一些示例数据
    if (activities.length === 0) {
      const now = new Date();

      // 如果有最近的询盘记录
      if (data.latestInquiry) {
        activities.push({
          type: data.latestInquiry.type === 'add' ? 'inquiry-add' : 'inquiry-reduce',
          message: data.latestInquiry.type === 'add' ? '新增询盘1条' : '减少询盘1条',
          timestamp: data.latestInquiry.timestamp ? new Date(data.latestInquiry.timestamp).getTime() : now.getTime(),
          amount: data.latestInquiry.type === 'add' ? 1 : -1
        });
      }

      // 如果有最近的成交记录
      if (data.latestDeal) {
        activities.push({
          type: 'deal',
          message: data.latestDeal.announcement || `成交了${data.latestDeal.amount}元`,
          timestamp: data.latestDeal.timestamp ? new Date(data.latestDeal.timestamp).getTime() : now.getTime() - 600000,
          amount: data.latestDeal.amount,
          person: data.latestDeal.person
        });
      }
    }

    // 按时间排序
    activities.sort((a, b) => b.timestamp - a.timestamp);

    // 只返回最近的10条记录
    const recentActivities = activities.slice(0, 10);

    res.json({
      success: true,
      activities: recentActivities
    });
  });
}

module.exports = {
  registerMiscRoutes
};
