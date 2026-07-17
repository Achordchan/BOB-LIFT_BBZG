const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const RPCClient = require('@alicloud/pop-core').RPCClient;
const cron = require('node-cron');
const { createRateLimiter, createConcurrencyGate } = require('../lib/rate-limit');
const { publicErrorPayload, logSafe } = require('../lib/safe-error');
const { getClientIp } = require('../lib/request-ip');

function ttsDebug(...args) {
  if (String(process.env.BBZG_TTS_DEBUG || process.env.BBZG_API_LOG || '').trim() === '1') {
    console.log(...args);
  }
}

function registerTtsRoutes(app, deps) {
  const {
    requireLogin,
    getData,
    saveData,
    baseDir,
    parseDealAmountInput,
    formatDealAmountForTts
  } = deps;

  const ttsRateLimiter = createRateLimiter({
    windowMs: Number(process.env.BBZG_TTS_RATE_WINDOW_MS || 60_000),
    max: Number(process.env.BBZG_TTS_RATE_MAX || 20),
    blockMs: Number(process.env.BBZG_TTS_RATE_BLOCK_MS || 60_000)
  });
  const ttsGate = createConcurrencyGate(Number(process.env.BBZG_TTS_CONCURRENCY || 2));
  const MAX_TTS_TEXT_LENGTH = Number(process.env.BBZG_TTS_MAX_TEXT_LENGTH || 180);
  const inFlightHashes = new Map();

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

    if (!text) {
      return res.status(400).json({
        success: false,
        message: '文本为空'
      });
    }
    if (text.length > MAX_TTS_TEXT_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `文本过长，最多 ${MAX_TTS_TEXT_LENGTH} 字`
      });
    }

    const rateKey = `tts:${getClientIp(req)}`;
    const limited = ttsRateLimiter.hit(rateKey);
    if (!limited.allowed) {
      return res.status(429).json({
        success: false,
        message: 'TTS 调用过于频繁，请稍后再试',
        retryAfterMs: limited.retryAfterMs
      });
    }

    // 记录设备类型信息用于排查问题
    const deviceInfo = {
      type: deviceType || 'unknown',
      screen: screenSize || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    ttsDebug(`文本转语音请求: 长度=${text.length}, 设备=${deviceInfo.type}, 屏幕=${deviceInfo.screen}`);

    let resolveInFlight = null;
    let rejectInFlight = null;
    let clearInFlight = null;
    let filePath = '';
    let relativePath = '';
    let hash = '';
    let inflightPromise = null;
    // 先做缓存命中判断，再进入并发门闸，避免已缓存文本也占并发
    hash = crypto.createHash('md5').update(text).digest('hex');
    const filename = `${hash}.mp3`;
    filePath = path.join(baseDir, 'public', 'music', 'tts', filename);
    relativePath = `/music/tts/${filename}`;

    // 确保tts目录存在（缓存检查前）
    const ttsDirEarly = path.join(baseDir, 'public', 'music', 'tts');
    if (!fs.existsSync(ttsDirEarly)) {
      try {
        fs.mkdirSync(ttsDirEarly, { recursive: true });
      } catch (mkdirError) {
        console.error('创建TTS目录失败:', mkdirError);
        return res.status(500).json(publicErrorPayload('无法创建TTS目录', mkdirError));
      }
    }

    if (fs.existsSync(filePath)) {
      ttsDebug('TTS文件已存在，直接返回:', relativePath);
      return res.json({
        success: true,
        message: '语音文件已存在',
        audioPath: relativePath
      });
    }

    if (inFlightHashes.has(hash)) {
      try {
        const audioPath = await inFlightHashes.get(hash);
        return res.json({
          success: true,
          message: '语音文件已生成',
          audioPath
        });
      } catch (error) {
        // 前一个同文本任务失败，继续生成
      }
    }

    const gateStats = ttsGate.stats();
    // queued 上限：max*4，防止队列无限增长
    if (gateStats.active + gateStats.queued >= gateStats.max * 4) {
      return res.status(429).json({
        success: false,
        message: 'TTS 服务繁忙，请稍后再试'
      });
    }

    try {
      await ttsGate.run(async () => {
      // 进入门闸后再次检查缓存/in-flight，避免排队期间已生成

      if (fs.existsSync(filePath)) {
        ttsDebug('TTS文件已存在，直接返回:', relativePath);
        if (!res.headersSent) {
          res.json({
            success: true,
            message: '语音文件已存在',
            audioPath: relativePath
          });
        }
        return;
      }

      if (inFlightHashes.has(hash)) {
        try {
          const audioPath = await inFlightHashes.get(hash);
          if (!res.headersSent) {
            res.json({
              success: true,
              message: '语音文件已生成',
              audioPath
            });
          }
          return;
        } catch (error) {
          // 前一个同文本任务失败，继续生成
        }
      }

      inflightPromise = new Promise((resolve, reject) => {
        resolveInFlight = resolve;
        rejectInFlight = reject;
      });
      // 立即挂兜底 catch，避免 rejectInFlight 在无等待方时变成 unhandledRejection
      inflightPromise.catch(() => {});
      inFlightHashes.set(hash, inflightPromise);
      clearInFlight = () => {
        if (inFlightHashes.get(hash) === inflightPromise) {
          inFlightHashes.delete(hash);
        }
      };

      // 从数据文件中获取阿里云TTS配置
      const data = getData();
      const ttsConfig = data.aliyunTtsConfig || {};

      if (!ttsConfig.accessKeyId || !ttsConfig.accessKeySecret || !ttsConfig.appKey) {
        rejectInFlight(new Error('missing tts config'));
        clearInFlight();
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

      logSafe('log', '正在获取阿里云Token');
      const tokenResult = await client.request('CreateToken');
      if (!tokenResult || !tokenResult.Token || !tokenResult.Token.Id) {
        logSafe('error', '获取阿里云Token失败');
        rejectInFlight(new Error('token failed'));
        clearInFlight();
        return res.status(500).json(publicErrorPayload('获取阿里云Token失败', new Error('无效的Token响应')));
      }

      // 使用获取到的Token
      const token = tokenResult.Token.Id;
      logSafe('log', '成功获取阿里云Token');

      // 引入阿里云语音合成SDK
      const Nls = require('alibabacloud-nls');

      // 创建文件流
      const fileStream = fs.createWriteStream(filePath);
      fileStream.on('error', (streamError) => {
        console.error('创建TTS文件流失败:', streamError);
        try { if (typeof rejectInFlight === 'function') rejectInFlight(streamError); } catch (_) {}
        try { if (typeof clearInFlight === 'function') clearInFlight(); } catch (_) {}
        if (!res.headersSent) {
          return res.status(500).json(publicErrorPayload('创建语音文件失败', streamError));
        }
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

      ttsDebug('语音合成参数已就绪', { voice: param.voice, format: param.format, sample_rate: param.sample_rate });

      let isSynthesisCompleted = false;
      let synthesisError = null;

      // 设置回调函数
      tts.on('meta', (msg) => {
        ttsDebug('阿里云TTS元信息已接收');
      });

      tts.on('data', (data) => {
        fileStream.write(data, 'binary');
      });

      tts.on('completed', (msg) => {
        ttsDebug('阿里云TTS合成完成');
        isSynthesisCompleted = true;

        // fileStream.end 异步落盘，必须等 finish 再 stat/响应，否则易读到 0 字节
        const finalizeSuccess = () => {
          try {
            const stats = fs.statSync(filePath);
            if (stats.size === 0) {
              console.error('TTS文件生成成功但是文件大小为0');
              try { fs.unlinkSync(filePath); } catch (_) {}
              rejectInFlight(new Error('empty tts file'));
              clearInFlight();
              if (!res.headersSent) {
                res.status(500).json({
                  success: false,
                  message: '生成的语音文件大小为0，请重试',
                  error: 'Empty file'
                });
              }
              return;
            }

            resolveInFlight(relativePath);
            clearInFlight();
            if (!res.headersSent) {
              res.json({
                success: true,
                message: '语音文件生成成功',
                audioPath: relativePath
              });
            }
          } catch (statError) {
            console.error('读取或验证TTS文件失败:', statError);
            rejectInFlight(statError || new Error('tts validate failed'));
            clearInFlight();
            if (!res.headersSent) {
              res.status(500).json(publicErrorPayload('语音文件验证失败', statError));
            }
          }
        };

        fileStream.once('finish', finalizeSuccess);
        fileStream.once('error', (streamError) => {
          console.error('TTS 文件流 finish 前失败:', streamError);
          rejectInFlight(streamError);
          clearInFlight();
          if (!res.headersSent) {
            res.status(500).json(publicErrorPayload('写入语音文件失败', streamError));
          }
        });
        fileStream.end();
      });

      tts.on('closed', () => {
        ttsDebug('阿里云TTS连接关闭');
        if (!isSynthesisCompleted) {
          fileStream.end();

          // 如果没有合成完成但连接关闭了，检查是否有错误
          if (synthesisError) {
            if (!res.headersSent) {
              rejectInFlight(new Error(synthesisError || 'tts closed'));
              clearInFlight();
              res.status(500).json(publicErrorPayload('阿里云TTS连接关闭，合成失败', new Error(String(synthesisError || 'tts closed'))));
            }
          } else if (!res.headersSent) {
            rejectInFlight(new Error('tts closed unexpectedly'));
            clearInFlight();
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
          rejectInFlight(new Error(msg || 'tts failed'));
          clearInFlight();
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
          rejectInFlight(new Error('tts timeout'));
          clearInFlight();
          res.status(504).json({
            success: false,
            message: '阿里云TTS合成请求超时',
            error: 'Request timeout'
          });
        }
      }, 20000); // 20秒超时

      // 开始合成 - 修改调用方式，确保参数正确
      await tts.start(param, true, 6000);
      // 门闸持有到合成完成/失败，真正限制阿里云并发连接数
      await inflightPromise;
      }); // ttsGate.run

    } catch (error) {
      console.error('文本转语音失败:', error);
      try {
        if (typeof rejectInFlight === 'function') rejectInFlight(error);
      } catch (_) {}
      try {
        if (typeof clearInFlight === 'function') clearInFlight();
        else if (hash && inflightPromise && inFlightHashes.get(hash) === inflightPromise) {
          inFlightHashes.delete(hash);
        }
      } catch (_) {}
      // 失败时尽量删除半成品文件，避免脏缓存
      try {
        if (typeof filePath === 'string' && filePath && fs.existsSync(filePath)) {
          const st = fs.statSync(filePath);
          if (!st.size) fs.unlinkSync(filePath);
        }
      } catch (_) {}
      if (!res.headersSent) {
        return res.status(500).json(publicErrorPayload('生成语音文件失败', error));
      }
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
      logSafe('log', '开始测试阿里云TTS Token获取');
      const data = getData();
      const ttsConfig = data.aliyunTtsConfig || {};

      if (!ttsConfig.accessKeyId || !ttsConfig.accessKeySecret) {
        console.error('未配置阿里云TTS服务参数');
        return res.status(400).json({
          success: false,
          message: '未配置阿里云TTS服务，请先配置AccessKey ID和AccessKey Secret'
        });
      }

      logSafe('log', '使用已配置 AccessKey 获取 Token');

      // 使用阿里云SDK获取Token
      const client = new RPCClient({
        accessKeyId: ttsConfig.accessKeyId,
        accessKeySecret: ttsConfig.accessKeySecret,
        endpoint: 'https://nls-meta.cn-shanghai.aliyuncs.com',
        apiVersion: '2019-02-28'
      });

      const result = await client.request('CreateToken');
      logSafe('log', '阿里云返回 Token 响应');

      if (!result || !result.Token || !result.Token.Id) {
        logSafe('error', 'Token响应格式不正确');
        return res.status(400).json(publicErrorPayload('获取阿里云Token失败，返回数据格式不正确', new Error('invalid token response')));
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
        return res.status(500).json(publicErrorPayload('获取阿里云Token成功，但解析过期时间失败', new Error('Invalid ExpireTime')));
      }

      const expireTime = new Date(expireMs);

      logSafe('log', '成功获取 Token');
      logSafe('log', 'Token 过期时间已解析');

      const masked = token && token.length > 8
        ? `${token.slice(0, 4)}***${token.slice(-4)}`
        : '***';
      return res.json({
        success: true,
        message: '阿里云TTS Token获取成功',
        token: {
          id: masked,
          expireTime: expireTime.toISOString()
        }
      });

    } catch (error) {
      logSafe('error', '测试阿里云TTS Token获取失败', error);
      if (error.response) {
        logSafe('error', '阿里云返回错误');
        return res.status(500).json(publicErrorPayload('测试阿里云TTS Token获取失败', error));
      }
      return res.status(500).json(publicErrorPayload('测试阿里云TTS Token获取失败', error));
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

  // 定时清理TTS文件（测试环境可关闭，避免挂起测试进程）
  const enableTtsMaintenance = process.env.BBZG_DISABLE_TTS_MAINTENANCE !== '1';
  if (enableTtsMaintenance) {
    console.log('配置TTS文件定时清理任务...');
    cron.schedule('0 3 * * *', () => {
      cleanupTtsFiles();
    }, {
      scheduled: true
    });

    console.log('服务器启动，执行一次TTS文件清理...');
    setTimeout(() => {
      cleanupTtsFiles();
    }, 5000);
  }

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
      res.status(500).json(publicErrorPayload('清理TTS文件失败', error));
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
