const fs = require('fs');
const path = require('path');

function registerAudioPlaybackRoutes(app, deps) {
  const { requireLogin, upload, getData, saveData, uuidv4, baseDir } = deps;

  // API: 获取启动音频配置（GET允许公开访问）
  app.get('/api/startup-audio', (req, res) => {
    try {
      const data = getData();

      const cfg = data.startupAudio || {
        mode: 'default',
        audioPath: '/music/Go.mp3',
        ttsText: '',
        updatedAt: null
      };

      res.json({
        success: true,
        mode: cfg.mode || 'default',
        audioPath: cfg.audioPath || '/music/Go.mp3',
        ttsText: cfg.ttsText || ''
      });
    } catch (error) {
      console.error('获取启动音频配置失败:', error);
      res.status(500).json({ success: false, message: '获取启动音频配置失败' });
    }
  });

  // API: 保存启动音频配置（需要登录）
  app.post('/api/startup-audio', requireLogin, (req, res) => {
    try {
      const { mode, audioPath, ttsText } = req.body || {};
      const cleanMode = typeof mode === 'string' ? mode : 'default';
      const allowedModes = ['default', 'tts', 'file'];
      if (!allowedModes.includes(cleanMode)) {
        return res.status(400).json({ success: false, message: '无效的模式' });
      }

      const data = getData();

      const out = {
        mode: cleanMode,
        audioPath: '/music/Go.mp3',
        ttsText: '',
        updatedAt: new Date().toISOString()
      };

      if (cleanMode !== 'default') {
        if (!audioPath || typeof audioPath !== 'string') {
          return res.status(400).json({ success: false, message: '缺少audioPath' });
        }
        if (!audioPath.startsWith('/music/')) {
          return res.status(400).json({ success: false, message: 'audioPath必须以 /music/ 开头' });
        }
        out.audioPath = audioPath;
        if (cleanMode === 'tts') {
          out.ttsText = typeof ttsText === 'string' ? ttsText : '';
        }
      }

      data.startupAudio = out;
      saveData(data);

      return res.json({
        success: true,
        message: '启动音频配置已保存',
        startupAudio: out
      });
    } catch (error) {
      console.error('保存启动音频配置失败:', error);
      return res.status(500).json({ success: false, message: '保存启动音频配置失败' });
    }
  });

  // API: 上传启动音频文件（需要登录）
  app.post('/api/startup-audio/upload', requireLogin, upload.single('startupAudioFile'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: '请选择音频文件' });
      }

      const relativePath = `/music/custom/${req.file.filename}`;
      return res.json({
        success: true,
        message: '启动音频上传成功',
        audioPath: relativePath
      });
    } catch (error) {
      console.error('上传启动音频失败:', error);
      return res.status(500).json({ success: false, message: '上传启动音频失败' });
    }
  });

  // API: 个性化音频 - 列表（需要登录）
  app.post('/api/personalized/list', requireLogin, (req, res) => {
    try {
      const data = getData();
      if (!Array.isArray(data.personalizedAudio)) {
        data.personalizedAudio = [];
        saveData(data);
      }

      return res.json({
        success: true,
        items: data.personalizedAudio
      });
    } catch (error) {
      console.error('获取个性化列表失败:', error);
      return res.status(500).json({ success: false, message: '获取个性化列表失败' });
    }
  });

  // API: 个性化音频 - 添加一条（需要登录）
  app.post('/api/personalized/add', requireLogin, (req, res) => {
    try {
      const { name, audioPath, source, ttsText } = req.body || {};
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ success: false, message: '缺少名称' });
      }
      if (!audioPath || typeof audioPath !== 'string' || !audioPath.startsWith('/music/')) {
        return res.status(400).json({ success: false, message: 'audioPath无效' });
      }

      const data = getData();
      if (!Array.isArray(data.personalizedAudio)) data.personalizedAudio = [];

      const item = {
        id: uuidv4(),
        name: name.trim(),
        audioPath,
        source: typeof source === 'string' ? source : 'unknown',
        ttsText: typeof ttsText === 'string' ? ttsText : '',
        createdAt: new Date().toISOString()
      };

      data.personalizedAudio.unshift(item);
      saveData(data);

      return res.json({ success: true, message: '已添加', item });
    } catch (error) {
      console.error('添加个性化音频失败:', error);
      return res.status(500).json({ success: false, message: '添加个性化音频失败' });
    }
  });

  // API: 个性化音频 - 上传并加入列表（需要登录）
  app.post('/api/personalized/upload', requireLogin, upload.single('personalizedAudioFile'), (req, res) => {
    try {
      const name = req.body && typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name) {
        return res.status(400).json({ success: false, message: '缺少名称' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: '请选择音频文件' });
      }

      const relativePath = `/music/custom/${req.file.filename}`;

      const data = getData();
      if (!Array.isArray(data.personalizedAudio)) data.personalizedAudio = [];

      const item = {
        id: uuidv4(),
        name,
        audioPath: relativePath,
        source: 'upload',
        ttsText: '',
        createdAt: new Date().toISOString()
      };

      data.personalizedAudio.unshift(item);
      saveData(data);

      return res.json({
        success: true,
        message: '上传成功',
        audioPath: relativePath,
        item
      });
    } catch (error) {
      console.error('上传个性化音频失败:', error);
      return res.status(500).json({ success: false, message: '上传个性化音频失败' });
    }
  });

  // API: 个性化音频 - 发射（需要登录）
  app.post('/api/personalized/fire', requireLogin, (req, res) => {
    try {
      const { audioPath } = req.body || {};
      if (!audioPath || typeof audioPath !== 'string' || !audioPath.startsWith('/music/')) {
        return res.status(400).json({ success: false, message: 'audioPath无效' });
      }

      const data = getData();
      const now = Date.now();
      data.personalizedFire = {
        id: now,
        audioPath,
        firedAt: new Date().toISOString()
      };
      saveData(data);

      return res.json({ success: true, message: '已发射', event: data.personalizedFire });
    } catch (error) {
      console.error('发射失败:', error);
      return res.status(500).json({ success: false, message: '发射失败' });
    }
  });

  // API: 个性化音频 - 首页轮询获取最新发射事件（GET允许公开访问）
  app.get('/api/personalized/fire', (req, res) => {
    try {
      const after = typeof req.query.after === 'string' ? Number(req.query.after) : 0;
      const data = getData();
      const ev = data.personalizedFire;
      if (!ev || !ev.id || !ev.audioPath) {
        return res.json({ success: true, event: null });
      }
      const id = Number(ev.id);
      if (Number.isFinite(after) && after > 0 && Number.isFinite(id) && id <= after) {
        return res.json({ success: true, event: null });
      }
      return res.json({ success: true, event: ev });
    } catch (error) {
      console.error('获取发射事件失败:', error);
      return res.status(500).json({ success: false, message: '获取发射事件失败' });
    }
  });

  app.get('/api/dashboard', (req, res) => {
    try {
      const data = getData();

      const latestInquiry = data.latestInquiry && typeof data.latestInquiry === 'object' ? data.latestInquiry : null;

      let latestDeal = null;
      if (data.latestDeal && typeof data.latestDeal === 'object') {
        latestDeal = {};

        if (data.latestDeal.announcement) {
          latestDeal.announcement = String(data.latestDeal.announcement).replace(/\s+/g, ' ').trim();
        } else {
          latestDeal.announcement = '';
        }

        if (data.latestDeal.musicToPlay && typeof data.latestDeal.musicToPlay === 'object') {
          latestDeal.musicToPlay = {
            ...data.latestDeal.musicToPlay,
            userName: data.latestDeal.musicToPlay.userName ? String(data.latestDeal.musicToPlay.userName).replace(/\s+/g, ' ').trim() : data.latestDeal.musicToPlay.userName,
            userPosition: data.latestDeal.musicToPlay.userPosition ? String(data.latestDeal.musicToPlay.userPosition).replace(/\s+/g, ' ').trim() : data.latestDeal.musicToPlay.userPosition
          };
        }

        if (data.latestDeal.person) {
          latestDeal.person = String(data.latestDeal.person).replace(/\s+/g, ' ').trim();
        }
        if (data.latestDeal.platform) {
          latestDeal.platform = String(data.latestDeal.platform).replace(/\s+/g, ' ').trim();
        }
      }

      return res.json({
        success: true,
        inquiryCount: typeof data.inquiryCount === 'number' ? data.inquiryCount : 0,
        dealAmount: typeof data.dealAmount === 'number' ? data.dealAmount : 0,
        latestInquiry,
        latestDeal
      });
    } catch (error) {
      console.error('获取dashboard失败:', error);
      return res.status(500).json({ success: false, message: '获取dashboard失败' });
    }
  });

  function scanAudioCleanupItems() {
    const data = getData();

    const referenced = new Set();
    try {
      if (data.startupAudio && typeof data.startupAudio.audioPath === 'string') {
        referenced.add(data.startupAudio.audioPath);
      }
    } catch (e) {}

    try {
      if (Array.isArray(data.personalizedAudio)) {
        data.personalizedAudio.forEach(it => {
          if (it && typeof it.audioPath === 'string') referenced.add(it.audioPath);
        });
      }
    } catch (e) {}

    const roots = [
      { dir: path.join(baseDir, 'public', 'music', 'tts'), prefix: '/music/tts/' },
      { dir: path.join(baseDir, 'public', 'music', 'custom'), prefix: '/music/custom/' }
    ];

    const items = [];
    roots.forEach(r => {
      try {
        if (!fs.existsSync(r.dir)) return;
        const files = fs.readdirSync(r.dir);
        files.forEach(f => {
          const full = path.join(r.dir, f);
          let st;
          try { st = fs.statSync(full); } catch (e) { return; }
          if (!st.isFile()) return;
          const audioPath = `${r.prefix}${f}`;
          if (referenced.has(audioPath)) return;
          items.push({
            audioPath,
            sizeKb: Math.round(st.size / 1024)
          });
        });
      } catch (e) {
        console.error('扫描目录失败:', r.dir, e);
      }
    });

    return items.sort((a, b) => (b.sizeKb || 0) - (a.sizeKb || 0));
  }

  // API: 音频清理 - 扫描（需要登录）
  app.post('/api/audio-cleanup/scan', requireLogin, (req, res) => {
    try {
      const items = scanAudioCleanupItems();
      return res.json({ success: true, items });
    } catch (error) {
      console.error('扫描清理列表失败:', error);
      return res.status(500).json({ success: false, message: '扫描失败' });
    }
  });

  // API: 音频清理 - 删除（需要登录）
  app.post('/api/audio-cleanup/delete', requireLogin, (req, res) => {
    try {
      const { audioPath } = req.body || {};
      if (!audioPath || typeof audioPath !== 'string') {
        return res.status(400).json({ success: false, message: '缺少audioPath' });
      }

      const allowedPrefixes = ['/music/tts/', '/music/custom/'];
      const matchedPrefix = allowedPrefixes.find(p => audioPath.startsWith(p));
      if (!matchedPrefix) {
        return res.status(400).json({ success: false, message: '不允许删除该路径' });
      }

      const rel = audioPath.replace('/music/', '');
      const fullPath = path.join(baseDir, 'public', 'music', rel);

      const safeRootTts = path.join(baseDir, 'public', 'music', 'tts') + path.sep;
      const safeRootCustom = path.join(baseDir, 'public', 'music', 'custom') + path.sep;
      const normalized = path.normalize(fullPath);
      if (!normalized.startsWith(safeRootTts) && !normalized.startsWith(safeRootCustom)) {
        return res.status(400).json({ success: false, message: '路径校验失败' });
      }

      if (fs.existsSync(normalized)) {
        fs.unlinkSync(normalized);
      }

      const items = scanAudioCleanupItems();
      return res.json({ success: true, message: '删除成功', items });
    } catch (error) {
      console.error('删除音频失败:', error);
      return res.status(500).json({ success: false, message: '删除失败' });
    }
  });
}

module.exports = {
  registerAudioPlaybackRoutes
};
