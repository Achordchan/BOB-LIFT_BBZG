const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const sharp = require('sharp');
const { proxyLocalCover } = require('../lib/local-cover');

test('任意 public 静态图片位置通过只读文件接口返回，不执行路由或越界读取', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-local-cover-'));
  const publicDir = path.join(root, 'public');
  fs.mkdirSync(path.join(publicDir, 'album-art'), { recursive: true });
  const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#123456' } }).png().toBuffer();
  for (const name of ['cover.jpg', 'album-art/front.jpg', 'album-art/extensionless']) fs.writeFileSync(path.join(publicDir, name), bytes);
  fs.writeFileSync(path.join(root, 'outside.png'), bytes);
  fs.symlinkSync(path.join(root, 'outside.png'), path.join(publicDir, 'link.png'));
  fs.writeFileSync(path.join(publicDir, 'not-image.txt'), 'not an image');
  const app = express();
  let writes = 0;
  app.get('/api/inquiries/add', (_req, res) => { writes += 1; res.send('write'); });
  app.get('/cover', (req, res) => proxyLocalCover(req, res, { publicDir }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/cover?path=`;
  for (const value of ['/cover.jpg', '/album-art/front.jpg', '/album-art/extensionless']) {
    const response = await fetch(base + encodeURIComponent(value));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  }
  for (const value of ['/../outside.png', '/link.png', '/api/inquiries/add', '/not-image.txt']) {
    const response = await fetch(base + encodeURIComponent(value));
    assert.equal(response.status, 404);
  }
  assert.equal(writes, 0);
});
