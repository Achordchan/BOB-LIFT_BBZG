function createRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs) > 0 ? Number(options.windowMs) : 60_000;
  const max = Number(options.max) > 0 ? Number(options.max) : 10;
  const blockMs = Number(options.blockMs) >= 0 ? Number(options.blockMs) : windowMs;
  const buckets = new Map();

  function prune(now) {
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.blockedUntil && bucket.blockedUntil <= now && bucket.timestamps.length === 0) {
        buckets.delete(key);
        continue;
      }
      bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);
      if (!bucket.timestamps.length && (!bucket.blockedUntil || bucket.blockedUntil <= now)) {
        buckets.delete(key);
      }
    }
  }

  function getBucket(key) {
    if (!buckets.has(key)) {
      buckets.set(key, { timestamps: [], blockedUntil: 0, failures: 0 });
    }
    return buckets.get(key);
  }

  function check(key, now = Date.now()) {
    prune(now);
    const bucket = getBucket(key);
    if (bucket.blockedUntil && bucket.blockedUntil > now) {
      return {
        allowed: false,
        retryAfterMs: bucket.blockedUntil - now,
        remaining: 0
      };
    }
    bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);
    if (bucket.timestamps.length >= max) {
      bucket.blockedUntil = now + blockMs;
      return {
        allowed: false,
        retryAfterMs: blockMs,
        remaining: 0
      };
    }
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.max(0, max - bucket.timestamps.length)
    };
  }

  function hit(key, now = Date.now()) {
    const result = check(key, now);
    if (!result.allowed) return result;
    const bucket = getBucket(key);
    bucket.timestamps.push(now);
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.max(0, max - bucket.timestamps.length)
    };
  }

  function fail(key, now = Date.now()) {
    const bucket = getBucket(key);
    bucket.failures += 1;
    const result = hit(key, now);
    if (bucket.failures >= max) {
      bucket.blockedUntil = now + blockMs;
      return {
        allowed: false,
        retryAfterMs: blockMs,
        remaining: 0,
        failures: bucket.failures
      };
    }
    return { ...result, failures: bucket.failures };
  }

  function success(key) {
    const bucket = getBucket(key);
    bucket.failures = 0;
    bucket.blockedUntil = 0;
  }

  return { check, hit, fail, success };
}

function createConcurrencyGate(limit = 2) {
  const max = Number(limit) > 0 ? Number(limit) : 2;
  let active = 0;
  const queue = [];

  function runNext() {
    if (active >= max) return;
    const job = queue.shift();
    if (!job) return;
    active += 1;
    Promise.resolve()
      .then(job.fn)
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        runNext();
      });
  }

  function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      runNext();
    });
  }

  function stats() {
    return { active, queued: queue.length, max };
  }

  return { run, stats };
}

module.exports = {
  createRateLimiter,
  createConcurrencyGate
};
