function createTtlMap(options = {}) {
  const defaultTtlMs = Number(options.defaultTtlMs) > 0 ? Number(options.defaultTtlMs) : 5 * 60 * 1000;
  const maxSize = Number(options.maxSize) > 0 ? Number(options.maxSize) : 200;
  const onEvict = typeof options.onEvict === 'function' ? options.onEvict : null;
  const map = new Map();

  function now() {
    return Date.now();
  }

  function isExpired(entry, ts = now()) {
    return !entry || entry.expiresAt <= ts;
  }

  function purgeExpired() {
    const ts = now();
    for (const [key, entry] of map.entries()) {
      if (isExpired(entry, ts)) {
        map.delete(key);
        if (onEvict) onEvict(key, entry.value);
      }
    }
  }

  function enforceSize() {
    while (map.size > maxSize) {
      const first = map.keys().next().value;
      if (first == null) break;
      const entry = map.get(first);
      map.delete(first);
      if (onEvict && entry) onEvict(first, entry.value);
    }
  }

  function set(key, value, ttlMs = defaultTtlMs) {
    purgeExpired();
    map.set(String(key), {
      value,
      expiresAt: now() + (Number(ttlMs) > 0 ? Number(ttlMs) : defaultTtlMs)
    });
    enforceSize();
    return value;
  }

  function get(key) {
    purgeExpired();
    const entry = map.get(String(key));
    if (!entry) return undefined;
    if (isExpired(entry)) {
      map.delete(String(key));
      if (onEvict) onEvict(String(key), entry.value);
      return undefined;
    }
    // refresh recency for LRU-ish behavior
    map.delete(String(key));
    map.set(String(key), entry);
    return entry.value;
  }

  function del(key) {
    const entry = map.get(String(key));
    if (!entry) return false;
    map.delete(String(key));
    if (onEvict) onEvict(String(key), entry.value);
    return true;
  }

  function size() {
    purgeExpired();
    return map.size;
  }

  function clear() {
    if (onEvict) {
      for (const [key, entry] of map.entries()) onEvict(key, entry.value);
    }
    map.clear();
  }

  const timer = setInterval(purgeExpired, Math.min(defaultTtlMs, 60_000));
  if (typeof timer.unref === 'function') timer.unref();

  return { set, get, delete: del, size, clear, purgeExpired };
}

module.exports = {
  createTtlMap
};
