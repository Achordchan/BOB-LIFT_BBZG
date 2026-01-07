const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const RPCClient = require('@alicloud/pop-core').RPCClient;
const cron = require('node-cron');

function registerTtsRoutes(app, deps) {
  const {
    requireLogin,
    getData,
    saveData,
    baseDir,
    parseDealAmountInput,
    formatDealAmountForTts
  } = deps;

  function normalizeTtsText(text) {
    if (text == null) return '';
    let out = String(text);

    // 1) 处理显式“元”/货币符号的金额：例如“￥213,412.00元”、“213,412.00 元”
    out = out.replace(/([￥¥]\s*)?(\d[\d,，]*)(?:\.(\d{1,2}))?\s*元/g, (m) => {
      const n = parseDealAmountInput(m);
      return `${formatDealAmountForTts(m, n)}元`;
    });

    // 2) 处理包含逗号的金额但没有“元”的场景（仅在成交/金额语境下，避免误伤其它数字）
    out = out.replace(/(成交|金额|金額|业绩|业績|销售额|销售額)\s*[:：]?\s*([￥¥]\s*)?(\d[\d,，]*)(?:\.(\d{1,2}))?/g, (m, kw) => {
      const n = parseDealAmountInput(m);
      return `${kw}${formatDealAmountForTts(m, n)}`;
    });

    // 3) 兜底：如果文本中存在“单个逗号”的纯数字（如 213,412.00），仍尝试格式化
    out = out.replace(/\b\d+[，,]\d+(?:\.\d{1,2})?\b/g, (m) => {
      const n = parseDealAmountInput(m);
      return formatDealAmountForTts(m, n);
    });

    return out;
  }

  // API: 文本转语音并保存为MP3
  app.post('/api/text-to-speech', async (req, res) => {
    let { text, deviceType, screenSize } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: '请提供要转换的文本'
      });
    }

    // 额外处理输入文本：先做金额清洗，再去除多余空格，确保TTS播放流畅
    text = normalizeTtsText(text).replace(/\s+/g, ' ').trim();

    // 记录设备类型信息用于排查问题
    const deviceInfo = {
      type: deviceType || 'unknown',
      screen: screenSize || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    console.log(`文本转语音请求: ${text.substring(0, 20)}... [设备类型: ${deviceInfo.type}, 屏幕: ${deviceInfo.screen}]`);
    console.log('文本转语音最终文本(截断):', text.length > 120 ? (text.slice(0, 120) + '...') : text);

    try {
      // 生成文件名: 使用文本的MD5哈希值作为文件名以避免重复生成
      const hash = crypto.createHash('md5').update(text).digest('hex');
      const filename = `${hash}.mp3`;
      const filePath = path.join(baseDir, 'public', 'music', 'tts', filename);
      const relativePath = `/music/tts/${filename}`;

      // 确保tts目录存在
      const ttsDir = path.join(baseDir, 'public', 'music', 'tts');
      if (!fs.existsSync(ttsDir)) {
        try {
          fs.mkdirSync(ttsDir, { recursive: true });
          console.log('创建TTS目录:', ttsDir);
        } catch (mkdirError) {
          console.error('创建TTS目录失败:', mkdirError);
          return res.status(500).json({
            success: false,
            message: '无法创建TTS目录',
            error: mkdirError.message
          });
        }
      }

      // 检查文件是否已经存在
      if (fs.existsSync(filePath)) {
        console.log('TTS文件已存在，直接返回:', relativePath);
        return res.json({
          success: true,
          message: '语音文件已存在',
          audioPath: relativePath
        });
      }

      // 从数据文件中获取阿里云TTS配置
      const data = getData();
      const ttsConfig = data.aliyunTtsConfig || {};

      if (!ttsConfig.accessKeyId || !ttsConfig.accessKeySecret || !ttsConfig.appKey) {
        return res.status(400).json({
          success: false,
          message: '未配置阿里云TTS服务参数，请先配置AccessKey ID、AppKey和AccessKey Secret'
        });
      }

      // 获取Token
      const client = new RPCClient({
        accessKeyId: ttsConfig.accessKeyId,
        accessKeySecret: ttsConfig.accessKeySecret,
        endpoint: 'https://nls-meta.cn-shanghai.aliyuncs.com',
        apiVersion: '2019-02-28'
      });

      console.log('正在获取阿里云Token...');
      const tokenResult = await client.request('CreateToken');
      if (!tokenResult || !tokenResult.Token || !tokenResult.Token.Id) {
        console.error('获取阿里云Token失败:', tokenResult);
        return res.status(500).json({
          success: false,
          message: '获取阿里云Token失败',
          error: '无效的Token响应'
        });
      }

      // 使用获取到的Token
      const token = tokenResult.Token.Id;
      console.log('成功获取阿里云Token:', token.slice(0, 10) + '...');

      // 引入阿里云语音合成SDK
      const Nls = require('alibabacloud-nls');

      // 创建文件流
      const fileStream = fs.createWriteStream(filePath);
      fileStream.on('error', (streamError) => {
        console.error('创建TTS文件流失败:', streamError);
        return res.status(500).json({
          success: false,
          message: '创建语音文件失败',
          error: streamError.message
        });
      });

      // 创建语音合成实例
      const tts = new Nls.SpeechSynthesizer({
        url: ttsConfig.url || 'wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1',
        appkey: ttsConfig.appKey,
        token: token
      });

      // 创建语音合成参数
      const param = tts.defaultStartParams();
      param.text = text;
      param.voice = ttsConfig.voice || 'xiaoyun';
      param.format = ttsConfig.format || 'mp3';
      param.sample_rate = parseInt(ttsConfig.sampleRate) || 16000;
      param.volume = parseInt(ttsConfig.volume) || 50;
      param.speech_rate = parseInt(ttsConfig.speechRate) || 0;
      param.pitch_rate = parseInt(ttsConfig.pitchRate) || 0;

      console.log('语音合成参数:', JSON.stringify(param));

      let isSynthesisCompleted = false;
      let synthesisError = null;

      // 设置回调函数
      tts.on('meta', (msg) => {
        console.log('阿里云TTS元信息:', msg);
      });

      tts.on('data', (data) => {
        fileStream.write(data, 'binary');
      });

      tts.on('completed', (msg) => {
        console.log('阿里云TTS合成完成:', msg);
        fileStream.end();
        isSynthesisCompleted = true;

        // 验证文件是否真的存在且大小正常
        try {
          const stats = fs.statSync(filePath);
          if (stats.size === 0) {
            console.error('TTS文件生成成功但是文件大小为0');
            fs.unlinkSync(filePath); // 删除无效文件
            return res.status(500).json({
              success: false,
              message: '生成的语音文件大小为0，请重试',
              error: 'Empty file'
            });
          }

          // 返回结果
          res.json({
            success: true,
            message: '语音文件生成成功',
            audioPath: relativePath
          });
        } catch (statError) {
          console.error('读取或验证TTS文件失败:', statError);
          return res.status(500).json({
            success: false,
            message: '语音文件验证失败',
            error: statError.message
          });
        }
      });

      tts.on('closed', () => {
        console.log('阿里云TTS连接关闭');
        if (!isSynthesisCompleted) {
          fileStream.end();

          // 如果没有合成完成但连接关闭了，检查是否有错误
          if (synthesisError) {
            if (!res.headersSent) {
              res.status(500).json({
                success: false,
                message: '阿里云TTS连接关闭，合成失败',
                error: synthesisError
              });
            }
          } else if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message: '阿里云TTS连接意外关闭',
              error: 'Connection closed unexpectedly'
            });
          }
        }
      });

      tts.on('failed', (msg) => {
        console.error('阿里云TTS合成失败:', msg);
        synthesisError = msg;
        fileStream.end();

        if (!isSynthesisCompleted && !res.headersSent) {
          res.status(500).json({
            success: false,
            message: '阿里云TTS合成失败',
            error: msg
          });
        }
      });

      // 设置超时保护
      setTimeout(() => {
        if (!isSynthesisCompleted && !res.headersSent) {
          console.error('阿里云TTS合成请求超时');
          res.status(504).json({
            success: false,
            message: '阿里云TTS合成请求超时',
            error: 'Request timeout'
          });
        }
      }, 20000); // 20秒超时

      // 开始合成 - 修改调用方式，确保参数正确
      await tts.start(param, true, 6000);

    } catch (error) {
      console.error('文本转语音失败:', error);
      return res.status(500).json({
        success: false,
        message: '生成语音文件失败',
        error: error.message,
        stack: error.stack
      });
    }
  });

  // API: 获取阿里云TTS配置
  app.get('/api/aliyun-tts-config', (req, res) => {
    const data = getData();

    // 确保配置存在
    if (!data.aliyunTtsConfig) {
      data.aliyunTtsConfig = {
        url: 'wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1',
        accessKeyId: '',
        appKey: '',
        accessKeySecret: '',
        voice: 'xiaoyun',
        format: 'mp3',
        sampleRate: 16000,
        volume: 50,
        speechRate: 0,
        pitchRate: 0
      };
      saveData(data);
    }

    // 出于安全考虑，不返回accessKeySecret
    const safeConfig = { ...data.aliyunTtsConfig };
    safeConfig.accessKeySecret = safeConfig.accessKeySecret ? '******' : '';

    res.json({
      success: true,
      config: safeConfig
    });
  });

  // API: 更新阿里云TTS配置（需要登录）
  app.post('/api/aliyun-tts-config', requireLogin, (req, res) => {
    const data = getData();

    // 确保配置存在
    if (!data.aliyunTtsConfig) {
      data.aliyunTtsConfig = {};
    }

    // 更新配置
    if (req.body.url !== undefined) {
      data.aliyunTtsConfig.url = req.body.url;
    }

    if (req.body.accessKeyId !== undefined) {
      data.aliyunTtsConfig.accessKeyId = req.body.accessKeyId;
    }

    if (req.body.appKey !== undefined) {
      data.aliyunTtsConfig.appKey = req.body.appKey;
    }

    if (req.body.accessKeySecret !== undefined && req.body.accessKeySecret !== '******') {
      data.aliyunTtsConfig.accessKeySecret = req.body.accessKeySecret;
    }

    if (req.body.voice !== undefined) {
      data.aliyunTtsConfig.voice = req.body.voice;
    }

    if (req.body.format !== undefined) {
      data.aliyunTtsConfig.format = req.body.format;
    }

    if (req.body.sampleRate !== undefined) {
      data.aliyunTtsConfig.sampleRate = parseInt(req.body.sampleRate) || 16000;
    }

    if (req.body.volume !== undefined) {
      data.aliyunTtsConfig.volume = parseInt(req.body.volume) || 50;
    }

    if (req.body.speechRate !== undefined) {
      data.aliyunTtsConfig.speechRate = parseInt(req.body.speechRate) || 0;
    }

    if (req.body.pitchRate !== undefined) {
      data.aliyunTtsConfig.pitchRate = parseInt(req.body.pitchRate) || 0;
    }

    // 保存数据
    if (saveData(data)) {
      // 出于安全考虑，不返回accessKeySecret
      const safeConfig = { ...data.aliyunTtsConfig };
      safeConfig.accessKeySecret = safeConfig.accessKeySecret ? '******' : '';

      res.json({
        success: true,
        message: '阿里云TTS配置已更新',
        config: safeConfig
      });
    } else {
      res.status(500).json({
        success: false,
        message: '保存阿里云TTS配置失败'
      });
    }
  });

  // API: 测试阿里云TTS配置
  app.post('/api/test-aliyun-tts', async (req, res) => {
    try {
      console.log('开始测试阿里云TTS Token获取...');
      const data = getData();
      const ttsConfig = data.aliyunTtsConfig || {};

      if (!ttsConfig.accessKeyId || !ttsConfig.accessKeySecret) {
        console.error('未配置阿里云TTS服务参数');
        return res.status(400).json({
          success: false,
          message: '未配置阿里云TTS服务，请先配置AccessKey ID和AccessKey Secret'
        });
      }

      console.log('使用AccessKey ID获取Token:', ttsConfig.accessKeyId);

      // 使用阿里云SDK获取Token
      const client = new RPCClient({
        accessKeyId: ttsConfig.accessKeyId,
        accessKeySecret: ttsConfig.accessKeySecret,
        endpoint: 'https://nls-meta.cn-shanghai.aliyuncs.com',
        apiVersion: '2019-02-28'
      });

      const result = await client.request('CreateToken');
      console.log('阿里云返回Token响应:', JSON.stringify(result, null, 2));

      if (!result || !result.Token || !result.Token.Id) {
        console.error('Token响应格式不正确:', result);
        return res.status(400).json({
          success: false,
          message: '获取阿里云Token失败，返回数据格式不正确',
          response: result
        });
      }

      const token = result.Token.Id;
      const rawExpireTime = result.Token.ExpireTime;
      let expireMs;

      if (typeof rawExpireTime === 'number') {
        expireMs = rawExpireTime < 1000000000000 ? rawExpireTime * 1000 : rawExpireTime;
      } else if (typeof rawExpireTime === 'string' && /^\d+$/.test(rawExpireTime)) {
        const n = Number(rawExpireTime);
        expireMs = n < 1000000000000 ? n * 1000 : n;
      } else {
        const parsed = Date.parse(rawExpireTime);
        expireMs = Number.isFinite(parsed) ? parsed : NaN;
      }

      if (!Number.isFinite(expireMs)) {
        console.error('Token过期时间解析失败，原始值:', rawExpireTime);
        return res.status(500).json({
          success: false,
          message: '获取阿里云Token成功，但解析过期时间失败',
          error: 'Invalid ExpireTime',
          apiResponse: result
        });
      }

      const expireTime = new Date(expireMs);

      console.log('成功获取Token:', token);
      console.log('Token过期时间:', expireTime);

      return res.json({
        success: true,
        message: '阿里云TTS Token获取成功',
        token: {
          id: token,
          expireTime: expireTime.toISOString()
        }
      });

    } catch (error) {
      console.error('测试阿里云TTS Token获取失败:', error.message);
      if (error.response) {
        console.error('阿里云返回错误:', error.response.data);
        return res.status(500).json({
          success: false,
          message: '测试阿里云TTS Token获取失败',
          error: error.message,
          apiResponse: error.response.data
        });
      }
      return res.status(500).json({
        success: false,
        message: '测试阿里云TTS Token获取失败',
        error: error.message
      });
    }
  });

  /**
   * 清理TTS文件夹中的旧文件
   * @param {number} maxAgeInDays 保留的最大天数，默认为7天。设置为0时清理所有文件。
   */
  function cleanupTtsFiles(maxAgeInDays = 7) {
    console.log(`开始清理TTS文件，保留最近${maxAgeInDays}天的文件...`);

    const ttsDir = path.join(baseDir, 'public', 'music', 'tts');
    if (!fs.existsSync(ttsDir)) {
      console.log('TTS目录不存在，无需清理');
      return;
    }

    // 读取目录中的所有文件
    fs.readdir(ttsDir, (err, files) => {
      if (err) {
        console.error('读取TTS目录失败:', err);
        return;
      }

      let deletedCount = 0;
      let totalCount = 0;

      // 如果maxAgeInDays为0，则清理所有文件
      const cleanAll = maxAgeInDays === 0;

      // 计算最早保留的时间点
      const now = new Date();
      const cutoffTime = now.getTime() - (maxAgeInDays * 24 * 60 * 60 * 1000);

      files.forEach(file => {
        // 只处理mp3文件
        if (!file.endsWith('.mp3')) {
          return;
        }

        totalCount++;
        const filePath = path.join(ttsDir, file);

        fs.stat(filePath, (statErr, stats) => {
          if (statErr) {
            console.error(`获取文件[${file}]状态失败:`, statErr);
            return;
          }

          // 如果是清理所有文件模式，或者文件修改时间早于截止时间，则删除文件
          if (cleanAll || stats.mtimeMs < cutoffTime) {
            fs.unlink(filePath, (unlinkErr) => {
              if (unlinkErr) {
                console.error(`删除文件[${file}]失败:`, unlinkErr);
              } else {
                deletedCount++;
                console.log(`已删除${cleanAll ? '' : '过期'}TTS文件: ${file}`);
              }
            });
          }
        });
      });

      const actionDesc = cleanAll ? '全部' : '过期';
      console.log(`TTS文件清理统计: 总计${totalCount}个文件，删除${deletedCount}个${actionDesc}文件`);
    });
  }

  // 定时清理TTS文件
  console.log('配置TTS文件定时清理任务...');
  // 每天凌晨3点执行清理任务
  cron.schedule('0 3 * * *', () => {
    cleanupTtsFiles();
  }, {
    scheduled: true,
    timezone: "Asia/Shanghai" // 使用中国时区
  });

  // 服务器启动时执行一次清理
  console.log('服务器启动，执行一次TTS文件清理...');
  setTimeout(() => {
    cleanupTtsFiles();
  }, 5000); // 延迟5秒执行，确保服务器其他部分已初始化完成

  // 添加手动清理TTS文件的API
  app.post('/api/cleanup-tts-files', requireLogin, (req, res) => {
    const maxAgeInDays = req.body.maxAgeInDays || 7;

    try {
      cleanupTtsFiles(maxAgeInDays);
      res.json({
        success: true,
        message: `TTS文件清理任务已启动，将保留最近${maxAgeInDays}天的文件`
      });
    } catch (error) {
      console.error('手动清理TTS文件失败:', error);
      res.status(500).json({
        success: false,
        message: '清理TTS文件失败',
        error: error.message
      });
    }
  });

  // 添加对不带api前缀的TTS请求的支持
  app.post('/text-to-speech', (req, res) => {
    console.log('收到不带api前缀的TTS请求，重定向到/api/text-to-speech处理');
    // 执行内部重定向
    res.redirect(307, '/api/text-to-speech');
  });
}

module.exports = {
  registerTtsRoutes
};
