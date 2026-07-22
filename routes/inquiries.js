function registerInquiryRoutes(app, deps) {
  const { getData, saveData, updateData } = deps;

  // API: 获取询盘数量（公开接口仅返回数量，避免泄露 data.json）
  app.get('/api/inquiries', (req, res) => {
    const data = getData();
    const inquiryCount = typeof data.inquiryCount === 'number' && Number.isFinite(data.inquiryCount)
      ? data.inquiryCount
      : 0;
    res.json({ inquiryCount });
  });

  // API: 增加询盘数量（POST 主路径；GET 仅兼容开关）
  function handleInquiryAdd(req, res) {
    let musicToPlay = null;
    let responseCount = 0;

    const mutator = (data) => {
      data.inquiryCount = Number(data.inquiryCount || 0) + 1;
      musicToPlay = null;
      if (data.inquiryConfig && data.inquiryConfig.addInquiryMusicId && Array.isArray(data.music)) {
        const music = data.music.find(m => m.id === data.inquiryConfig.addInquiryMusicId);
        if (music) {
          musicToPlay = {
            musicId: music.id,
            musicName: music.name,
            musicFile: music.filename
          };
        }
      }

      const inquiryData = {
        type: 'add',
        count: data.inquiryCount,
        timestamp: new Date().toISOString(),
        musicToPlay
      };
      data.latestInquiry = inquiryData;
      if (!data.inquiriesHistory) data.inquiriesHistory = [];
      data.inquiriesHistory.push(inquiryData);
      if (data.inquiriesHistory.length > 30) {
        data.inquiriesHistory = data.inquiriesHistory.slice(-30);
      }
      responseCount = data.inquiryCount;
      return data;
    };

    if (typeof updateData === 'function') {
      const result = updateData(mutator);
      if (!result || !result.ok) {
        return res.status(500).json({ success: false, message: '保存询盘失败' });
      }
    } else {
      const data = getData();
      mutator(data);
      if (!saveData(data)) {
        return res.status(500).json({ success: false, message: '保存询盘失败' });
      }
    }

    const response = {
      success: true,
      message: '询盘已增加',
      count: responseCount
    };
    if (musicToPlay) response.musicToPlay = musicToPlay;
    res.json(response);
  }

  app.post('/api/inquiries/add', handleInquiryAdd);
  app.get('/api/inquiries/add', (req, res) => {
    const authorizedConnector = req.bbzgExternalWriteAuthorized === true;
    if (!authorizedConnector) {
      return res.status(401).json({
        success: false,
        message: 'GET 请求需要有效的外部接口绑定 Token'
      });
    }
    return handleInquiryAdd(req, res);
  });

  // API: 减少询盘数量（POST 主路径；GET 仅兼容开关）
  function handleInquiryReduce(req, res) {
    let musicToPlay = null;
    let responseCount = 0;

    const mutator = (data) => {
      const current = Number(data.inquiryCount || 0);
      data.inquiryCount = current > 0 ? current - 1 : 0;
      musicToPlay = null;
      if (data.inquiryConfig && data.inquiryConfig.reduceInquiryMusicId && Array.isArray(data.music)) {
        const music = data.music.find(m => m.id === data.inquiryConfig.reduceInquiryMusicId);
        if (music) {
          musicToPlay = {
            musicId: music.id,
            musicName: music.name,
            musicFile: music.filename
          };
        }
      }

      const inquiryData = {
        type: 'reduce',
        count: data.inquiryCount,
        timestamp: new Date().toISOString(),
        musicToPlay
      };
      data.latestInquiry = inquiryData;
      if (!data.inquiriesHistory) data.inquiriesHistory = [];
      data.inquiriesHistory.push(inquiryData);
      if (data.inquiriesHistory.length > 30) {
        data.inquiriesHistory = data.inquiriesHistory.slice(-30);
      }
      responseCount = data.inquiryCount;
      return data;
    };

    if (typeof updateData === 'function') {
      const result = updateData(mutator);
      if (!result || !result.ok) {
        return res.status(500).json({ success: false, message: '保存询盘失败' });
      }
    } else {
      const data = getData();
      mutator(data);
      if (!saveData(data)) {
        return res.status(500).json({ success: false, message: '保存询盘失败' });
      }
    }

    const response = {
      success: true,
      message: '询盘已减少',
      count: responseCount
    };
    if (musicToPlay) response.musicToPlay = musicToPlay;
    res.json(response);
  }

  app.post('/api/inquiries/reduce', handleInquiryReduce);
  app.get('/api/inquiries/reduce', (req, res) => {
    const authorizedConnector = req.bbzgExternalWriteAuthorized === true;
    if (!authorizedConnector) {
      return res.status(401).json({
        success: false,
        message: 'GET 请求需要有效的外部接口绑定 Token'
      });
    }
    return handleInquiryReduce(req, res);
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
