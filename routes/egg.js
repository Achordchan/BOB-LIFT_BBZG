const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createNeteaseClient } = require('../lib/netease-client');
const { getClientIp } = require('../lib/request-ip');
const { hashPassword, verifyPassword, needsRehash } = require('../lib/password');
const { createRateLimiter } = require('../lib/rate-limit');

function registerEggRoutes(app, deps) {
  const netease = createNeteaseClient();
  const { getData, saveData, updateData, uuidv4, baseDir } = deps;

  const guessExtByUrl = netease.guessExtByUrl;
  const guessExtByContentType = netease.guessExtByContentType;
  const fetchNeteaseLyric = netease.fetchNeteaseLyric;
  const resolveNeteasePlayableUrl = netease.resolveNeteasePlayableUrl;
  const eggLoginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, blockMs: 15 * 60 * 1000 });

  function safeUnlink(targetPath) {
    try {
      if (targetPath && fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    } catch (e) {}
  }

  function sanitizeText(x) {
    return (x == null) ? '' : String(x);
  }

  function sanitizeFilename(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    return raw
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
      .trim();
  }

  function splitJoinedMusicName(name) {
    const text = String(name || '').trim();
    const index = text.lastIndexOf('-');
    if (index <= 0 || index >= text.length - 1) return { songName: text, artist: '' };
    return {
      songName: text.slice(0, index).trim(),
      artist: text.slice(index + 1).trim()
    };
  }



  function ensureMusicDir() {
    const dir = path.join(baseDir, 'public', 'music');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function getEggUser(req) {
    const id = req && req.session ? req.session.eggUserId : null;
    if (!id) return null;
    const data = getData();
    if (!data || !Array.isArray(data.users)) return null;
    return data.users.find(u => u && u.id === id) || null;
  }

  function sanitizeUserForResponse(user) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      position: user.position,
      musicId: user.musicId || null,
      loginUsername: user.loginUsername || '',
      photoUrl: user.photoUrl || '',
      fullPhotoUrl: user.fullPhotoUrl || ''
    };
  }





  async function importNeteaseToLocal(payload) {
    const idStr = String(payload && payload.neteaseId ? payload.neteaseId : '').trim();
    const nameStr = String(payload && payload.name ? payload.name : '').trim();

    if (!idStr) throw new Error('缺少歌曲ID');
    if (!nameStr) throw new Error('缺少音乐名称');

    const existingData = getData();
    if (existingData && Array.isArray(existingData.music)) {
      const found = existingData.music.find(m => m && m.source === 'netease' && String(m.sourceId || '') === idStr);
      if (found && found.filename) {
        const fp = path.join(baseDir, 'public', 'music', String(found.filename));
        if (fs.existsSync(fp)) {
          if (!found.lrcFilename) {
            try {
              const lyric = await fetchNeteaseLyric(idStr);
              const lyricText = lyric.lyric || lyric.tLyric || '';
              if (lyricText) {
                const cachedLyricName = `${path.parse(found.filename).name}.lrc`;
                const cachedLyricPath = path.join(baseDir, 'public', 'music', cachedLyricName);
                fs.writeFileSync(cachedLyricPath, lyricText, 'utf8');
                // 异步后锁内重读，避免旧快照覆盖并发写入
                if (typeof updateData === 'function') {
                  updateData((latest) => {
                    if (!latest.music || !Array.isArray(latest.music)) return false;
                    const target = latest.music.find(m => m && m.source === 'netease' && String(m.sourceId || '') === idStr);
                    if (!target || target.lrcFilename) return false;
                    target.lrcFilename = cachedLyricName;
                    return latest;
                  });
                } else if (Array.isArray(existingData.music)) {
                  found.lrcFilename = cachedLyricName;
                  saveData(existingData);
                }
              }
            } catch (e) {}
          }
          return found;
        }
      }
    }

    let lyricText = '';
    try {
      const lyric = await fetchNeteaseLyric(idStr);
      lyricText = lyric.lyric || lyric.tLyric || '';
    } catch (e) {}

    const playableUrl = await resolveNeteasePlayableUrl(idStr);
    if (!playableUrl) throw new Error('获取播放链接失败');

    const response = await axios.get(playableUrl, {
      responseType: 'stream',
      timeout: Number(process.env.BBZG_MUSIC_DOWNLOAD_TIMEOUT_MS || 30000),
      maxRedirects: 5,
      headers: {
        'User-Agent': 'bbzg-egg-import'
      }
    });

    let ext = guessExtByUrl(playableUrl);
    if (!ext) ext = guessExtByContentType(response && response.headers ? response.headers['content-type'] : '');
    if (!ext) ext = '.mp3';

    const musicDir = ensureMusicDir();
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const filePath = path.join(musicDir, filename);

    const cleanupPaths = [];
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);
      cleanupPaths.push(filePath);
      response.data.on('error', reject);
      writer.on('error', reject);
      writer.on('finish', resolve);
      response.data.pipe(writer);
    }).catch(error => {
      cleanupPaths.forEach(p => safeUnlink(p));
      throw error;
    });

    const data = getData();
    if (!data.music) data.music = [];

    const musicId = uuidv4();
    const nameParts = splitJoinedMusicName(nameStr);
    const songName = sanitizeText(payload && payload.songName ? payload.songName : nameParts.songName).trim();
    const artist = sanitizeText(payload && payload.artist ? payload.artist : nameParts.artist).trim();
    const musicRecord = {
      id: musicId,
      name: nameStr,
      songName,
      artist,
      description: sanitizeText(payload && payload.description ? payload.description : ''),
      filename,
      originalname: `${nameStr}${ext}`,
      isSound: false,
      uploadDate: new Date().toISOString(),
      source: 'netease',
      sourceId: idStr,
      coverUrl: sanitizeText(payload && payload.coverUrl ? payload.coverUrl : '')
    };

    if (lyricText) {
      const lrcFilename = `${path.parse(filename).name}.lrc`;
      const lrcFilePath = path.join(baseDir, 'public', 'music', lrcFilename);
      try {
        fs.writeFileSync(lrcFilePath, lyricText, 'utf8');
        musicRecord.lrcFilename = lrcFilename;
      } catch (e) {
        console.error('保存歌词文件失败:', e);
      }
    }

    if (typeof updateData === 'function') {
      const result = updateData((latest) => {
        if (!latest.music) latest.music = [];
        // 并发下若已有同 sourceId 记录则复用
        const existing = latest.music.find(m => m && m.source === 'netease' && String(m.sourceId || '') === idStr);
        if (existing) {
          if (!existing.lrcFilename && musicRecord.lrcFilename) existing.lrcFilename = musicRecord.lrcFilename;
          return latest;
        }
        latest.music.push(musicRecord);
        return latest;
      });
      if (result && result.ok && result.data) {
        const saved = (result.data.music || []).find(m => m && m.source === 'netease' && String(m.sourceId || '') === idStr);
        if (saved) return saved;
      }
    } else {
      data.music.push(musicRecord);
      saveData(data);
    }

    return musicRecord;
  }

  app.post('/api/egg/login', (req, res) => {
    try {
      const username = String(req.body && req.body.username ? req.body.username : '').trim();
      const password = String(req.body && req.body.password ? req.body.password : '');
      const ip = getClientIp(req);
      const rateKey = `egg-login:${ip}:${username.toLowerCase()}`;
      const limited = eggLoginLimiter.check(rateKey);
      if (!limited.allowed) {
        res.status(429).json({ success: false, message: '登录尝试过多，请稍后再试' });
        return;
      }

      if (!username || !password) {
        res.status(400).json({ success: false, message: '请填写账号和密码' });
        return;
      }

      const data = getData();
      const user = data && Array.isArray(data.users)
        ? data.users.find(u => u && String(u.loginUsername || '').trim() === username)
        : null;

      if (!user || !user.loginPassword) {
        eggLoginLimiter.fail(rateKey);
        res.status(400).json({ success: false, message: '账号不存在或未开通' });
        return;
      }

      if (!verifyPassword(password, user.loginPassword)) {
        eggLoginLimiter.fail(rateKey);
        res.status(400).json({ success: false, message: '账号或密码错误' });
        return;
      }

      if (needsRehash(user.loginPassword)) {
        user.loginPassword = hashPassword(password);
        user.updatedAt = new Date().toISOString();
        saveData(data);
      }

      const respond = () => {
        req.session.eggUserId = user.id;
        eggLoginLimiter.success(rateKey);
        res.json({ success: true, user: sanitizeUserForResponse(user) });
      };

      if (req.session && typeof req.session.regenerate === 'function') {
        req.session.regenerate((err) => {
          if (err) {
            res.status(500).json({ success: false, message: '登录失败' });
            return;
          }
          respond();
        });
      } else {
        respond();
      }
    } catch (e) {
      res.status(500).json({ success: false, message: '登录失败' });
    }
  });

  app.post('/api/egg/logout', (req, res) => {
    try {
      if (req.session) {
        delete req.session.eggUserId;
      }
    } catch (e) {}
    res.json({ success: true });
  });

  app.get('/api/egg/me', (req, res) => {
    const user = getEggUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const data = getData();
    const music = (data && Array.isArray(data.music) && user.musicId)
      ? data.music.find(m => m && m.id === user.musicId)
      : null;

    res.json({
      success: true,
      user: {
        ...sanitizeUserForResponse(user),
        musicName: music ? music.name : ''
      }
    });
  });

  app.get('/api/egg/music', (req, res) => {
    const user = getEggUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const data = getData();
    const list = (data && Array.isArray(data.music)) ? data.music : [];

    const withIndex = list.map((m, idx) => ({ m, idx }));
    withIndex.sort((a, b) => {
      const ta = Date.parse(a.m && a.m.uploadDate ? a.m.uploadDate : '') || 0;
      const tb = Date.parse(b.m && b.m.uploadDate ? b.m.uploadDate : '') || 0;
      if (ta !== tb) return tb - ta;
      return b.idx - a.idx;
    });

    const music = withIndex
      .map(x => x.m)
      .filter(m => m && !m.isSound)
      .map(m => ({
        id: m.id,
        name: m.name,
        filename: m.filename || '',
        coverUrl: m.coverUrl || '',
        lrcFilename: m.lrcFilename || ''
      }));

    res.json({ success: true, music });
  });

  app.post('/api/egg/set-broadcast-music', (req, res) => {
    const user = getEggUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const musicId = String(req.body && req.body.musicId ? req.body.musicId : '').trim();
    if (!musicId) {
      res.status(400).json({ success: false, message: '缺少音乐ID' });
      return;
    }

    const data = getData();
    const music = (data && Array.isArray(data.music)) ? data.music.find(m => m && m.id === musicId) : null;
    if (!music || music.isSound) {
      res.status(400).json({ success: false, message: '音乐不存在' });
      return;
    }

    const target = data && Array.isArray(data.users) ? data.users.find(u => u && u.id === user.id) : null;
    if (!target) {
      res.status(404).json({ success: false, message: '未找到用户' });
      return;
    }

    target.musicId = music.id;
    target.updatedAt = new Date().toISOString();
    saveData(data);

    res.json({
      success: true,
      message: '已设为播报音乐',
      music: {
        id: music.id,
        name: music.name,
        filename: music.filename || ''
      }
    });
  });

  app.post('/api/egg/change-password', (req, res) => {
    const user = getEggUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const currentPassword = String(req.body && req.body.currentPassword ? req.body.currentPassword : '');
    const newPassword = String(req.body && req.body.newPassword ? req.body.newPassword : '');

    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, message: '请提供当前密码和新密码' });
      return;
    }

    if (!verifyPassword(currentPassword, user.loginPassword || '')) {
      res.status(400).json({ success: false, message: '当前密码不正确' });
      return;
    }

    if (String(newPassword).length < 6) {
      res.status(400).json({ success: false, message: '新密码至少 6 位' });
      return;
    }

    const data = getData();
    const target = data && Array.isArray(data.users) ? data.users.find(u => u && u.id === user.id) : null;
    if (!target) {
      res.status(404).json({ success: false, message: '未找到用户' });
      return;
    }

    target.loginPassword = hashPassword(newPassword);
    target.updatedAt = new Date().toISOString();
    saveData(data);

    res.json({ success: true, message: '密码修改成功' });
  });

  app.post('/api/egg/set-broadcast-from-netease', async (req, res) => {
    try {
      const user = getEggUser(req);
      if (!user) {
        res.status(401).json({ success: false, message: '未登录' });
        return;
      }

      const neteaseId = String(req.body && (req.body.neteaseId || req.body.id) ? (req.body.neteaseId || req.body.id) : '').trim();
      const rawName = sanitizeText(req.body && req.body.name ? req.body.name : '').trim();
      const artists = sanitizeText(req.body && req.body.artists ? req.body.artists : '').trim();
      const coverUrl = sanitizeText(req.body && req.body.coverUrl ? req.body.coverUrl : '').trim();

      const joinedName = sanitizeFilename(rawName && artists ? `${rawName}-${artists}` : (rawName || artists || ''));
      if (!neteaseId) {
        res.status(400).json({ success: false, message: '缺少歌曲ID' });
        return;
      }
      if (!joinedName) {
        res.status(400).json({ success: false, message: '缺少歌曲名称' });
        return;
      }

      const musicRecord = await importNeteaseToLocal({
        neteaseId,
        name: joinedName,
        songName: rawName,
        artist: artists,
        description: 'egg-music',
        coverUrl
      });

      const data = getData();
      const target = data && Array.isArray(data.users) ? data.users.find(u => u && u.id === user.id) : null;
      if (!target) {
        res.status(404).json({ success: false, message: '未找到用户' });
        return;
      }

      target.musicId = musicRecord.id;
      target.updatedAt = new Date().toISOString();
      saveData(data);

      res.json({
        success: true,
        message: '已设为播报音乐',
        music: {
          id: musicRecord.id,
          name: musicRecord.name,
          filename: musicRecord.filename
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err && err.message ? err.message : '设置失败' });
    }
  });
}

module.exports = {
  registerEggRoutes
};
