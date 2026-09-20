function isReadOnlyCoverEndpoint(url, pathname) {
  if (pathname === '/api/public/music/cover') return /^\d+$/.test(url.searchParams.get('id') || '');
  if (pathname === '/api/public/music/local-cover') {
    const target = url.searchParams.get('path') || '';
    return target.startsWith('/') && !target.startsWith('//') && !/[\\\u0000-\u001f]/.test(target);
  }
  if (pathname === '/api/public/music/cover-image') {
    try {
      const target = new URL(url.searchParams.get('url'));
      return ['http:', 'https:'].includes(target.protocol) && !target.username && !target.password;
    } catch (_) { return false; }
  }
  if (pathname !== '/api/public/music/bilibili/image') return false;
  try {
    const target = new URL(url.searchParams.get('url'));
    return ['http:', 'https:'].includes(target.protocol) && !target.username && !target.password
      && (!target.port || ['80', '443'].includes(target.port))
      && (target.hostname === 'hdslb.com' || target.hostname.endsWith('.hdslb.com'));
  } catch (_) { return false; }
}

function normalizeMusicCover(value, localHostname = '') {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || /[\\\u0000-\u001f\u007f]/.test(raw)) return '';
  try {
    const relative = !raw.startsWith('//') && !/^[a-z][a-z0-9+.-]*:/i.test(raw);
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw, 'https://cover-resource.invalid/');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase();
    const readOnly = isReadOnlyCoverEndpoint(url, pathname);
    // 管理员图片请求携带会话，不能让员工把封面配置成 GET 业务写接口。
    if (relative || url.hostname === String(localHostname).toLowerCase()) {
      if (/^\/(?:api|admin|login|logout)(?:\/|$)/.test(pathname) && !readOnly) return '';
      return url.pathname + url.search;
    }
    // 绝对地址也可能指向本站，禁止用完整域名绕过本地 API 限制。
    if (/^\/api(?:\/|$)/.test(pathname)) return readOnly ? url.toString() : '';
    if (/^\/(?:logout|login|admin)(?:\/|$)/.test(pathname)) return '';
    if (url.hostname.endsWith('.music.126.net')) {
      url.protocol = 'https:';
      return url.toString();
    }
    if (url.hostname === 'hdslb.com' || url.hostname.endsWith('.hdslb.com')) {
      url.protocol = 'https:';
      return `/api/public/music/bilibili/image?${new URLSearchParams({ url: url.toString() })}`;
    }
    return url.toString();
  } catch (_) {}
  return '';
}

function musicCoverUrl(record, localHostname = '') {
  const stored = normalizeMusicCover(record?.coverUrl, localHostname);
  if (stored) return displayMusicCover(stored, localHostname);
  if (record?.source === 'netease' && /^\d+$/.test(String(record.sourceId || ''))) {
    return `/api/public/music/cover?id=${encodeURIComponent(record.sourceId)}`;
  }
  return '';
}

function displayMusicCover(value, localHostname = '') {
  const normalized = normalizeMusicCover(value, localHostname);
  if (!normalized) return '';
  if (/^https?:\/\//.test(normalized)) return `/api/public/music/cover-image?${new URLSearchParams({ url: normalized })}`;
  const url = new URL(normalized, 'https://cover-resource.invalid/');
  if (isReadOnlyCoverEndpoint(url, decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase())) return normalized;
  return `/api/public/music/local-cover?${new URLSearchParams({ path: url.pathname, ...(url.search ? { v: url.search } : {}) })}`;
}

module.exports = { normalizeMusicCover, musicCoverUrl, displayMusicCover };
