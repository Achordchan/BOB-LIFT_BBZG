const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { normalizeMusicCover, musicCoverUrl } = require('../lib/music-cover');
const { registerPublicMusicRoutes } = require('../routes/public-music');

test('网易云封面统一 HTTPS，B 站视频封面走同源代理', () => {
  assert.equal(normalizeMusicCover('http://p1.music.126.net/a.jpg'), 'https://p1.music.126.net/a.jpg');
  assert.match(normalizeMusicCover('//i0.hdslb.com/a.jpg'), /^\/api\/public\/music\/bilibili\/image\?/);
  for (const input of ['javascript:alert(1)', 'file:///etc/passwd', '/\\evil.test/cover.jpg']) {
    assert.equal(normalizeMusicCover(input), '');
  }
  assert.equal(musicCoverUrl({ source: 'netease', sourceId: '123' }), '/api/public/music/cover?id=123');
  assert.equal(musicCoverUrl({ source: 'bilibili', sourceId: 'BV1os41197sv' }), '');
  for (const coverUrl of ['/uploads/cover.jpg', 'images/custom.png', '../covers/a.jpg', 'https://cdn.example.com/a.jpg', 'http://legacy.example.com/a.jpg']) {
    assert.equal(musicCoverUrl({ source: 'netease', sourceId: '123', coverUrl }), coverUrl);
  }
});

test('历史网易云记录按来源 ID 补取封面并缓存，不依赖歌曲名猜测', async t => {
  let calls = 0;
  const upstream = express();
  upstream.use(express.json());
  upstream.post('/song', (req, res) => {
    calls += 1;
    assert.equal(req.body.type, 'name');
    res.json({ success: true, data: { songs: [{ al: { picUrl: 'http://p1.music.126.net/cover.jpg' } }] } });
  });
  const up = upstream.listen(0, '127.0.0.1');
  await new Promise(resolve => up.once('listening', resolve));
  const previous = process.env.BBZG_MUSIC_API_BASE;
  process.env.BBZG_MUSIC_API_BASE = `http://127.0.0.1:${up.address().port}`;
  const app = express();
  registerPublicMusicRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => {
    up.closeAllConnections(); up.close(); server.closeAllConnections(); server.close();
    if (previous === undefined) delete process.env.BBZG_MUSIC_API_BASE;
    else process.env.BBZG_MUSIC_API_BASE = previous;
  });
  const url = `http://127.0.0.1:${server.address().port}/api/public/music/cover?id=123`;
  for (let i = 0; i < 2; i++) {
    const response = await fetch(url, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://p1.music.126.net/cover.jpg');
  }
  assert.equal(calls, 1);
});
