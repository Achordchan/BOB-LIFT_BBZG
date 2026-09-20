const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { Readable } = require('stream');
const dns = require('dns').promises;
const { proxyRemoteCover, validateRemoteCover, isPublicAddress } = require('../lib/remote-cover');

test('远程封面拒绝内网、元数据、映射 IPv6 和本站主机', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '100.64.1.1', '198.18.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('93.184.216.34'), true);
  for (const url of ['http://127.0.0.1/a', 'http://2130706433/a', 'http://[::1]/a', 'https://user:pass@cdn.example/a', 'https://bbzg.example/api/inquiries/add']) {
    assert.throws(() => validateRemoteCover(url, 'bbzg.example'));
  }
});

async function fixture(t, request) {
  const app = express();
  let writes = 0;
  app.get('/image', (req, res) => proxyRemoteCover(req, res, { request }));
  app.get('/api/inquiries/add', (_req, res) => { writes += 1; res.send('unsafe'); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { base: `http://127.0.0.1:${server.address().port}`, writes: () => writes };
}

test('封面远程重定向不能携带管理员登录态请求本站写接口', async t => {
  let calls = 0;
  let base;
  const instance = await fixture(t, async (_url, options) => {
    calls += 1;
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.maxRedirects, 0);
    return { status: 302, headers: { location: `${base}/api/inquiries/add` }, data: Readable.from([]) };
  });
  base = instance.base;
  const response = await fetch(`${base}/image?url=https://attacker.example/image`, { headers: { Cookie: 'admin-test-session' } });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('location'), null);
  assert.equal(calls, 1);
  assert.equal(instance.writes(), 0);
});

test('代理校验 DNS 地址并固定已验证的公网 IP', async t => {
  const original = dns.Resolver;
  let privateAnswer = true;
  dns.Resolver = class {
    async resolve4() { return [privateAnswer ? '127.0.0.1' : '93.184.216.34']; }
    async resolve6() { return []; }
    cancel() {}
  };
  t.after(() => { dns.Resolver = original; });
  const { base } = await fixture(t, async (_url, options) => {
    const answer = await new Promise((resolve, reject) => options.httpsAgent.options.lookup('cdn.example', { all: true }, (error, value) => error ? reject(error) : resolve(value)));
    assert.deepEqual(answer, [{ address: '93.184.216.34', family: 4 }]);
    return { status: 200, headers: { 'content-type': 'image/png' }, data: Readable.from([Buffer.from('image-bytes')]) };
  });
  assert.equal((await fetch(`${base}/image?url=https://cdn.example/image`)).status, 502);
  privateAnswer = false;
  const response = await fetch(`${base}/image?url=https://cdn.example/image`);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('location'), null);
  assert.equal(await response.text(), 'image-bytes');
});
