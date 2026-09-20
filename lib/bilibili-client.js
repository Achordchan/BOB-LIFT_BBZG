const axios = require('axios');
const fs = require('fs');
const path = require('path');

function parseBilibiliId(value) {
  const match = /^(BV[0-9A-Za-z]{10})(?::([1-9][0-9]{0,19}))?$/.exec(String(value || ''));
  if (!match) throw Object.assign(new Error('无效的哔哩哔哩音频 ID'), { status: 400 });
  return { bvid: match[1], ...(match[2] ? { cid: match[2] } : {}) };
}

function assertMp3Response(response) {
  if (!/^audio\/mpeg(?:;|$)/i.test(String(response.headers?.['content-type'] || ''))) {
    response.data?.destroy();
    throw new Error('音频服务未返回 MP3，请更新服务端转码程序');
  }
}

function createBilibiliClient(options = {}) {
  const baseURL = options.baseUrl || process.env.BBZG_BILIBILI_API_BASE || 'http://127.0.0.1:5001';
  function headers() {
    let token = process.env.BBZG_BILIBILI_API_TOKEN || '';
    if (!token) {
      try { token = fs.readFileSync(path.join(__dirname, '../storage/bilibili/api-token'), 'utf8').trim(); } catch (_) {}
    }
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  async function request(endpoint, params, method = 'GET', data) {
    try {
      const response = await axios({ baseURL, url: endpoint, params, method, data,
        headers: headers(), timeout: 60000, maxRedirects: 0, maxContentLength: 2 * 1024 * 1024 });
      if (!response.data || response.data.ok !== true) throw new Error('哔哩哔哩服务返回异常');
      return response.data;
    } catch (error) {
      if (error.status === 400) throw error;
      throw Object.assign(new Error(error.response?.data?.error || '哔哩哔哩音频服务不可用，请检查服务状态'), { status: 502 });
    }
  }
  async function resolve(id) {
    const result = await request('/api/audio', parseBilibiliId(id));
    const url = result.audio?.url;
    if (!url) throw new Error('该内容没有可用音轨');
    // 下载与试听均经过本地服务，Referer 和 CDN 校验由服务统一处理。
    const { bvid } = parseBilibiliId(id);
    return `${baseURL}/api/stream?${new URLSearchParams({ url, track: `${bvid}:${result.cid || ''}` })}`;
  }
  async function search(keyword, page) {
    const result = await request('/api/search', { keyword, page });
    if (!Array.isArray(result.items)) throw new Error('哔哩哔哩搜索返回异常');
    return result.items.map(item => ({
      id: item.bvid, name: item.title, artists: item.author, album: '哔哩哔哩',
      source: 'bilibili', duration: item.duration,
      picUrl: item.cover ? `/api/public/music/bilibili/image?${new URLSearchParams({ url: item.cover })}` : ''
    }));
  }
  async function stream(url, range) {
    return axios.get(url, { responseType: 'stream', timeout: 210000, maxRedirects: 0,
      headers: { ...headers(), ...(range ? { Range: range } : {}) }, validateStatus: () => true });
  }
  return { request, resolve, search, stream, headers,
    imageUrl: url => `${baseURL}/api/image?${new URLSearchParams({ url })}` };
}

module.exports = { createBilibiliClient, parseBilibiliId, assertMp3Response };
