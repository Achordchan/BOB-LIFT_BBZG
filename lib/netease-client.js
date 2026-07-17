const axios = require('axios');
const path = require('path');

function createNeteaseClient(options = {}) {
  const baseUrl = options.baseUrl || process.env.BBZG_MUSIC_API_BASE || 'http://127.0.0.1:5000';
  const timeoutMs = Number.parseInt(String(options.timeoutMs || process.env.BBZG_MUSIC_API_TIMEOUT_MS || '12000'), 10);

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

  function extractLyricPayload(payload) {
    if (payload == null) return { lyric: '', tLyric: '' };
    const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
    const getLyric = (obj) => {
      if (!obj) return '';
      if (typeof obj === 'string') return String(obj).trim();
      if (typeof obj !== 'object') return '';
      return typeof obj.lyric === 'string' ? String(obj.lyric).trim() : '';
    };
    return {
      lyric: getLyric(data.lrc),
      tLyric: getLyric(data.tlyric)
    };
  }

  async function requestNeteaseSongApi(neteaseId, requestType) {
    const reqData = { id: String(neteaseId), type: requestType };
    const attempts = [
      () => axios.post(`${baseUrl}/song`, reqData, {
        timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json' }
      }),
      () => axios.get(`${baseUrl}/song`, {
        timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json' },
        params: reqData
      })
    ];

    let lastError = null;
    for (const attempt of attempts) {
      try {
        const resp = await attempt();
        return resp && resp.data ? resp.data : null;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    throw new Error('音乐 API 请求失败');
  }

  async function fetchNeteaseLyric(neteaseId) {
    const payload = await requestNeteaseSongApi(neteaseId, 'lyric');
    if (payload && payload.success === false) {
      throw new Error((payload && payload.message) ? payload.message : '获取歌词失败');
    }
    const result = extractLyricPayload(payload);
    return result.lyric || result.tLyric ? result : { lyric: '', tLyric: '' };
  }

  async function resolveNeteasePlayableUrl(neteaseId) {
    async function requestLevel(level) {
      const resp = await axios.post(`${baseUrl}/song`, {
        id: String(neteaseId),
        level,
        type: 'url'
      }, {
        timeout: Math.max(timeoutMs, 15000),
        headers: { 'Content-Type': 'application/json' }
      });
      const payload = resp && resp.data;
      if (!payload || payload.success === false) {
        throw new Error((payload && payload.message) ? payload.message : '获取播放链接失败');
      }
      const data = payload && payload.data ? payload.data : null;
      const url = (data && typeof data.url === 'string')
        ? data.url
        : (data && data.data && Array.isArray(data.data) && data.data[0] && typeof data.data[0].url === 'string')
          ? data.data[0].url
          : '';
      return String(url || '').trim();
    }

    const exhigh = await requestLevel('exhigh').catch(() => '');
    if (exhigh) return exhigh;
    const standard = await requestLevel('standard');
    if (!standard) throw new Error('获取播放链接失败');
    return standard;
  }

  return {
    baseUrl,
    timeoutMs,
    guessExtByUrl,
    guessExtByContentType,
    extractLyricPayload,
    requestNeteaseSongApi,
    fetchNeteaseLyric,
    resolveNeteasePlayableUrl
  };
}

module.exports = {
  createNeteaseClient
};
