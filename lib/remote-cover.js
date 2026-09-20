const axios = require('axios');
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');
const ipaddr = require('ipaddr.js');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch (_) { return false; }
}

function validateRemoteCover(value, localHostname = '') {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || (url.port && !['80', '443'].includes(url.port))
      || hostname.toLowerCase() === localHostname.toLowerCase()
      || hostname === 'localhost' || hostname.endsWith('.localhost')
      || (net.isIP(hostname) && !isPublicAddress(hostname))) {
    throw new Error('不允许请求该封面地址');
  }
  return url;
}

function createPublicLookup(signal) {
  return (hostname, options, callback) => {
    const resolver = new dns.Resolver({ timeout: 2000, tries: 1 });
    const cancel = () => resolver.cancel();
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { cancel(); callback(new Error('封面请求已取消')); return; }
    Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]).then(results => {
      const addresses = results.flatMap((result, index) => result.status === 'fulfilled'
        ? result.value.map(address => ({ address, family: index === 0 ? 4 : 6 })) : []);
      if (signal.aborted || !addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
        callback(new Error('封面域名未解析到允许的公网地址'));
      } else {
        // 将已校验的 IP 直接交给连接，避免校验后再次 DNS 查询产生重绑定。
        const selected = addresses.find(item => !options.family || item.family === options.family) || addresses[0];
        if (options.all) callback(null, [selected]);
        else callback(null, selected.address, selected.family);
      }
    }).catch(() => callback(new Error('封面域名解析失败')))
      .finally(() => signal.removeEventListener('abort', cancel));
  };
}

async function proxyRemoteCover(req, res, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const close = () => controller.abort();
  res.once('close', close);
  const lookup = createPublicLookup(controller.signal);
  const httpAgent = new http.Agent({ lookup });
  const httpsAgent = new https.Agent({ lookup });
  const request = options.request || axios.get;
  let upstream;
  try {
    let target = String(req.query.url || '');
    for (let hop = 0; hop < 6; hop += 1) {
      const url = validateRemoteCover(target, req.hostname || '');
      upstream = await request(url.toString(), {
        responseType: 'stream', maxRedirects: 0, proxy: false,
        signal: controller.signal, httpAgent, httpsAgent,
        headers: { Accept: 'image/*', 'User-Agent': 'bbzg-cover-proxy' },
        validateStatus: () => true
      });
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        upstream.data.destroy();
        if (!upstream.headers.location) throw new Error('封面重定向地址缺失');
        target = new URL(upstream.headers.location, url).toString();
        continue;
      }
      const type = String(upstream.headers['content-type'] || '');
      const maxBytes = 5 * 1024 * 1024;
      if (upstream.status !== 200 || !/^image\//i.test(type)
          || Number(upstream.headers['content-length']) > maxBytes) throw new Error('封面响应不是有效图片');
      let received = 0;
      const limiter = new Transform({ transform(chunk, _encoding, callback) {
        received += chunk.length;
        callback(received > maxBytes ? new Error('封面图片超过大小限制') : null, chunk);
      } });
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      await pipeline(upstream.data, limiter, res, { signal: controller.signal });
      return;
    }
    throw new Error('封面重定向次数过多');
  } catch (_) {
    if (!res.destroyed && !res.headersSent) res.status(502).json({ success: false, message: '封面加载失败' });
    else res.destroy();
  } finally {
    clearTimeout(timeout);
    res.off('close', close);
    controller.abort();
    upstream?.data.destroy();
    httpAgent.destroy();
    httpsAgent.destroy();
  }
}

module.exports = { proxyRemoteCover, validateRemoteCover, isPublicAddress };
