const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');

function registerMusicRoutes(app, deps) {
  const {
    requireLogin,
    upload,
    getData,
    saveData,
    uuidv4,
    baseDir
  } = deps;

  const importJobs = new Map();

  const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

  async function withInsecureTls(fn) {
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      return await fn();
    } finally {
      if (typeof prev === 'undefined') {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = String(prev);
      }
    }
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)}${units[i]}`;
  }

  function guessExtByUrl(url) {
    try {
      const u = new URL(url);
      const ext = path.extname(u.pathname || '').toLowerCase();
      if (ext && ext.length <= 8) return ext;
    } catch (e) {}
    return '';
  }

  function guessExtByContentType(contentType) {
    const ct = String(contentType || '').toLowerCase();
    if (ct.includes('audio/flac') || ct.includes('audio/x-flac')) return '.flac';
    if (ct.includes('audio/mpeg')) return '.mp3';
    if (ct.includes('audio/wav')) return '.wav';
    if (ct.includes('audio/aac')) return '.aac';
    if (ct.includes('audio/mp4')) return '.m4a';
    if (ct.includes('audio/ogg')) return '.ogg';
    return '';
  }

  function ensureMusicDir() {
    const dir = path.join(baseDir, 'public', 'music');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function createImportJob(jobId, meta) {
    const job = {
      id: jobId,
      status: 'queued',
      phase: 'queued',
      message: '准备中',
      downloadedBytes: 0,
      totalBytes: null,
      percent: 0,
      createdAt: Date.now(),
      neteaseId: meta.neteaseId,
      name: meta.name,
      musicId: null,
      filename: null,
      error: null,
      progressText: ''
    };
    importJobs.set(jobId, job);
    return job;
  }

  function cleanupImportJobLater(jobId) {
    setTimeout(() => {
      importJobs.delete(jobId);
    }, 30 * 60 * 1000);
  }

  async function resolveNeteasePlayableUrl(neteaseId) {
    async function requestLevel(level) {
      const resp = await withInsecureTls(() => axios.post('https://wyapi-1.toubiec.cn/api/music/url', {
        id: String(neteaseId),
        level
      }, {
        timeout: 15000,
        httpsAgent: insecureHttpsAgent,
        headers: { 'Content-Type': 'application/json' }
      }));

      const data = resp && resp.data;
      if (!data || data.code !== 200 || !Array.isArray(data.data) || !data.data[0]) {
        throw new Error((data && data.msg) ? data.msg : '获取播放链接失败');
      }
      return String(data.data[0].url || '').trim();
    }

    const exhigh = await requestLevel('exhigh').catch(() => '');
    if (exhigh) return exhigh;
    const standard = await requestLevel('standard');
    if (!standard) throw new Error('获取播放链接失败');
    return standard;
  }

  async function startImportDownload(job, payload) {
    job.status = 'running';
    job.phase = 'resolving';
    job.message = '解析播放链接...';

    const playableUrl = await resolveNeteasePlayableUrl(payload.neteaseId);
    if (!playableUrl) throw new Error('获取播放链接失败');

    job.phase = 'downloading';
    job.message = '下载中...';

    const musicDir = ensureMusicDir();
    let ext = guessExtByUrl(playableUrl);

    const response = await withInsecureTls(() => axios.get(playableUrl, {
      responseType: 'stream',
      timeout: 0,
      maxRedirects: 5,
      httpsAgent: insecureHttpsAgent,
      headers: {
        'User-Agent': 'bbzg-music-import'
      }
    }));

    if (!ext) {
      ext = guessExtByContentType(response && response.headers ? response.headers['content-type'] : '');
    }
    if (!ext) ext = '.mp3';

    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const filePath = path.join(musicDir, filename);

    job.filename = filename;
    job.downloadedBytes = 0;
    const totalBytesHeader = response && response.headers ? response.headers['content-length'] : null;
    const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;
    job.totalBytes = Number.isFinite(totalBytes) ? totalBytes : null;

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);

      response.data.on('data', chunk => {
        const size = chunk ? chunk.length : 0;
        job.downloadedBytes += size;
        if (job.totalBytes) {
          const ratio = job.totalBytes ? job.downloadedBytes / job.totalBytes : 0;
          job.percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
          job.progressText = `${formatBytes(job.downloadedBytes)} / ${formatBytes(job.totalBytes)}`;
        } else {
          job.percent = 0;
          job.progressText = `${formatBytes(job.downloadedBytes)}`;
        }
      });

      response.data.on('error', err => {
        reject(err);
      });

      writer.on('error', err => {
        reject(err);
      });

      writer.on('finish', () => {
        resolve();
      });

      response.data.pipe(writer);
    });

    job.phase = 'saving';
    job.message = '写入本地库...';

    const data = getData();
    if (!data.music) data.music = [];

    const musicId = uuidv4();
    const musicRecord = {
      id: musicId,
      name: payload.name,
      description: payload.description || '',
      filename,
      originalname: `${payload.name || 'music'}${ext}`,
      isSound: false,
      uploadDate: new Date().toISOString(),
      source: 'netease',
      sourceId: String(payload.neteaseId)
    };

    if (payload.lrcContent) {
      try {
        const lrcFilename = `${path.parse(filename).name}.lrc`;
        const lrcFilePath = path.join(baseDir, 'public', 'music', lrcFilename);
        fs.writeFileSync(lrcFilePath, String(payload.lrcContent), 'utf8');
        musicRecord.lrcFilename = lrcFilename;
      } catch (e) {
        console.error('保存歌词文件失败:', e);
      }
    }

    data.music.push(musicRecord);
    saveData(data);

    job.status = 'done';
    job.phase = 'done';
    job.message = '完成';
    job.musicId = musicId;
    job.percent = 100;
    job.progressText = job.totalBytes ? `${formatBytes(job.totalBytes)} / ${formatBytes(job.totalBytes)}` : job.progressText;

    cleanupImportJobLater(job.id);
  }

  // API: 获取所有音乐
  app.get('/api/music', (req, res) => {
    const data = getData();

    // 确保music数组存在
    if (!data.music) {
      data.music = [];
    }

    const withIndex = data.music.map((m, idx) => ({ m, idx }));
    withIndex.sort((a, b) => {
      const ta = Date.parse(a.m && a.m.uploadDate ? a.m.uploadDate : '') || 0;
      const tb = Date.parse(b.m && b.m.uploadDate ? b.m.uploadDate : '') || 0;
      if (ta !== tb) return tb - ta;
      return b.idx - a.idx;
    });

    res.json({ success: true, music: withIndex.map(x => x.m) });
  });

  // API: 上传音乐文件
  app.post('/api/music/upload', upload.fields([
    { name: 'musicFile', maxCount: 1 },
    { name: 'lrcFile', maxCount: 1 }
  ]), (req, res) => {
    if (!req.files || !req.files.musicFile) {
      return res.status(400).json({
        success: false,
        message: '请选择音乐文件'
      });
    }

    const name = req.body.name;
    const description = req.body.description || '';
    const isSound = req.body.isSound === 'true';

    if (!name) {
      return res.status(400).json({
        success: false,
        message: '请提供音乐名称'
      });
    }

    const musicFile = req.files.musicFile[0];
    const lrcFile = req.files.lrcFile ? req.files.lrcFile[0] : null;

    // 读取数据
    const data = getData();

    // 创建音乐记录
    const musicId = uuidv4();
    const musicRecord = {
      id: musicId,
      name: name,
      description: description,
      filename: musicFile.filename,
      originalname: musicFile.originalname,
      isSound: isSound,
      uploadDate: new Date().toISOString()
    };

    // 如果有LRC文件，添加到音乐记录
    if (lrcFile) {
      musicRecord.lrcFilename = lrcFile.filename;

      // 确保歌词内容被正确保存，特别是从编辑器添加的内容
      const lrcFilePath = path.join(baseDir, 'public', 'music', lrcFile.filename);
      if (!fs.existsSync(lrcFilePath)) {
        console.error('LRC文件未被正确保存:', lrcFilePath);
      } else {
        console.log('LRC文件已保存:', lrcFilePath);
      }
    } else if (req.body.lrcContent) {
      // 如果没有上传LRC文件，但有直接输入的歌词内容
      try {
        // 生成唯一文件名
        const lrcFilename = `${uuidv4()}.lrc`;
        const lrcFilePath = path.join(baseDir, 'public', 'music', lrcFilename);

        // 将歌词内容写入文件
        fs.writeFileSync(lrcFilePath, req.body.lrcContent, 'utf8');

        // 更新音乐记录
        musicRecord.lrcFilename = lrcFilename;
        console.log('从编辑器内容创建LRC文件成功:', lrcFilename);
      } catch (error) {
        console.error('创建LRC文件失败:', error);
      }
    }

    // 添加到数据中
    data.music.push(musicRecord);
    saveData(data);

    res.json({
      success: true,
      message: '音乐上传成功',
      musicId: musicId
    });
  });

  app.post('/api/music/import-netease', requireLogin, async (req, res) => {
    try {
      const neteaseId = req.body && (req.body.neteaseId || req.body.id);
      const name = req.body && req.body.name;
      const description = req.body && req.body.description;
      const lrcContent = req.body && req.body.lrcContent;

      const idStr = String(neteaseId || '').trim();
      const nameStr = String(name || '').trim();

      if (!idStr) {
        return res.status(400).json({
          success: false,
          message: '缺少歌曲ID'
        });
      }
      if (!nameStr) {
        return res.status(400).json({
          success: false,
          message: '缺少音乐名称'
        });
      }

      const jobId = uuidv4();
      const job = createImportJob(jobId, { neteaseId: idStr, name: nameStr });

      res.json({
        success: true,
        message: '开始导入',
        jobId
      });

      startImportDownload(job, {
        neteaseId: idStr,
        name: nameStr,
        description: description || '',
        lrcContent: lrcContent || ''
      }).catch(err => {
        console.error('导入网易云音乐失败:', err);
        job.status = 'error';
        job.phase = 'error';
        job.message = '导入失败';
        job.error = err && err.message ? String(err.message) : '未知错误';
        cleanupImportJobLater(job.id);
        if (job.filename) {
          try {
            const fp = path.join(baseDir, 'public', 'music', job.filename);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
          } catch (e) {}
        }
      });
    } catch (error) {
      console.error('导入网易云音乐失败:', error);
      res.status(500).json({
        success: false,
        message: '导入失败: ' + (error && error.message ? error.message : '未知错误')
      });
    }
  });

  app.get('/api/music/import-status/:jobId', requireLogin, (req, res) => {
    const jobId = req.params.jobId;
    const job = importJobs.get(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: '任务不存在或已过期'
      });
    }
    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        phase: job.phase,
        message: job.message,
        downloadedBytes: job.downloadedBytes,
        totalBytes: job.totalBytes,
        percent: job.percent,
        progressText: job.progressText,
        musicId: job.musicId,
        filename: job.filename,
        error: job.error
      }
    });
  });

  // API: 获取LRC歌词文件
  app.get('/api/music/:id/lrc', (req, res) => {
    const musicId = req.params.id;

    // 读取数据
    const data = getData();

    // 查找音乐记录
    const music = data.music.find(m => m.id === musicId);

    if (!music || !music.lrcFilename) {
      return res.status(404).json({
        success: false,
        message: '未找到歌词文件'
      });
    }

    // 构建歌词文件路径
    const lrcFilePath = path.join(baseDir, 'public', 'music', music.lrcFilename);

    // 检查文件是否存在
    if (!fs.existsSync(lrcFilePath)) {
      return res.status(404).json({
        success: false,
        message: '歌词文件不存在'
      });
    }

    // 设置响应头
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(music.name)}.lrc"`);

    // 发送文件
    fs.createReadStream(lrcFilePath).pipe(res);
  });

  // API: 上传音效
  app.post('/api/sound/upload', upload.single('sound'), (req, res) => {
    try {
      const { name, description } = req.body;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '未找到上传的音效文件'
        });
      }

      if (!name) {
        return res.status(400).json({
          success: false,
          message: '音效名称不能为空'
        });
      }

      const data = getData();

      // 确保音乐数组存在
      if (!data.music) {
        data.music = [];
      }

      // 确保可用音效数组存在
      if (!data.availableSounds) {
        data.availableSounds = [];
      }

      // 创建新音效记录
      const newSound = {
        id: uuidv4(),
        name,
        description: description || '',
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        uploadedAt: new Date().toISOString(),
        isSound: true // 标记为音效，而不是音乐
      };

      // 将新音效添加到音乐列表中
      data.music.push(newSound);

      // 将音效名称添加到可用音效列表中
      if (!data.availableSounds.includes(req.file.filename.split('.')[0])) {
        data.availableSounds.push(req.file.filename.split('.')[0]);
      }

      saveData(data);

      res.json({
        success: true,
        message: '音效上传成功',
        sound: newSound
      });
    } catch (error) {
      console.error('上传音效时发生错误:', error);
      res.status(500).json({
        success: false,
        message: '上传音效失败: ' + error.message
      });
    }
  });

  // API: 删除音乐
  app.delete('/api/music/delete/:id', (req, res) => {
    const musicId = req.params.id;
    const data = getData();

    // 确保music数组存在
    if (!data.music) {
      data.music = [];
      return res.status(404).json({
        success: false,
        message: '未找到音乐'
      });
    }

    const musicIndex = data.music.findIndex(music => music.id === musicId);

    if (musicIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '未找到音乐'
      });
    }

    // 获取文件名
    const filename = data.music[musicIndex].filename;

    // 删除物理文件
    try {
      if (typeof filename === 'string' && filename.trim()) {
        const filePath = path.join(baseDir, 'public', 'music', filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('删除音乐文件成功:', filename);
        }
      }

      // 检查并删除对应的LRC歌词文件
      if (data.music[musicIndex].lrcFilename) {
        const lrcFilePath = path.join(baseDir, 'public', 'music', data.music[musicIndex].lrcFilename);
        if (fs.existsSync(lrcFilePath)) {
          fs.unlinkSync(lrcFilePath);
          console.log('删除歌词文件成功:', data.music[musicIndex].lrcFilename);
        }
      }
    } catch (error) {
      console.error('删除文件时发生错误:', error);
      // 继续处理，即使文件删除失败
    }

    // 从数据中删除音乐记录
    data.music.splice(musicIndex, 1);

    // 确保users数组存在
    if (!data.users) {
      data.users = [];
    } else {
      // 更新使用此音乐的用户
      data.users.forEach(user => {
        if (user.musicId === musicId) {
          delete user.musicId;
          delete user.threshold;
        }
      });
    }

    saveData(data);

    res.json({
      success: true,
      message: '音乐删除成功'
    });
  });

  // API: 获取单个音乐信息
  app.get('/api/music/:id', (req, res) => {
    const musicId = req.params.id;
    const data = getData();

    const music = data.music.find(m => m.id === musicId);

    if (!music) {
      return res.status(404).json({
        success: false,
        message: '未找到该音乐'
      });
    }

    res.json({
      success: true,
      music
    });
  });

  // API: 更新音乐信息
  app.post('/api/music/update', upload.fields([
    { name: 'lrcFile', maxCount: 1 }
  ]), (req, res) => {
    try {
      const { musicId, name, description, lrcContent } = req.body;

      if (!musicId || !name) {
        return res.status(400).json({
          success: false,
          message: '缺少必要参数'
        });
      }

      const data = getData();
      const musicIndex = data.music.findIndex(m => m.id === musicId);

      if (musicIndex === -1) {
        return res.status(404).json({
          success: false,
          message: '未找到该音乐'
        });
      }

      // 更新基本信息
      data.music[musicIndex].name = name;
      data.music[musicIndex].description = description || '';

      // 处理LRC文件上传
      if (req.files && req.files.lrcFile && req.files.lrcFile.length > 0) {
        const lrcFile = req.files.lrcFile[0];

        // 移动LRC文件到音乐目录
        const lrcFilename = `${path.parse(data.music[musicIndex].filename).name}.lrc`;
        const lrcFilePath = path.join(baseDir, 'public', 'music', lrcFilename);

        // 读取上传的文件内容
        if (lrcFile.path) {
          // 如果存在临时文件路径，直接读取该文件内容
          const fileContent = fs.readFileSync(lrcFile.path);
          fs.writeFileSync(lrcFilePath, fileContent);
        } else if (lrcFile.buffer) {
          // 如果存在buffer（内存中的文件内容），直接使用
          fs.writeFileSync(lrcFilePath, lrcFile.buffer);
        } else {
          throw new Error('无法读取上传的LRC文件内容');
        }

        // 更新数据库记录
        data.music[musicIndex].lrcFilename = lrcFilename;
      }
      // 如果没有上传文件但有LRC内容，直接保存内容为LRC文件
      else if (lrcContent && typeof lrcContent === 'string') {
        const lrcFilename = `${path.parse(data.music[musicIndex].filename).name}.lrc`;
        const lrcFilePath = path.join(baseDir, 'public', 'music', lrcFilename);

        // 将LRC内容写入文件
        fs.writeFileSync(lrcFilePath, lrcContent, 'utf8');

        // 更新数据库记录
        data.music[musicIndex].lrcFilename = lrcFilename;
      }

      // 保存数据
      saveData(data);

      res.json({
        success: true,
        message: '音乐更新成功',
        music: data.music[musicIndex]
      });
    } catch (error) {
      console.error('更新音乐失败:', error);
      res.status(500).json({
        success: false,
        message: '更新音乐失败: ' + error.message
      });
    }
  });

  // 添加获取默认战歌的API
  app.get('/api/defaultBattleSong', requireLogin, (req, res) => {
    const data = getData();

    res.json({
      success: true,
      defaultBattleSong: data.defaultBattleSong || null
    });
  });

  // 添加一个公开的API端点获取默认战歌（不需要登录）
  app.get('/api/defaultBattleSong/public', (req, res) => {
    const data = getData();

    // 如果存在默认战歌，需要补充音乐详细信息
    if (data.defaultBattleSong && data.defaultBattleSong.musicId) {
      const defaultMusic = data.music.find(m => m.id === data.defaultBattleSong.musicId);
      if (defaultMusic) {
        res.json({
          success: true,
          defaultBattleSong: {
            id: defaultMusic.id,
            name: defaultMusic.name,
            filename: defaultMusic.filename,
            musicId: defaultMusic.id
          }
        });
        return;
      }
    }

    res.json({
      success: true,
      defaultBattleSong: data.defaultBattleSong || null
    });
  });

  // 上传默认战歌
  app.post('/api/defaultBattleSong/upload', requireLogin, upload.single('battleSongFile'), (req, res) => {
    // 检查文件是否上传
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请选择音乐文件'
      });
    }

    const data = getData();

    // 如果已存在默认战歌，删除旧文件
    if (data.defaultBattleSong && data.defaultBattleSong.filename) {
      const oldFilePath = path.join(baseDir, 'public', 'music', data.defaultBattleSong.filename);
      try {
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      } catch (error) {
        console.error('删除旧默认战歌文件失败:', error);
      }
    }

    // 创建新的默认战歌记录
    const defaultBattleSong = {
      id: uuidv4(),
      name: '默认战歌',
      filename: req.file.filename,
      uploadTime: new Date().toISOString()
    };

    // 更新数据
    data.defaultBattleSong = defaultBattleSong;
    saveData(data);

    res.json({
      success: true,
      message: '默认战歌已上传',
      defaultBattleSong
    });
  });

  // 删除默认战歌
  app.delete('/api/defaultBattleSong/delete', requireLogin, (req, res) => {
    const data = getData();

    // 如果没有默认战歌，返回成功
    if (!data.defaultBattleSong) {
      return res.json({
        success: true,
        message: '没有默认战歌需要删除'
      });
    }

    // 删除文件
    if (data.defaultBattleSong.filename) {
      const filePath = path.join(baseDir, 'public', 'music', data.defaultBattleSong.filename);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error('删除默认战歌文件失败:', error);
      }
    }

    // 更新数据
    data.defaultBattleSong = null;
    saveData(data);

    res.json({
      success: true,
      message: '默认战歌已删除'
    });
  });
}

module.exports = {
  registerMusicRoutes
};
