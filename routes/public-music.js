const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

function registerPublicMusicRoutes(app) {
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

  function clampInt(n, fallback, min, max) {
    const v = Number.parseInt(String(n), 10);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
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
      const pathname = u.pathname || '';
      const dot = pathname.lastIndexOf('.');
      if (dot >= 0) {
        const ext = pathname.slice(dot).toLowerCase();
        if (ext && ext.length <= 8) return ext;
      }
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

  function ensureCacheDir() {
    const dir = path.join(process.cwd(), '.bbzg-cache', 'egg-music');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function safeUnlink(filePath) {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }

  function parseRangeHeader(rangeHeader) {
    const raw = String(rangeHeader || '').trim();
    if (!raw) return null;
    const m = raw.match(/^bytes=(\d*)-(\d*)$/);
    if (!m) return null;
    const startStr = m[1];
    const endStr = m[2];
    const start = startStr === '' ? null : Number(startStr);
    const end = endStr === '' ? null : Number(endStr);
    if ((start != null && !Number.isFinite(start)) || (end != null && !Number.isFinite(end))) return null;
    return { start, end };
  }

  const rateBucket = new Map();
  function rateLimit(req, key, limit, windowMs) {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString();
    const now = Date.now();
    const bucketKey = `${ip}:${key}`;
    const existing = rateBucket.get(bucketKey);

    if (!existing || now - existing.start >= windowMs) {
      rateBucket.set(bucketKey, { start: now, count: 1 });
      return true;
    }

    existing.count += 1;
    if (existing.count > limit) return false;
    return true;
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

  function pickHeader(headers, key) {
    if (!headers) return '';
    const v = headers[key.toLowerCase()];
    return (v == null) ? '' : String(v);
  }

  function setIf(res, name, value) {
    const v = (value == null) ? '' : String(value);
    if (!v) return;
    try { res.setHeader(name, v); } catch (e) {}
  }

  const metaCache = new Map();
  const META_TTL_MS = 10 * 60 * 1000;

  const fileCache = new Map();
  const FILE_TTL_MS = 30 * 60 * 1000;

  function parseContentRangeTotal(contentRange) {
    const cr = String(contentRange || '');
    const m = cr.match(/\/(\d+)\s*$/);
    if (!m) return null;
    const total = Number(m[1]);
    return Number.isFinite(total) && total > 0 ? total : null;
  }

  async function fetchStreamMeta(playableUrl) {
    const cacheKey = String(playableUrl || '');
    const cached = metaCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached;

    const upstream = await withInsecureTls(() => axios.get(playableUrl, {
      responseType: 'stream',
      timeout: 15000,
      maxRedirects: 5,
      httpsAgent: insecureHttpsAgent,
      headers: {
        'User-Agent': 'bbzg-egg-music',
        Range: 'bytes=0-0'
      },
      validateStatus: () => true
    }));

    const status = upstream ? upstream.status : 0;
    const headers = upstream && upstream.headers ? upstream.headers : {};
    const contentType = pickHeader(headers, 'content-type');
    const contentRange = pickHeader(headers, 'content-range');
    const contentLength = pickHeader(headers, 'content-length');

    const totalBytes = parseContentRangeTotal(contentRange) || (Number(contentLength) || null);

    try {
      if (upstream && upstream.data && typeof upstream.data.destroy === 'function') {
        upstream.data.destroy();
      }
    } catch (e) {}

    const meta = {
      totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : null,
      contentType: contentType || '',
      expiresAt: now + META_TTL_MS
    };
    metaCache.set(cacheKey, meta);
    return meta;
  }

  function getCachedFileById(id) {
    const key = String(id || '');
    const now = Date.now();
    const cached = fileCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= now) {
      fileCache.delete(key);
      if (cached.filePath) safeUnlink(cached.filePath);
      return null;
    }
    if (cached.filePath && !fs.existsSync(cached.filePath)) {
      fileCache.delete(key);
      return null;
    }
    return cached;
  }

  async function downloadToCache(id, playableUrl) {
    const cacheDir = ensureCacheDir();

    const probeMeta = await fetchStreamMeta(playableUrl).catch(() => null);

    const resp = await withInsecureTls(() => axios.get(playableUrl, {
      responseType: 'stream',
      timeout: 0,
      maxRedirects: 5,
      httpsAgent: insecureHttpsAgent,
      headers: {
        'User-Agent': 'bbzg-egg-music'
      },
      validateStatus: () => true
    }));

    if (!resp || resp.status >= 400) {
      throw new Error('下载缓存失败');
    }

    const headers = resp.headers || {};
    const contentType = pickHeader(headers, 'content-type') || (probeMeta && probeMeta.contentType ? probeMeta.contentType : '');

    let ext = guessExtByUrl(playableUrl);
    if (!ext) ext = guessExtByContentType(contentType);
    if (!ext) ext = '.mp3';

    const filePath = path.join(cacheDir, `netease-${String(id)}${ext}`);
    const writer = fs.createWriteStream(filePath);

    await new Promise((resolve, reject) => {
      resp.data.on('error', reject);
      writer.on('error', reject);
      writer.on('finish', resolve);
      resp.data.pipe(writer);
    });

    const stat = fs.statSync(filePath);
    const record = {
      filePath,
      size: stat && stat.size ? stat.size : null,
      contentType: contentType || 'audio/mpeg',
      expiresAt: Date.now() + FILE_TTL_MS
    };
    fileCache.set(String(id), record);
    return record;
  }

  function serveFileRange(res, record, rangeHeader) {
    const size = record && record.size ? Number(record.size) : 0;
    if (!size || !Number.isFinite(size) || size <= 0) {
      res.status(500).end();
      return;
    }

    const r = parseRangeHeader(rangeHeader);
    if (!r) {
      res.status(200);
      setIf(res, 'Content-Type', record.contentType || 'audio/mpeg');
      setIf(res, 'Content-Length', String(size));
      setIf(res, 'Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(record.filePath).pipe(res);
      return;
    }

    let start = r.start;
    let end = r.end;
    if (start == null && end != null) {
      const suffix = Math.max(0, Math.min(size, end));
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      if (start == null) start = 0;
      if (end == null || end >= size) end = size - 1;
    }

    if (start < 0 || end < start || start >= size) {
      res.status(416);
      setIf(res, 'Content-Range', `bytes */${size}`);
      res.end();
      return;
    }

    const chunkSize = (end - start) + 1;

    res.status(206);
    setIf(res, 'Content-Type', record.contentType || 'audio/mpeg');
    setIf(res, 'Accept-Ranges', 'bytes');
    setIf(res, 'Content-Range', `bytes ${start}-${end}/${size}`);
    setIf(res, 'Content-Length', String(chunkSize));
    res.setHeader('Cache-Control', 'no-store');

    fs.createReadStream(record.filePath, { start, end }).pipe(res);
  }

  app.get('/api/public/music/search', async (req, res) => {
    try {
      const keywords = String(req.query.keywords || '').trim();
      if (!keywords) {
        res.status(400).json({ success: false, message: '缺少 keywords' });
        return;
      }

      const page = clampInt(req.query.page, 1, 1, 200);
      const limit = clampInt(req.query.limit, 10, 1, 20);

      const resp = await withInsecureTls(() => axios.post('https://wyapi-1.toubiec.cn/api/music/search', {
        keywords,
        page,
        limit,
        pageSize: limit
      }, {
        timeout: 15000,
        httpsAgent: insecureHttpsAgent,
        headers: { 'Content-Type': 'application/json' }
      }));

      const data = resp && resp.data;
      if (!data || data.code !== 200 || !data.data || !Array.isArray(data.data.songs)) {
        throw new Error((data && data.msg) ? data.msg : '搜索失败');
      }

      const total = (data.data && typeof data.data.total === 'number') ? data.data.total : 0;

      const songs = data.data.songs.map(song => {
        const albumObj = song.album || song.al || null;
        const picUrl = (song.picUrl || (albumObj && albumObj.picUrl)) || '';

        const artists = Array.isArray(song.ar)
          ? song.ar.map(a => a && a.name ? a.name : '').filter(Boolean).join(' / ')
          : (song.artists || (Array.isArray(song.artists) ? song.artists.join(' / ') : ''));

        const album = (albumObj && (albumObj.name || albumObj.album)) ? (albumObj.name || albumObj.album) : (song.album || '');

        return {
          id: song.id,
          name: song.name,
          picUrl,
          artists,
          album
        };
      });

      res.json({
        success: true,
        page,
        limit,
        total,
        songs
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err && err.message ? err.message : '搜索失败' });
    }
  });

  app.get('/api/public/music/stream', async (req, res) => {
    try {
      if (!rateLimit(req, 'stream', 60, 60 * 1000)) {
        res.status(429).json({ success: false, message: '请求过于频繁' });
        return;
      }

      const id = String(req.query.id || '').trim();
      if (!/^\d+$/.test(id)) {
        res.status(400).json({ success: false, message: '无效的 id' });
        return;
      }

      const playableUrl = await resolveNeteasePlayableUrl(id);
      if (!playableUrl) {
        res.status(500).json({ success: false, message: '获取播放链接失败' });
        return;
      }

      const range = req.headers.range ? String(req.headers.range) : '';
      if (range) {
        console.log(`[egg-music] Range request: ${range}`);
      }

      const cached = getCachedFileById(id);
      if (cached) {
        serveFileRange(res, cached, range);
        return;
      }

      const meta = await fetchStreamMeta(playableUrl).catch(() => null);
      const reqHeaders = {
        'User-Agent': 'bbzg-egg-music'
      };
      if (range) reqHeaders.Range = range;

      const upstream = await withInsecureTls(() => axios.get(playableUrl, {
        responseType: 'stream',
        timeout: 0,
        maxRedirects: 5,
        httpsAgent: insecureHttpsAgent,
        headers: reqHeaders,
        validateStatus: () => true
      }));

      const status = upstream ? upstream.status : 0;
      if (!status) throw new Error('上游响应异常');

      const headers = upstream.headers || {};
      const contentType = pickHeader(headers, 'content-type');
      const contentLength = pickHeader(headers, 'content-length');
      const acceptRanges = pickHeader(headers, 'accept-ranges');
      const contentRange = pickHeader(headers, 'content-range');

      const metaTotal = meta && meta.totalBytes ? Number(meta.totalBytes) : null;

      // 如果无法获得总长度（duration 会是 NaN），就强制落盘缓存再从本地提供，保证可拖动。
      if (!range && !contentLength && !contentRange && !metaTotal) {
        upstream.data.on('error', () => {});
        try { upstream.data.destroy(); } catch (e) {}

        const record = await downloadToCache(id, playableUrl);
        serveFileRange(res, record, '');
        return;
      }

      res.status(status);
      setIf(res, 'Content-Type', contentType || (meta && meta.contentType ? meta.contentType : ''));

      if (contentLength) {
        setIf(res, 'Content-Length', contentLength);
      } else if (!range && meta && meta.totalBytes) {
        setIf(res, 'Content-Length', String(meta.totalBytes));
      }

      setIf(res, 'Accept-Ranges', acceptRanges || 'bytes');
      setIf(res, 'Content-Range', contentRange);
      res.setHeader('Cache-Control', 'no-store');

      if (status >= 400) {
        try { res.end(); } catch (e) {}
        return;
      }

      if (range && status !== 206 && !contentRange) {
        upstream.data.on('error', () => {});
        try { upstream.data.destroy(); } catch (e) {}

        const record = await downloadToCache(id, playableUrl);
        serveFileRange(res, record, range);
        return;
      }

      upstream.data.on('error', () => {
        try { res.end(); } catch (e) {}
      });

      upstream.data.pipe(res);
    } catch (err) {
      try {
        res.status(500).json({ success: false, message: err && err.message ? err.message : '试听失败' });
      } catch (e) {}
    }
  });

  app.head('/api/public/music/stream', async (req, res) => {
    try {
      if (!rateLimit(req, 'stream', 60, 60 * 1000)) {
        res.status(429).end();
        return;
      }

      const id = String(req.query.id || '').trim();
      if (!/^\d+$/.test(id)) {
        res.status(400).end();
        return;
      }

      const playableUrl = await resolveNeteasePlayableUrl(id);
      if (!playableUrl) {
        res.status(500).end();
        return;
      }

      const cached = getCachedFileById(id);
      if (cached) {
        setIf(res, 'Content-Type', cached.contentType || 'audio/mpeg');
        if (cached.size) setIf(res, 'Content-Length', String(cached.size));
        setIf(res, 'Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).end();
        return;
      }

      const meta = await fetchStreamMeta(playableUrl).catch(() => null);
      setIf(res, 'Content-Type', meta && meta.contentType ? meta.contentType : 'audio/mpeg');
      if (meta && meta.totalBytes) setIf(res, 'Content-Length', String(meta.totalBytes));
      setIf(res, 'Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).end();
    } catch (err) {
      try { res.status(500).end(); } catch (e) {}
    }
  });

  app.get('/api/public/music/download', async (req, res) => {
    try {
      if (!rateLimit(req, 'download', 20, 60 * 1000)) {
        res.status(429).json({ success: false, message: '请求过于频繁' });
        return;
      }

      const id = String(req.query.id || '').trim();
      if (!/^\d+$/.test(id)) {
        res.status(400).json({ success: false, message: '无效的 id' });
        return;
      }

      const preferredName = sanitizeFilename(req.query.name);

      const playableUrl = await resolveNeteasePlayableUrl(id);
      if (!playableUrl) {
        res.status(500).json({ success: false, message: '获取播放链接失败' });
        return;
      }

      const upstream = await withInsecureTls(() => axios.get(playableUrl, {
        responseType: 'stream',
        timeout: 0,
        maxRedirects: 5,
        httpsAgent: insecureHttpsAgent,
        headers: {
          'User-Agent': 'bbzg-egg-music'
        }
      }));

      const contentType = upstream && upstream.headers ? upstream.headers['content-type'] : '';
      const contentLength = upstream && upstream.headers ? upstream.headers['content-length'] : '';

      let ext = guessExtByUrl(playableUrl);
      if (!ext) ext = guessExtByContentType(contentType);
      if (!ext) ext = '.mp3';

      const filenameBase = preferredName || `netease-${id}`;
      const filename = `${filenameBase}${ext}`;

      if (contentType) res.setHeader('Content-Type', contentType);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader('Cache-Control', 'no-store');

      upstream.data.on('error', () => {
        try { res.end(); } catch (e) {}
      });

      upstream.data.pipe(res);
    } catch (err) {
      try {
        res.status(500).json({ success: false, message: err && err.message ? err.message : '下载失败' });
      } catch (e) {}
    }
  });
}

module.exports = {
  registerPublicMusicRoutes
};
