const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const express = require('express');
const { parseBilibiliId, assertMp3Response } = require('../lib/bilibili-client');
const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-bili-audit-test-'));
process.env.BBZG_AUDIT_DIR = auditDir;
test.after(() => fs.rmSync(auditDir, { recursive: true, force: true }));
const { registerBilibiliMusicRoutes } = require('../routes/bilibili-music');
const { registerMusicRoutes } = require('../routes/music');
const { registerEggRoutes } = require('../routes/egg');
const { saveMusicStream } = require('../lib/music-download');

const BV = 'BV1os41197sv';
test('拒绝将未转码的 M4A 仅改名为 MP3', () => {
  const data = Readable.from([]);
  assert.throws(() => assertMp3Response({ headers: { 'content-type': 'audio/mp4' }, data }), /未返回 MP3/);
  assert.equal(data.destroyed, true);
});
async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-bili-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const previousBase = process.env.BBZG_BILIBILI_API_BASE;
  t.after(() => {
    if (previousBase === undefined) delete process.env.BBZG_BILIBILI_API_BASE;
    else process.env.BBZG_BILIBILI_API_BASE = previousBase;
  });
  const upstream = express();
  const requests = [];
  upstream.use((req, _res, next) => { requests.push({ path: req.path, query: req.query }); next(); });
  upstream.get('/api/search', (_req, res) => res.json({ ok: true, items: Array.from({ length: 20 }, () => ({
    bvid: BV, title: '测试音频', author: '测试 UP 主', cover: 'https://i0.hdslb.com/cover.jpg', duration: '3:00'
  })) }));
  upstream.get('/api/audio', (req, res) => {
    res.json({ ok: true, audio: { url: `https://example.bilivideo.com/${req.query.bvid}.m4a` } });
  });
  upstream.get('/api/stream', (req, res) => {
    if (String(req.query.url).includes('BV0000000000')) return res.status(502).json({ ok: false, error: '音轨不可用' });
    res.type('audio/mpeg');
    if (req.headers.range) res.status(206).set('Content-Range', 'bytes 0-3/8').set('Accept-Ranges', 'bytes').send(Buffer.from('test'));
    else res.send(Buffer.from('test-mp3'));
  });
  upstream.get('/api/login/status', (_req, res) => res.json({ ok: true, logged_in: false, uname: '' }));
  process.env.BBZG_BILIBILI_API_BASE = await listen(t, upstream);
  let data = { music: [], users: [{ id: 'employee', name: '测试员工' }] };
  const getData = () => structuredClone(data);
  const saveData = value => { data = structuredClone(value); return true; };
  const deps = {
    baseDir: dir, getData, saveData, uuidv4: randomUUID,
    updateData: mutate => { saveData(mutate(getData())); return { ok: true, data: getData() }; },
    requireLogin: (req, res, next) => req.session.loggedIn ? next() : res.status(401).json({ success: false }),
    upload: { fields: () => (_req, _res, next) => next(), single: () => (_req, _res, next) => next() }
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.sessionID = req.headers['x-test-role'] || 'anonymous';
    req.session = req.headers['x-test-role'] === 'admin' ? { loggedIn: true }
      : req.headers['x-test-role'] === 'egg' ? { eggUserId: 'employee' } : {};
    next();
  });
  registerBilibiliMusicRoutes(app);
  registerMusicRoutes(app, deps);
  registerEggRoutes(app, deps);
  return { base: await listen(t, app), dir, getData, requests, saveData };
}

function post(base, endpoint, body, role = 'admin') {
  return fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-role': role }, body: JSON.stringify(body) });
}

test('B 站 ID 只接受 BV 号与可选分 P cid', () => {
  assert.deepEqual(parseBilibiliId(`${BV}:123`), { bvid: BV, cid: '123' });
  for (const value of ['../etc/passwd', '123', `${BV}?url=http://localhost`, `${BV}:0`]) {
    assert.throws(() => parseBilibiliId(value), /无效/);
  }
});

test('后台与员工音乐库保留历史同源及自定义 HTTPS 封面', async t => {
  const { base, saveData } = await fixture(t);
  const covers = ['/uploads/cover.jpg', 'https://cdn.example.com/cover.jpg', 'https://cdn.example.com/image?id=123'];
  saveData({ users: [{ id: 'employee' }], music: covers.map((coverUrl, index) => ({ id: String(index), coverUrl, source: 'netease', sourceId: '123' })) });
  for (const [endpoint, role] of [['/api/music', 'admin'], ['/api/egg/music', 'egg']]) {
    const result = await (await fetch(base + endpoint, { headers: { 'x-test-role': role } })).json();
    assert.deepEqual(result.music.map(item => item.coverUrl.startsWith('/api/public/music/cover-image?') ? new URL(item.coverUrl, base).searchParams.get('url') : new URL(item.coverUrl, base).searchParams.get('path') || item.coverUrl).sort(), covers.slice().sort());
  }
});

test('员工不能把封面持久化为管理员业务写入口，旧记录也在返回时过滤', async t => {
  const { base, getData, saveData } = await fixture(t);
  const response = await post(base, '/api/egg/set-broadcast-from-bilibili', {
    id: BV, name: '封面安全测试', coverUrl: '/api/inquiries/add'
  }, 'egg');
  assert.equal(response.status, 200);
  assert.equal(getData().music[0].coverUrl, '');
  const data = getData();
  data.music[0].coverUrl = 'https://bbzg.example.com/api/inquiries/add';
  saveData(data);
  for (const [endpoint, role] of [['/api/music', 'admin'], ['/api/egg/music', 'egg']]) {
    const result = await (await fetch(base + endpoint, { headers: { 'x-test-role': role } })).json();
    assert.equal(result.music[0].coverUrl, '');
  }
  const detail = await (await fetch(`${base}/api/music/${data.music[0].id}`, { headers: { 'x-test-role': 'admin' } })).json();
  assert.equal(detail.music.coverUrl, '');
  const updated = await (await post(base, '/api/music/update', { musicId: data.music[0].id, name: '更新测试' })).json();
  assert.equal(updated.music.coverUrl, '');
});

test('搜索、试听和账号配置按员工 / 管理员权限隔离', async t => {
  const { base, requests } = await fixture(t);
  const search = '/api/public/music/bilibili/search?keywords=钢琴&page=2';
  assert.equal((await fetch(base + search)).status, 401);
  const response = await fetch(base + search, { headers: { 'x-test-role': 'egg' } });
  const payload = await response.json();
  assert.equal(payload.songs[0].source, 'bilibili');
  assert.equal(payload.songs[0].artists, '测试 UP 主');
  assert.equal(payload.hasMore, true);
  assert.equal(payload.total, undefined);
  assert.equal(requests.at(-1).query.page, '2');
  assert.equal((await fetch(base + '/api/bilibili/status', { headers: { 'x-test-role': 'egg' } })).status, 401);
  assert.equal((await fetch(base + '/api/bilibili/status', { headers: { 'x-test-role': 'admin' } })).status, 200);
  assert.equal((await post(base, '/api/bilibili/cookie', { cookie: 'invalid' })).status, 400);
  assert.equal((await fetch(base + '/api/public/music/bilibili/search?keywords=x&page=51', { headers: { 'x-test-role': 'egg' } })).status, 400);
});

test('音轨分段代理保留 206、MIME 和 Content-Range，下载使用 mp3 后缀', async t => {
  const { base } = await fixture(t);
  const response = await fetch(`${base}/api/public/music/bilibili/stream?id=${BV}`, {
    headers: { 'x-test-role': 'egg', Range: 'bytes=0-3' }
  });
  assert.equal(response.status, 206);
  assert.match(response.headers.get('content-type'), /audio\/mpeg/);
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/8');
  assert.equal(await response.text(), 'test');
  const download = await fetch(`${base}/api/public/music/bilibili/download?id=${BV}&name=钢琴`, { headers: { 'x-test-role': 'egg' } });
  assert.match(download.headers.get('content-disposition'), /audio\.mp3/);
  assert.equal(await download.text(), 'test-mp3');
});

test('后台导入通过 SSE 完成，保存 B 站来源及真实 mp3 文件', async t => {
  const { base, dir, getData, requests } = await fixture(t);
  const response = await post(base, '/API/MUSIC/IMPORT-BILIBILI/', { id: BV, name: '钢琴', artist: 'UP 主', coverUrl: 'https://i0.hdslb.com/cover.jpg' });
  assert.equal(response.status, 200);
  const { jobId } = await response.json();
  const events = await fetch(`${base}/api/music/import-events/${jobId}`, { headers: { 'x-test-role': 'admin' }, signal: AbortSignal.timeout(5000) });
  const eventText = await events.text();
  assert.match(eventText, /event: done/);
  const track = getData().music[0];
  assert.equal(track.source, 'bilibili');
  assert.equal(track.sourceId, BV);
  assert.match(track.filename, /\.mp3$/);
  assert.match(track.coverUrl, /^\/api\/public\/music\/bilibili\/image\?/);
  assert.equal(fs.readFileSync(path.join(dir, 'public/music', track.filename), 'utf8'), 'test-mp3');
  assert.equal(requests.some(req => /lyric/.test(req.path)), false);
});

test('员工设为播报复用音乐库，修复缺失音频且不覆盖其他来源', async t => {
  const { base, getData, dir, saveData } = await fixture(t);
  saveData({ users: [{ id: 'employee' }], music: [
    { id: 'netease-track', source: 'netease', sourceId: BV, filename: 'other.mp3' },
    { id: 'missing-bili', source: 'bilibili', sourceId: BV, filename: 'missing.m4a' }
  ] });
  const endpoint = '/api/egg/set-broadcast-from-bilibili';
  assert.equal((await post(base, endpoint, { id: BV, name: '钢琴' }, '')).status, 401);
  const first = await (await post(base, endpoint, { id: BV, name: '钢琴' }, 'egg')).json();
  assert.equal(first.success, true);
  const second = await (await post(base, endpoint.toUpperCase() + '/', { id: BV, name: '钢琴' }, 'egg')).json();
  assert.equal(second.music.id, first.music.id);
  assert.equal(first.music.id, 'missing-bili');
  assert.equal(getData().users[0].musicId, first.music.id);
  assert.equal(getData().music.length, 2);
  assert.equal(fs.readdirSync(path.join(dir, 'public/music')).length, 1);
});

test('无效 ID 不访问上游，下载失败不产生已完成记录', async t => {
  const { base, getData, requests } = await fixture(t);
  assert.equal((await post(base, '/api/music/import-bilibili', { id: '../bad', name: 'x' })).status, 400);
  assert.equal(requests.length, 0);
  const { jobId } = await (await post(base, '/api/music/import-bilibili', { id: 'BV0000000000', name: 'x' })).json();
  const events = await fetch(`${base}/api/music/import-events/${jobId}`, { headers: { 'x-test-role': 'admin' }, signal: AbortSignal.timeout(5000) });
  assert.match(await events.text(), /event: error/);
  assert.equal(getData().music.length, 0);
});

test('导入限制文件大小并清理中断残片', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-bili-download-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const previous = process.env.BBZG_MUSIC_MAX_DOWNLOAD_BYTES;
  process.env.BBZG_MUSIC_MAX_DOWNLOAD_BYTES = '4';
  t.after(() => {
    if (previous === undefined) delete process.env.BBZG_MUSIC_MAX_DOWNLOAD_BYTES;
    else process.env.BBZG_MUSIC_MAX_DOWNLOAD_BYTES = previous;
  });
  const target = path.join(dir, 'oversize.mp3');
  await assert.rejects(saveMusicStream({ headers: {}, data: Readable.from([Buffer.from('12345678')]) }, target), /大小限制/);
  assert.equal(fs.existsSync(target), false);
  await assert.rejects(saveMusicStream({ headers: {}, data: Readable.from([]) }, target), /为空/);
  assert.equal(fs.existsSync(target), false);
  fs.writeFileSync(target, 'original');
  await assert.rejects(saveMusicStream({ headers: {}, data: Readable.from([Buffer.from('new')]) }, target), /EEXIST/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'original');
});

test('文件打开尚未完成时上游中断，也会关闭句柄并清除残片', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-open-race-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const target = path.join(dir, 'interrupted.mp3');
  const originalOpen = fs.promises.open.bind(fs.promises);
  let notifyOpen;
  let releaseOpen;
  const opened = new Promise(resolve => { notifyOpen = resolve; });
  const gate = new Promise(resolve => { releaseOpen = resolve; });
  t.mock.method(fs.promises, 'open', async (...args) => {
    const file = await originalOpen(...args);
    notifyOpen();
    await gate;
    return file;
  });
  const source = new Readable({ read() {} });
  const failed = assert.rejects(saveMusicStream({ headers: {}, data: source }, target), /上游中断/);
  await opened;
  source.destroy(new Error('上游中断'));
  await new Promise(resolve => setImmediate(resolve));
  releaseOpen();
  await failed;
  assert.equal(fs.existsSync(target), false);
});


test('整页封面排队加载，不占用音频并发额度', async t => {
  let release;
  let ready;
  let started = 0;
  let released = false;
  const gate = new Promise(resolve => { release = resolve; });
  const readyGate = new Promise(resolve => { ready = resolve; });
  const app = express();
  app.use((req, _res, next) => { req.session = { loggedIn: true }; next(); });
  registerBilibiliMusicRoutes(app, { client: {
    imageUrl: value => value,
    resolve: async () => 'audio',
    stream: async url => {
      const image = url !== 'audio';
      if (image && !released) { started += 1; if (started === 4) ready(); await gate; }
      return { status: 200, headers: { 'content-type': image ? 'image/png' : 'audio/mpeg' }, data: Readable.from([Buffer.from('ok')]) };
    }
  } });
  const base = await listen(t, app);
  const covers = Array.from({ length: 20 }, (_, i) => fetch(`${base}/api/public/music/bilibili/image?url=image-${i}`).then(async response => {
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'ok');
  }));
  await readyGate;
  const audio = await fetch(`${base}/api/public/music/bilibili/stream?id=${BV}`);
  assert.equal(audio.status, 200);
  assert.equal(await audio.text(), 'ok');
  assert.equal(started, 4);
  released = true;
  release();
  await Promise.all(covers);
});

test('管理员和员工导入均持久化 WebP，歌曲展示继续使用只读本地封面接口', async t => {
  const sharp = require('sharp');
  const { base, getData, dir } = await fixture(t);
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  const original = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#28507c' } }).png().toBuffer();
  fs.writeFileSync(path.join(dir, 'public/cover.png'), original);
  const { jobId } = await (await post(base, '/api/music/import-bilibili', { id: BV, name: '后台歌曲', coverUrl: '/cover.png' })).json();
  const events = await fetch(`${base}/api/music/import-events/${jobId}`, { headers: { 'x-test-role': 'admin' }, signal: AbortSignal.timeout(5000) });
  assert.match(await events.text(), /event: done/);
  const employeeId = 'BV1xx411c7mD';
  const response = await (await post(base, '/api/egg/set-broadcast-from-bilibili', { id: employeeId, name: '员工歌曲', coverUrl: '/cover.png' }, 'egg')).json();
  assert.equal(response.success, true);
  assert.equal(getData().music.length, 2);
  for (const song of getData().music) {
    assert.match(song.coverUrl, /^\/music\/covers\/[a-f0-9]{64}\.webp$/);
    assert.equal(song.coverOptimization.status, 'ready');
    const metadata = await sharp(path.join(dir, 'public', song.coverUrl)).metadata();
    assert.deepEqual([metadata.format, metadata.width, metadata.height], ['webp', 640, 427]);
  }
  const list = await (await fetch(`${base}/api/music`, { headers: { 'x-test-role': 'admin' } })).json();
  assert.ok(list.music.every(song => song.coverUrl.startsWith('/api/public/music/local-cover?')));
  assert.deepEqual(fs.readFileSync(path.join(dir, 'public/cover.png')), original);
});
