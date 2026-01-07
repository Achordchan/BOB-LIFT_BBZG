const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');

function registerEggRoutes(app, deps) {
  const { getData, saveData, uuidv4, baseDir } = deps;

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
          return found;
        }
      }
    }

    const playableUrl = await resolveNeteasePlayableUrl(idStr);
    if (!playableUrl) throw new Error('获取播放链接失败');

    const response = await withInsecureTls(() => axios.get(playableUrl, {
      responseType: 'stream',
      timeout: 0,
      maxRedirects: 5,
      httpsAgent: insecureHttpsAgent,
      headers: {
        'User-Agent': 'bbzg-egg-import'
      }
    }));

    let ext = guessExtByUrl(playableUrl);
    if (!ext) ext = guessExtByContentType(response && response.headers ? response.headers['content-type'] : '');
    if (!ext) ext = '.mp3';

    const musicDir = ensureMusicDir();
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const filePath = path.join(musicDir, filename);

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);
      response.data.on('error', reject);
      writer.on('error', reject);
      writer.on('finish', resolve);
      response.data.pipe(writer);
    });

    const data = getData();
    if (!data.music) data.music = [];

    const musicId = uuidv4();
    const musicRecord = {
      id: musicId,
      name: nameStr,
      description: sanitizeText(payload && payload.description ? payload.description : ''),
      filename,
      originalname: `${nameStr}${ext}`,
      isSound: false,
      uploadDate: new Date().toISOString(),
      source: 'netease',
      sourceId: idStr,
      coverUrl: sanitizeText(payload && payload.coverUrl ? payload.coverUrl : '')
    };

    data.music.push(musicRecord);
    saveData(data);

    return musicRecord;
  }

  app.post('/api/egg/login', (req, res) => {
    try {
      const username = String(req.body && req.body.username ? req.body.username : '').trim();
      const password = String(req.body && req.body.password ? req.body.password : '');

      if (!username || !password) {
        res.status(400).json({ success: false, message: '请填写账号和密码' });
        return;
      }

      const data = getData();
      const user = data && Array.isArray(data.users)
        ? data.users.find(u => u && String(u.loginUsername || '').trim() === username)
        : null;

      if (!user || !user.loginPassword) {
        res.status(400).json({ success: false, message: '账号不存在或未开通' });
        return;
      }

      if (String(user.loginPassword) !== password) {
        res.status(400).json({ success: false, message: '账号或密码错误' });
        return;
      }

      req.session.eggUserId = user.id;
      res.json({ success: true, user: sanitizeUserForResponse(user) });
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
        coverUrl: m.coverUrl || ''
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

    if (String(user.loginPassword || '') !== currentPassword) {
      res.status(400).json({ success: false, message: '当前密码不正确' });
      return;
    }

    const data = getData();
    const target = data && Array.isArray(data.users) ? data.users.find(u => u && u.id === user.id) : null;
    if (!target) {
      res.status(404).json({ success: false, message: '未找到用户' });
      return;
    }

    target.loginPassword = newPassword;
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
