function registerDealRoutes(app, deps) {
  const {
    getData,
    saveData,
    uuidv4,
    getUserMusicConfig,
    parseDealAmountInput,
    formatDealAmountForTts
  } = deps;

  // API: 设置成交金额
  app.post('/api/deals/set', (req, res) => {
    const { amount } = req.body;

    if (amount === undefined || isNaN(parseFloat(amount))) {
      return res.status(400).json({
        success: false,
        message: '无效的成交金额'
      });
    }

    const data = getData();
    const oldAmount = data.dealAmount || 0;
    const newAmount = parseFloat(amount);

    data.dealAmount = newAmount >= 0 ? newAmount : 0;

    // 标记这是从管理页面设置的成交金额，不触发动效
    data.latestDeal = {
      type: 'set',
      amount: data.dealAmount,
      timestamp: new Date().toISOString(),
      fromAdmin: true
    };

    saveData(data);

    res.json({
      success: true,
      message: '成交金额已设置',
      amount: data.dealAmount,
      oldAmount
    });
  });

  // API: 获取成交金额
  app.get('/api/deals', (req, res) => {
    const data = getData();
    res.json({ dealAmount: data.dealAmount || 0 });
  });

  // API: 添加成交记录
  app.get('/api/deals/add', (req, res) => {
    const data = getData();

    // 获取请求参数
    const rawAmountInput = req.query.zongjine;
    const amount = parseDealAmountInput(rawAmountInput);
    const person = req.query.fuzeren || '匿名';
    const platform = req.query.laiyuanpingtai || '未知平台';

    // 用于生成庆祝文案的其他参数
    const userName = req.query.userName || person; // 可选，如果提供则使用这个名称

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: '无效的成交金额'
      });
    }

    // 更新成交总额
    data.dealAmount = (data.dealAmount || 0) + amount;

    // 检查用户是否存在自定义配置的成交音乐
    let musicToPlay = null;
    let userConfig = null;

    // 根据请求中的人名查找对应的用户配置
    const user = data.users.find(u => u.name === person || u.name === userName);

    if (user && user.musicId) {
      userConfig = getUserMusicConfig(user.id);

      if (userConfig && userConfig.music) {
        musicToPlay = {
          musicId: userConfig.music.id,
          musicName: userConfig.music.name,
          musicFile: userConfig.music.filename,
          userName: user.name.trim(),
          userPosition: user.position ? user.position.trim() : '运营专员'
        };
      }
    }

    // 如果用户没有配置音乐，但系统有配置默认战歌，则使用默认战歌
    if (!musicToPlay && data.defaultBattleSong) {
      const defaultMusic = data.music.find(m => m.id === data.defaultBattleSong.musicId);
      if (defaultMusic) {
        musicToPlay = {
          musicId: defaultMusic.id,
          musicName: defaultMusic.name,
          musicFile: defaultMusic.filename,
          userName: person.trim(),
          userPosition: user ? (user.position ? user.position.trim() : '运营专员') : '运营专员'
        };
      }
    }

    // 生成庆祝文案
    let announcement = '';
    if (data.celebrationMessages && data.celebrationMessages.length > 0) {
      // 随机选择一条庆祝语
      const randomIndex = Math.floor(Math.random() * data.celebrationMessages.length);

      // 预处理模板，不仅去除多余空格，还处理占位符中的空格问题
      let template = data.celebrationMessages[randomIndex].message;

      // 修复占位符内的空格问题，例如"{ person }"变成"{person}"
      template = template
        .replace(/\{\s*person\s*\}/g, "{person}")
        .replace(/\{\s*platform\s*\}/g, "{platform}")
        .replace(/\{\s*amount\s*\}/g, "{amount}")
        .replace(/\s+/g, ' ')
        .trim();

      // 准备干净的替换值
      const cleanUserName = userName.trim();
      const cleanPlatform = platform.trim();
      const formattedAmount = formatDealAmountForTts(rawAmountInput, amount);

      // 执行替换
      announcement = template
        .replace(/{person}/g, cleanUserName)
        .replace(/{platform}/g, cleanPlatform)
        .replace(/{amount}/g, formattedAmount);

      // 最后确保没有多余空格
      announcement = announcement.replace(/\s+/g, ' ').trim();
    } else {
      // 默认文案
      announcement = `恭喜${userName.trim()}在${platform.trim()}成交了${formatDealAmountForTts(rawAmountInput, amount)}元！`.replace(/\s+/g, ' ').trim();
    }

    // 创建成交记录对象
    const dealData = {
      amount,
      person: userName.trim(),
      platform: platform.trim(),
      timestamp: new Date().toISOString(),
      announcement,
      musicToPlay
    };

    // 保存最新成交记录
    data.latestDeal = dealData;

    // 更新平台累计金额
    if (!data.platformTargets) {
      data.platformTargets = [];
    }

    // 查找对应的平台并累计金额
    const platformItem = data.platformTargets.find(p => p.name === platform.trim());
    if (platformItem) {
      platformItem.current = (platformItem.current || 0) + amount;
      console.log(`平台 ${platform.trim()} 累计金额更新: +${amount}, 总计: ${platformItem.current}`);
    } else {
      // 如果平台不存在，创建新的平台记录
      data.platformTargets.push({
        id: uuidv4(),
        name: platform.trim(),
        target: 0,
        current: amount,
        enabled: true
      });
      console.log(`新增平台 ${platform.trim()}, 初始金额: ${amount}`);
    }

    // 添加到成交历史记录
    if (!data.dealsHistory) {
      data.dealsHistory = [];
    }
    data.dealsHistory.push(dealData);

    // 只保留最近的30条记录
    if (data.dealsHistory.length > 30) {
      data.dealsHistory = data.dealsHistory.slice(-30);
    }

    saveData(data);

    // 格式化返回结果，确保所有可能影响TTS的字段中没有多余空格
    const response = {
      success: true,
      message: '成交记录已添加',
      amount: data.dealAmount
    };

    // 处理announcement中的多余空格，确保TTS播放流畅
    if (announcement) {
      response.announcement = announcement.replace(/\s+/g, ' ').trim();
    }

    // 如果有音乐信息，同样处理可能含有空格的文本字段
    if (musicToPlay) {
      response.musicToPlay = {
        ...musicToPlay,
        userName: musicToPlay.userName ? musicToPlay.userName.replace(/\s+/g, ' ').trim() : musicToPlay.userName,
        userPosition: musicToPlay.userPosition ? musicToPlay.userPosition.replace(/\s+/g, ' ').trim() : musicToPlay.userPosition
      };
    }

    res.json(response);
  });

  // API: 获取最近一次成交详情
  app.get('/api/deals/latest', (req, res) => {
    const data = getData();

    if (!data.latestDeal) {
      res.json({ success: false, message: '暂无成交记录' });
      return;
    }

    // 创建返回对象，确保处理announcement中的多余空格
    const response = {
      success: true
    };

    // 处理announcement
    if (data.latestDeal.announcement) {
      response.announcement = data.latestDeal.announcement.replace(/\s+/g, ' ').trim();
    } else {
      response.announcement = '';
    }

    // 处理musicToPlay中可能含有空格的文本字段
    if (data.latestDeal.musicToPlay) {
      response.musicToPlay = {
        ...data.latestDeal.musicToPlay,
        userName: data.latestDeal.musicToPlay.userName ?
          data.latestDeal.musicToPlay.userName.replace(/\s+/g, ' ').trim() :
          data.latestDeal.musicToPlay.userName,
        userPosition: data.latestDeal.musicToPlay.userPosition ?
          data.latestDeal.musicToPlay.userPosition.replace(/\s+/g, ' ').trim() :
          data.latestDeal.musicToPlay.userPosition
      };
    }

    // 添加person和platform信息用于排队显示
    if (data.latestDeal.person) {
      response.person = data.latestDeal.person.replace(/\s+/g, ' ').trim();
    }
    if (data.latestDeal.platform) {
      response.platform = data.latestDeal.platform.replace(/\s+/g, ' ').trim();
    }

    res.json(response);
  });

  // API: 获取成交排行榜
  app.get('/api/deals/leaderboard', (req, res) => {
    try {
      const data = getData();

      // 确保用户数组存在
      if (!data.users) {
        data.users = [];
      }

      // 确保成交历史存在
      if (!data.dealsHistory) {
        data.dealsHistory = [];
      }

      // 计算每个用户的总成交额
      const userTotals = {};

      // 先从用户数据中提取信息
      data.users.forEach(user => {
        userTotals[user.id] = {
          id: user.id,
          name: user.name,
          position: user.position,
          amount: 0
        };
      });

      // 统计成交历史中的金额
      data.dealsHistory.forEach(deal => {
        // 查找匹配的用户
        const matchingUser = data.users.find(user => user.name === deal.person);

        if (matchingUser) {
          // 如果找到匹配的用户，累加金额
          userTotals[matchingUser.id].amount += deal.amount;
        } else {
          // 如果未找到匹配的用户（可能是历史记录中的用户已被删除），创建一个临时条目
          const tempId = `temp_${deal.person.replace(/\s+/g, '_')}`;

          if (!userTotals[tempId]) {
            userTotals[tempId] = {
              id: tempId,
              name: deal.person,
              position: '',
              amount: 0
            };
          }

          userTotals[tempId].amount += deal.amount;
        }
      });

      // 转换为数组并按金额排序
      const leaderboard = Object.values(userTotals)
        .filter(item => item.amount > 0)
        .sort((a, b) => b.amount - a.amount);

      res.json({
        success: true,
        leaderboard
      });
    } catch (error) {
      console.error('获取排行榜失败:', error);
      res.status(500).json({
        success: false,
        message: '获取排行榜数据失败',
        error: error.message
      });
    }
  });

  // API: 最近活动记录
  app.get('/api/deals/recent', (req, res) => {
    try {
      const data = getData();

      // 合并询盘和成交记录
      const recentActivity = [];

      // 添加询盘记录，确保每条记录只添加一次
      if (data.inquiriesHistory && Array.isArray(data.inquiriesHistory)) {
        // 使用Set记录已处理的时间戳，防止重复
        const processedTimestamps = new Set();

        data.inquiriesHistory.forEach(inquiry => {
          // 如果该时间戳已处理过，跳过此记录
          if (processedTimestamps.has(inquiry.timestamp)) {
            return;
          }

          // 记录此时间戳
          processedTimestamps.add(inquiry.timestamp);

          recentActivity.push({
            type: 'inquiry',
            action: inquiry.type, // 添加action字段区分add和reduce
            timestamp: inquiry.timestamp,
            count: inquiry.count
          });
        });
      }

      // 添加成交记录
      if (data.dealsHistory && Array.isArray(data.dealsHistory)) {
        data.dealsHistory.forEach(deal => {
          recentActivity.push({
            type: 'deal',
            person: deal.person,
            platform: deal.platform,
            amount: deal.amount,
            timestamp: deal.timestamp
          });
        });
      }

      // 按时间排序，最新的在前
      recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // 只返回最近的20条记录
      const recentItems = recentActivity.slice(0, 20);

      res.json({
        success: true,
        deals: recentItems
      });
    } catch (error) {
      console.error('获取最近活动失败:', error);
      res.status(500).json({
        success: false,
        message: '获取最近活动数据失败',
        error: error.message
      });
    }
  });
}

module.exports = {
  registerDealRoutes
};
