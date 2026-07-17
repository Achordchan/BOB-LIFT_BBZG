const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createNeteaseClient } = require('../lib/netease-client');
const { getClientIp } = require('../lib/request-ip');
const { createTtlMap } = require('../lib/ttl-map');
const { createRateLimiter, createConcurrencyGate } = require('../lib/rate-limit');

function purgeEggMusicCache(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const dir = path.join(process.cwd(), '.bbzg-cache', 'egg-music');
  try {
    if (!fs.existsSync(dir)) return;
    const now = Date.now();
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (st.isFile() && now - st.mtimeMs > maxAgeMs) fs.unlinkSync(full);
      } catch (_) {}
    }
  } catch (_) {}
}

function registerPublicMusicRoutes(app) {
  try { purgeEggMusicCache(); } catch (_) {}

  const netease = createNeteaseClient();
  const downloadGate = createConcurrencyGate(Number(process.env.BBZG_MUSIC_DOWNLOAD_CONCURRENCY || 2));
  const MAX_DOWNLOAD_BYTES = Number(process.env.BBZG_MUSIC_MAX_DOWNLOAD_BYTES || 30 * 1024 * 1024);
  const DOWNLOAD_TIMEOUT_MS = Number(process.env.BBZG_MUSIC_DOWNLOAD_TIMEOUT_MS || 30000);


  const NETEASE_API_BASE = process.env.BBZG_MUSIC_API_BASE || 'http://127.0.0.1:5000';
  const SEARCH_TIMEOUT_MS = Number.parseInt(process.env.BBZG_MUSIC_SEARCH_TIMEOUT_MS || '6000', 10);
  const guessExtByUrl = netease.guessExtByUrl;
  const guessExtByContentType = netease.guessExtByContentType;
  const extractLyricPayload = netease.extractLyricPayload;
  const requestNeteaseSongApi = netease.requestNeteaseSongApi;
  const fetchNeteaseLyric = netease.fetchNeteaseLyric;
  const resolveNeteasePlayableUrl = netease.resolveNeteasePlayableUrl;


  function clampInt(n, fallback, min, max) {
    const v = Number.parseInt(String(n), 10);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
  }


  function isTimeoutError(error) {
    if (!error) return false;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return true;
    return /timeout|timed out/i.test(String(error.message || ''));
  }

  function isConnectionError(error) {
    if (!error) return false;
    const code = String(error.code || '');
    if (['ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) return true;
    return /socket hang up|network error/i.test(String(error.message || ''));
  }

  function searchTimeout() {
    return Number.isFinite(SEARCH_TIMEOUT_MS) && SEARCH_TIMEOUT_MS > 0 ? SEARCH_TIMEOUT_MS : 6000;
  }

  function assertSearchPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('上游返回异常：请检查音乐 API 地址/端口是否正确');
    }
    if (payload.success === false) {
      throw new Error(payload.message ? String(payload.message) : '搜索失败');
    }
    return payload;
  }

  async function requestSearchByPost(searchPayload) {
    const resp = await axios.post(`${NETEASE_API_BASE}/search`, { ...searchPayload }, {
      timeout: searchTimeout(),
      headers: { 'Content-Type': 'application/json' }
    });
    return assertSearchPayload(resp && resp.data);
  }

  async function requestSearchByGet(searchPayload) {
    const qs = new URLSearchParams({
      keywords: searchPayload.keywords,
      keyword: searchPayload.keyword,
      limit: String(searchPayload.limit),
      offset: String(searchPayload.offset),
      page: String(searchPayload.page),
      pageNo: String(searchPayload.pageNo),
      pageSize: String(searchPayload.pageSize),
      type: String(searchPayload.type)
    });

    const resp = await axios.get(`${NETEASE_API_BASE}/search?${qs.toString()}`, {
      timeout: searchTimeout(),
      headers: { 'Content-Type': 'application/json' }
    });
    return assertSearchPayload(resp && resp.data);
  }

  async function searchMusicApi(searchPayload) {
    const errors = [];
    const tasks = [requestSearchByPost(searchPayload), requestSearchByGet(searchPayload)]
      .map(task => task.catch(error => {
        errors.push(error);
        throw error;
      }));

    try {
      return await Promise.any(tasks);
    } catch (error) {
      const allErrors = error && Array.isArray(error.errors) ? error.errors : errors;
      if (allErrors.some(errorItem => isTimeoutError(errorItem) || isConnectionError(errorItem))) {
        throw new Error(`音乐搜索服务暂时不可用，请检查 ${NETEASE_API_BASE} 是否可访问`);
      }
      const first = allErrors.find(Boolean) || error;
      throw new Error(first && first.message ? first.message : '音乐搜索服务暂时不可用');
    }
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

  const rateLimiters = new Map();
  function rateLimit(req, key, limit, windowMs) {
    const ip = getClientIp(req);
    const limiterKey = `${key}:${limit}:${windowMs}`;
    if (!rateLimiters.has(limiterKey)) {
      rateLimiters.set(limiterKey, createRateLimiter({ windowMs, max: limit, blockMs: windowMs }));
    }
    return rateLimiters.get(limiterKey).hit(`${ip}:${key}`).allowed;
  }



  function normalizeLyricPayload(payload) {
    const result = extractLyricPayload(payload);
    if (result.lyric) return result;
    if (result.tLyric) return { lyric: '', tLyric: result.tLyric };
    return { lyric: '', tLyric: '' };
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

  function extractSearchSongsAndTotal(payload) {
    const d = (payload && payload.data) ? payload.data : {};

    const pagination = (payload && payload.pagination && typeof payload.pagination === 'object')
      ? payload.pagination
      : null;

    if (Array.isArray(d)) {
      const total = (pagination && typeof pagination.total === 'number') ? pagination.total : null;
      return { rawSongs: d, total };
    }

    const rootResult = (payload && payload.result && typeof payload.result === 'object') ? payload.result : null;
    const dataResult = (d && d.result && typeof d.result === 'object') ? d.result : null;
    const result = dataResult || rootResult;

    const rawSongs = Array.isArray(d && d.songs)
      ? d.songs
      : (d && d.data && Array.isArray(d.data.songs))
        ? d.data.songs
        : (result && Array.isArray(result.songs))
          ? result.songs
          : (result && result.data && Array.isArray(result.data.songs))
            ? result.data.songs
            : [];

    const total = (d && typeof d.total === 'number')
      ? d.total
      : (result && typeof result.songCount === 'number')
        ? result.songCount
        : (result && typeof result.total === 'number')
          ? result.total
          : (result && result.data && typeof result.data.songCount === 'number')
            ? result.data.songCount
            : 0;

    const paginationTotal = (pagination && typeof pagination.total === 'number') ? pagination.total : null;
    return { rawSongs, total: (paginationTotal != null ? paginationTotal : total) };
  }

  const META_TTL_MS = 10 * 60 * 1000;
  const FILE_TTL_MS = 30 * 60 * 1000;
  const metaCache = createTtlMap({ defaultTtlMs: META_TTL_MS, maxSize: 300 });
  const fileCache = createTtlMap({
    defaultTtlMs: FILE_TTL_MS,
    maxSize: 80,
    onEvict: (_key, value) => {
      if (value && value.filePath) safeUnlink(value.filePath);
    }
  });

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
    if (cached) return cached;

    const upstream = await axios.get(playableUrl, {
      responseType: 'stream',
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'bbzg-egg-music',
        Range: 'bytes=0-0'
      },
      validateStatus: () => true
    });

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
      contentType: contentType || ''
    };
    metaCache.set(cacheKey, meta, META_TTL_MS);
    return meta;
  }

  function getCachedFileById(id) {
    const key = String(id || '');
    const cached = fileCache.get(key);
    if (!cached) return null;
    if (cached.filePath && !fs.existsSync(cached.filePath)) {
      fileCache.delete(key);
      return null;
    }
    return cached;
  }

  async function downloadToCache(id, playableUrl) {
    return downloadGate.run(async () => {
      const cacheDir = ensureCacheDir();
      const probeMeta = await fetchStreamMeta(playableUrl).catch(() => null);
      if (probeMeta && probeMeta.totalBytes && probeMeta.totalBytes > MAX_DOWNLOAD_BYTES) {
        throw new Error(`音频文件过大（>${MAX_DOWNLOAD_BYTES} bytes）`);
      }

      const resp = await axios.get(playableUrl, {
        responseType: 'stream',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxRedirects: 5,
        maxContentLength: MAX_DOWNLOAD_BYTES,
        maxBodyLength: MAX_DOWNLOAD_BYTES,
        headers: {
          'User-Agent': 'bbzg-egg-music'
        },
        validateStatus: () => true
      });

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
      let received = 0;

      await new Promise((resolve, reject) => {
        const fail = (error) => {
          try { resp.data.destroy(); } catch (e) {}
          try { writer.destroy(); } catch (e) {}
          safeUnlink(filePath);
          reject(error);
        };
        resp.data.on('data', (chunk) => {
          received += chunk.length;
          if (received > MAX_DOWNLOAD_BYTES) {
            fail(new Error(`音频文件过大（>${MAX_DOWNLOAD_BYTES} bytes）`));
          }
        });
        resp.data.on('error', fail);
        writer.on('error', fail);
        writer.on('finish', resolve);
        resp.data.pipe(writer);
      });

      const stat = fs.statSync(filePath);
      const record = {
        filePath,
        size: stat && stat.size ? stat.size : null,
        contentType: contentType || 'audio/mpeg'
      };
      fileCache.set(String(id), record, FILE_TTL_MS);
      return record;
    });
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
      const limit = clampInt(req.query.limit, 10, 1, 50);

      const offset = (page - 1) * limit;

      const searchPayload = {
        keywords,
        keyword: keywords,
        limit,
        offset,
        page,
        pageNo: page,
        pageSize: limit,
        type: 1
      };

      const payload = await searchMusicApi(searchPayload);
      const extracted = extractSearchSongsAndTotal(payload);

      const rawSongs = extracted && Array.isArray(extracted.rawSongs) ? extracted.rawSongs : [];
      let total = (extracted && typeof extracted.total === 'number') ? extracted.total : null;

      // 上游没有 total 时：用“是否满页”来推断是否还有下一页
      if (!Number.isFinite(total) || total == null) {
        if (rawSongs.length >= limit) {
          total = (page * limit) + 1;
        } else {
          total = ((page - 1) * limit) + rawSongs.length;
        }
      }

      const songs = rawSongs.map(song => {
        const albumObj = song && (song.album || song.al) ? (song.album || song.al) : null;
        const picUrl = (song && song.picUrl) || (albumObj && albumObj.picUrl) || '';

        const artists = (song && Array.isArray(song.ar))
          ? song.ar.map(a => a && a.name ? a.name : '').filter(Boolean).join(' / ')
          : (song && Array.isArray(song.artists))
            ? song.artists.map(a => a && a.name ? a.name : '').filter(Boolean).join(' / ')
            : (song && typeof song.artists === 'string')
              ? song.artists
              : (song && typeof song.artist_string === 'string')
                ? song.artist_string
                : '';

        const album = (song && typeof song.album === 'string' && song.album)
          ? String(song.album)
          : (albumObj && albumObj.name)
            ? String(albumObj.name)
            : '';

        return {
          id: song && song.id != null ? song.id : '',
          name: song && song.name ? song.name : '',
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

  app.get('/api/public/music/lyric', async (req, res) => {
    try {
      const id = String(req.query.id || '').trim();
      if (!/^\d+$/.test(id)) {
        res.status(400).json({ success: false, message: '缺少/无效歌曲ID' });
        return;
      }

      const lyrics = await fetchNeteaseLyric(id);
      if (!lyrics || (!lyrics.lyric && !lyrics.tLyric)) {
        res.status(404).json({ success: false, message: '未找到歌词' });
        return;
      }

      res.json({
        success: true,
        id,
        lyric: lyrics.lyric,
        tLyric: lyrics.tLyric
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err && err.message ? err.message : '获取歌词失败' });
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

      const upstream = await axios.get(playableUrl, {
        responseType: 'stream',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxRedirects: 5,
        headers: reqHeaders,
        validateStatus: () => true
      });

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

      const upstream = await axios.get(playableUrl, {
        responseType: 'stream',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'bbzg-egg-music'
        }
      });

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
