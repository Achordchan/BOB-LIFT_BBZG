function registerInquiryRoutes(app, deps) {
  const { getData, saveData } = deps;

  // API: 获取询盘数量
  app.get('/api/inquiries', (req, res) => {
    const data = getData();
    res.json(data);
  });

  // API: 增加询盘数量
  app.get('/api/inquiries/add', (req, res) => {
    const data = getData();
    data.inquiryCount += 1;

    // 查找是否有配置的增加询盘音效
    let musicToPlay = null;
    if (data.inquiryConfig && data.inquiryConfig.addInquiryMusicId) {
      const music = data.music.find(m => m.id === data.inquiryConfig.addInquiryMusicId);
      if (music) {
        musicToPlay = {
          musicId: music.id,
          musicName: music.name,
          musicFile: music.filename
        };
      }
    }

    // 记录本次询盘信息
    const inquiryData = {
      type: 'add',
      count: data.inquiryCount,
      timestamp: new Date().toISOString(),
      musicToPlay
    };

    // 保存最近一次询盘信息
    data.latestInquiry = inquiryData;

    // 添加到询盘历史记录
    if (!data.inquiriesHistory) {
      data.inquiriesHistory = [];
    }
    data.inquiriesHistory.push(inquiryData);

    // 只保留最近的30条记录
    if (data.inquiriesHistory.length > 30) {
      data.inquiriesHistory = data.inquiriesHistory.slice(-30);
    }

    saveData(data);

    const response = {
      success: true,
      message: '询盘已增加',
      count: data.inquiryCount
    };

    // 如果有配置的音效，添加到响应中
    if (musicToPlay) {
      response.musicToPlay = musicToPlay;
    }

    res.json(response);
  });

  // API: 减少询盘数量
  app.get('/api/inquiries/reduce', (req, res) => {
    const data = getData();
    // 防止询盘数量小于0
    if (data.inquiryCount > 0) {
      data.inquiryCount -= 1;
    }

    // 查找是否有配置的减少询盘音效
    let musicToPlay = null;
    if (data.inquiryConfig && data.inquiryConfig.reduceInquiryMusicId) {
      const music = data.music.find(m => m.id === data.inquiryConfig.reduceInquiryMusicId);
      if (music) {
        musicToPlay = {
          musicId: music.id,
          musicName: music.name,
          musicFile: music.filename
        };
      }
    }

    // 记录本次询盘信息
    const inquiryData = {
      type: 'reduce',
      count: data.inquiryCount,
      timestamp: new Date().toISOString(),
      musicToPlay
    };

    // 保存最近一次询盘信息
    data.latestInquiry = inquiryData;

    // 添加到询盘历史记录
    if (!data.inquiriesHistory) {
      data.inquiriesHistory = [];
    }
    data.inquiriesHistory.push(inquiryData);

    // 只保留最近的30条记录
    if (data.inquiriesHistory.length > 30) {
      data.inquiriesHistory = data.inquiriesHistory.slice(-30);
    }

    saveData(data);

    const response = {
      success: true,
      message: '询盘已减少',
      count: data.inquiryCount
    };

    // 如果有配置的音效，添加到响应中
    if (musicToPlay) {
      response.musicToPlay = musicToPlay;
    }

    res.json(response);
  });

  // API: 获取最近一次询盘详情
  app.get('/api/inquiries/latest', (req, res) => {
    const data = getData();

    if (!data.latestInquiry) {
      return res.status(404).json({
        success: false,
        message: '暂无询盘记录'
      });
    }

    res.json({
      success: true,
      latestInquiry: data.latestInquiry
    });
  });

  // API: 设置询盘数量
  app.post('/api/inquiries/set', (req, res) => {
    const { count } = req.body;

    if (count === undefined || isNaN(parseInt(count))) {
      return res.status(400).json({
        success: false,
        message: '无效的询盘数量'
      });
    }

    const data = getData();
    const oldCount = data.inquiryCount;
    const newCount = parseInt(count);

    data.inquiryCount = newCount >= 0 ? newCount : 0;

    // 标记这是从管理页面设置的询盘数量，不触发动效
    data.latestInquiry = {
      type: 'set',
      count: data.inquiryCount,
      timestamp: new Date().toISOString(),
      fromAdmin: true
    };

    saveData(data);

    res.json({
      success: true,
      message: '询盘数量已设置',
      count: data.inquiryCount,
      oldCount
    });
  });

  // API: 配置询盘音效
  app.post('/api/inquiries/config', (req, res) => {
    const { addInquiryMusicId, reduceInquiryMusicId } = req.body;

    const data = getData();

    // 确保inquiryConfig对象存在
    if (!data.inquiryConfig) {
      data.inquiryConfig = {};
    }

    // 验证音乐ID是否存在
    if (addInquiryMusicId) {
      const addMusic = data.music.find(m => m.id === addInquiryMusicId);
      if (!addMusic) {
        return res.status(404).json({
          success: false,
          message: '未找到增加询盘的音乐'
        });
      }
      data.inquiryConfig.addInquiryMusicId = addInquiryMusicId;
    } else {
      data.inquiryConfig.addInquiryMusicId = null;
    }

    if (reduceInquiryMusicId) {
      const reduceMusic = data.music.find(m => m.id === reduceInquiryMusicId);
      if (!reduceMusic) {
        return res.status(404).json({
          success: false,
          message: '未找到减少询盘的音乐'
        });
      }
      data.inquiryConfig.reduceInquiryMusicId = reduceInquiryMusicId;
    } else {
      data.inquiryConfig.reduceInquiryMusicId = null;
    }

    saveData(data);

    res.json({
      success: true,
      message: '询盘音效配置已更新',
      inquiryConfig: data.inquiryConfig
    });
  });

  // API: 获取询盘音效配置
  app.get('/api/inquiries/config', (req, res) => {
    const data = getData();

    // 确保inquiryConfig对象存在
    if (!data.inquiryConfig) {
      data.inquiryConfig = {
        addInquiryMusicId: null,
        reduceInquiryMusicId: null
      };
      saveData(data);
    }

    // 在响应中添加音乐详情
    const inquiryConfig = { ...data.inquiryConfig };

    if (inquiryConfig.addInquiryMusicId) {
      const addMusic = data.music.find(m => m.id === inquiryConfig.addInquiryMusicId);
      if (addMusic) {
        inquiryConfig.addInquiryMusic = {
          id: addMusic.id,
          name: addMusic.name,
          filename: addMusic.filename
        };
      }
    }

    if (inquiryConfig.reduceInquiryMusicId) {
      const reduceMusic = data.music.find(m => m.id === inquiryConfig.reduceInquiryMusicId);
      if (reduceMusic) {
        inquiryConfig.reduceInquiryMusic = {
          id: reduceMusic.id,
          name: reduceMusic.name,
          filename: reduceMusic.filename
        };
      }
    }

    res.json({
      success: true,
      inquiryConfig
    });
  });
}

module.exports = {
  registerInquiryRoutes
};
