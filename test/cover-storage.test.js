const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const express = require('express');
const { Readable } = require('node:stream');
const { randomUUID } = require('node:crypto');
const { convertCover, storeCover, readCoverSource, importCover } = require('../lib/cover-storage');
const { musicCoverUrl } = require('../lib/music-cover');
const { proxyLocalCover } = require('../lib/local-cover');
const { downloadRemoteCover } = require('../lib/remote-cover');
const { prepare, verify } = require('../scripts/migrate-music-covers');
const { createUpload } = require('../services/uploads');
const { registerMusicRoutes } = require('../routes/music');

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bbzg-cover-'));
  await fs.mkdir(path.join(dir, 'public'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
const png = (width = 1200, height = 800) => sharp({ create: { width, height, channels: 4, background: '#e49b6080' } }).png().toBuffer();
async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('保持比例、透明度、小图尺寸，按 EXIF 旋转并剥离元数据，拒绝损坏和超限输入', async () => {
  const result = await convertCover(await png());
  assert.deepEqual([result.after.width, result.after.height], [640, 427]);
  assert.equal((await sharp(result.bytes).metadata()).hasAlpha, true);
  const small = await convertCover(await png(32, 16));
  assert.deepEqual([small.after.width, small.after.height], [32, 16]);
  const oriented = await sharp(await png(100, 60)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const rotated = await convertCover(oriented);
  assert.deepEqual([rotated.after.width, rotated.after.height], [60, 100]);
  assert.equal((await sharp(rotated.bytes).metadata()).exif, undefined);
  await assert.rejects(convertCover(Buffer.from('not-image')));
  await assert.rejects(convertCover(Buffer.alloc(5 * 1024 * 1024 + 1)), /5 MB/);
  await assert.rejects(convertCover(Buffer.from('<svg width="20" height="20"></svg>')), /格式/);
  assert.deepEqual((await convertCover(small.bytes)).bytes, small.bytes);
  const animation = Buffer.concat([Buffer.alloc(20 * 20 * 3, 0), Buffer.alloc(20 * 20 * 3, 255)]);
  const gif = await sharp(animation, { raw: { width: 20, height: 40, channels: 3, pageHeight: 20 } }).gif({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(gif).metadata()).pages, 2);
  await assert.rejects(convertCover(gif), /动态或多页/);
});

test('保存内容寻址 WebP，经原展示接口返回正确 URL、MIME 和可解码字节', async t => {
  const baseDir = await fixture(t);
  const bytes = await png();
  const a = await storeCover(bytes, baseDir);
  const b = await storeCover(bytes, baseDir);
  assert.equal(a.coverUrl, b.coverUrl);
  assert.equal((await fs.readdir(path.join(baseDir, 'public/music/covers'))).length, 1);
  const app = express();
  app.get('/api/public/music/local-cover', (req, res) => proxyLocalCover(req, res, { publicDir: path.join(baseDir, 'public') }));
  const base = await listen(t, app);
  const response = await fetch(base + musicCoverUrl(a));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width, 640);
});

test('封面导入复用安全下载，失败保留原引用并记录原因，本地符号链接不能越界', async t => {
  const baseDir = await fixture(t);
  const bytes = await png();
  const remote = 'https://cdn.example/cover.jpg';
  const request = async () => ({ status: 200, headers: { 'content-type': 'image/jpeg' }, data: Readable.from([bytes]) });
  const result = await importCover(remote, { baseDir, request });
  assert.match(result.coverUrl, /^\/music\/covers\/[a-f0-9]{64}\.webp$/);
  assert.equal(result.coverOriginalUrl, remote);
  assert.equal(result.coverOptimization.status, 'ready');
  const failed = await importCover(remote, { baseDir, request: async () => { throw new Error('unavailable'); } });
  assert.equal(failed.coverUrl, remote);
  assert.equal(failed.coverOptimization.status, 'failed');
  await fs.writeFile(path.join(baseDir, 'outside.png'), bytes);
  await fs.symlink(path.join(baseDir, 'outside.png'), path.join(baseDir, 'public/link.png'));
  await assert.rejects(readCoverSource('/link.png', { baseDir }), /越界/);
  const bili = await importCover('/api/public/music/bilibili/image?url=https%3A%2F%2Fi0.hdslb.com%2Fcover.jpg', {
    baseDir, request: async (url, options) => {
      assert.equal(url, 'https://i0.hdslb.com/cover.jpg');
      assert.equal(options.headers.Referer, 'https://www.bilibili.com/');
      return request();
    }
  });
  assert.equal(bili.coverOptimization.status, 'ready');
  const tooBig = async () => ({ status: 200, headers: { 'content-type': 'image/png' }, data: Readable.from([Buffer.alloc(5 * 1024 * 1024), Buffer.from('x')]) });
  await assert.rejects(downloadRemoteCover(remote, '', { request: tooBig }), /大小限制/);
});

test('迁移包仅更改封面引用，保留原图，可恢复，拒绝源数据漂移或输出损坏', async t => {
  const baseDir = await fixture(t);
  const bytes = await png();
  await fs.writeFile(path.join(baseDir, 'public/cover.png'), bytes);
  const data = { music: [{ id: 'one', coverUrl: '/cover.png' }, { id: 'two', coverUrl: '/missing.png' }, { id: 'three' }], other: { keep: true } };
  const original = JSON.stringify(data);
  await fs.writeFile(path.join(baseDir, 'data.json'), original);
  const out = path.join(baseDir, 'migration');
  const manifest = await prepare(baseDir, out);
  assert.deepEqual(manifest.entries.map(entry => entry.status), ['ready', 'failed', 'skipped']);
  assert.equal(await fs.readFile(path.join(baseDir, 'data.json'), 'utf8'), original);
  assert.deepEqual(await fs.readFile(path.join(baseDir, 'public/cover.png')), bytes);
  assert.equal(await fs.readFile(path.join(out, 'original-data.json'), 'utf8'), original);
  await verify(baseDir, out);
  await fs.writeFile(path.join(baseDir, 'data.json'), JSON.stringify({ ...data, other: 'changed' }));
  await assert.rejects(verify(baseDir, out), /当前数据已变化/);
  await fs.writeFile(path.join(baseDir, 'data.json'), original);
  await fs.writeFile(path.join(out, 'public/music/covers', `${manifest.entries[0].outputHash}.webp`), 'broken');
  await assert.rejects(verify(baseDir, out), /哈希/);
  await assert.rejects(prepare(baseDir, path.join(baseDir, 'public/unsafe')), /public/);
});

test('真实 multipart 歌曲上传保存 WebP；无封面兼容；错误图片不写库，原图留在私有暂存区', async t => {
  const baseDir = await fixture(t);
  let data = { music: [] };
  const app = express();
  registerMusicRoutes(app, { baseDir, upload: createUpload(baseDir), uuidv4: randomUUID,
    getData: () => structuredClone(data), saveData: value => { data = structuredClone(value); return true; },
    requireLogin: (_req, _res, next) => next() });
  const base = await listen(t, app);
  async function upload(bytes) {
    const form = new FormData();
    form.append('name', '歌曲');
    form.append('musicFile', new Blob(['audio-fixture'], { type: 'audio/mpeg' }), 'song.mp3');
    if (bytes) form.append('coverFile', new Blob([bytes], { type: 'image/png' }), 'cover.png');
    return fetch(base + '/api/music/upload', { method: 'POST', body: form });
  }
  assert.equal((await upload(await png())).status, 200);
  assert.match(data.music[0].coverUrl, /\.webp$/);
  assert.equal((await fs.readdir(path.join(baseDir, 'storage/cover-uploads'))).length, 0);
  assert.equal((await upload()).status, 200);
  assert.equal(data.music[1].coverUrl, undefined);
  assert.equal((await upload(Buffer.from('broken'))).status, 400);
  assert.equal(data.music.length, 2);
  assert.equal((await fs.readdir(path.join(baseDir, 'storage/cover-uploads'))).length, 1);
});
