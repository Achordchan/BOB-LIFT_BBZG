function registerCelebrationRoutes(app, deps) {
  const { getData, saveData, uuidv4 } = deps;

  // 新增: API: 获取所有庆祝语
  app.get('/api/celebration-messages', (req, res) => {
    const data = getData();

    // 确保庆祝语数组存在
    if (!data.celebrationMessages || !Array.isArray(data.celebrationMessages)) {
      data.celebrationMessages = [];
      saveData(data);
    }

    res.json({
      success: true,
      messages: data.celebrationMessages
    });
  });

  // 新增: API: 添加一条庆祝语
  app.post('/api/celebration-messages/add', (req, res) => {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: '庆祝语内容不能为空'
      });
    }

    const data = getData();

    // 确保庆祝语数组存在
    if (!data.celebrationMessages || !Array.isArray(data.celebrationMessages)) {
      data.celebrationMessages = [];
    }

    // 规范化庆祝语格式，处理占位符中的空格问题
    const normalizedMessage = message
      .replace(/\{\s*person\s*\}/g, "{person}")
      .replace(/\{\s*platform\s*\}/g, "{platform}")
      .replace(/\{\s*amount\s*\}/g, "{amount}")
      .replace(/\s+/g, ' ')
      .trim();

    // 创建新庆祝语
    const newMessage = {
      id: uuidv4(),
      message: normalizedMessage,
      createdAt: new Date().toISOString()
    };

    data.celebrationMessages.push(newMessage);
    saveData(data);

    res.json({
      success: true,
      message: '庆祝语添加成功',
      celebrationMessage: newMessage
    });
  });

  // 新增: API: 删除一条庆祝语
  app.delete('/api/celebration-messages/:id', (req, res) => {
    const messageId = req.params.id;
    const data = getData();

    // 确保庆祝语数组存在
    if (!data.celebrationMessages || !Array.isArray(data.celebrationMessages)) {
      return res.status(404).json({
        success: false,
        message: '未找到庆祝语配置'
      });
    }

    const messageIndex = data.celebrationMessages.findIndex(msg => msg.id === messageId);

    if (messageIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '未找到指定庆祝语'
      });
    }

    // 删除庆祝语
    data.celebrationMessages.splice(messageIndex, 1);
    saveData(data);

    res.json({
      success: true,
      message: '庆祝语删除成功'
    });
  });
}

module.exports = {
  registerCelebrationRoutes
};
