function normalizeMusicCover(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw.startsWith('/api/public/music/bilibili/image?')) return raw;
  try {
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (url.hostname.endsWith('.music.126.net')) {
      url.protocol = 'https:';
      return url.toString();
    }
    if (url.hostname === 'hdslb.com' || url.hostname.endsWith('.hdslb.com')) {
      url.protocol = 'https:';
      return `/api/public/music/bilibili/image?${new URLSearchParams({ url: url.toString() })}`;
    }
  } catch (_) {}
  return '';
}

function musicCoverUrl(record) {
  const stored = normalizeMusicCover(record?.coverUrl);
  if (stored) return stored;
  if (record?.source === 'netease' && /^\d+$/.test(String(record.sourceId || ''))) {
    return `/api/public/music/cover?id=${encodeURIComponent(record.sourceId)}`;
  }
  return '';
}

module.exports = { normalizeMusicCover, musicCoverUrl };
