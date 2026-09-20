const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { normalizeMusicCover, musicCoverUrl, displayMusicCover } = require('../lib/music-cover');
const { registerPublicMusicRoutes } = require('../routes/public-music');

test('网易云封面统一 HTTPS，B 站视频封面走同源代理', () => {
  assert.equal(normalizeMusicCover('http://p1.music.126.net/a.jpg'), 'https://p1.music.126.net/a.jpg');
  assert.match(normalizeMusicCover('//i0.hdslb.com/a.jpg'), /^\/api\/public\/music\/bilibili\/image\?/);
  for (const input of ['javascript:alert(1)', 'file:///etc/passwd', '/\\evil.test/cover.jpg']) {
    assert.equal(normalizeMusicCover(input), '');
  }
  assert.equal(musicCoverUrl({ source: 'netease', sourceId: '123' }), '/api/public/music/cover?id=123');
  assert.equal(musicCoverUrl({ source: 'bilibili', sourceId: 'BV1os41197sv' }), '');
  for (const coverUrl of ['/uploads/cover.jpg', 'images/custom.png', '../covers/a.jpg', 'https://cdn.example.com/a.jpg', 'http://legacy.example.com/a.jpg', 'https://cdn.example.com/image?id=123', 'https://cdn.example.com/transform/width/200/photo']) {
    const expected = /^https?:/.test(coverUrl) ? coverUrl : new URL(coverUrl, 'https://local.test/').pathname;
    assert.equal(normalizeMusicCover(coverUrl), expected);
    const displayed = musicCoverUrl({ source: 'netease', sourceId: '123', coverUrl });
    if (/^https?:/.test(coverUrl)) assert.equal(new URL(displayed, 'https://local.test').searchParams.get('url'), coverUrl);
    else assert.equal(new URL(displayed, 'https://local.test').searchParams.get('path'), expected);
  }
});

test('封面不能变成携带管理员登录态的业务写请求', () => {
  for (const coverUrl of [
    '/api/inquiries/add', '/API/INQUIRIES/ADD/', '../api/inquiries/add',
    'https://bbzg.example.com/api/inquiries/add', '//bbzg.example.com/api/deals/add',
    '/images/../api/inquiries/add', '/uploads/%2e%2e/api/inquiries/add',
    '/logout', '/api/inquiries/add?image=cover.jpg',
    '/api/public/music/cover?id=../bad',
    '/api/public/music/bilibili/image?url=http://127.0.0.1/private'
  ]) {
    assert.equal(normalizeMusicCover(coverUrl), '', coverUrl);
    assert.equal(musicCoverUrl({ coverUrl, source: 'bilibili' }), '', coverUrl);
  }
  assert.equal(normalizeMusicCover('/api/public/music/cover?id=123'), '/api/public/music/cover?id=123');
  assert.equal(displayMusicCover('https://bbzg.example.com/custom-action', 'bbzg.example.com').startsWith('/api/public/music/local-cover?'), true);
  assert.equal(normalizeMusicCover('https://cdn.example.com/image?id=123', 'bbzg.example.com'), 'https://cdn.example.com/image?id=123');
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
    assert.equal(new URL(response.headers.get('location'), 'https://local.test').pathname, '/api/public/music/cover-image');
    assert.equal(new URL(response.headers.get('location'), 'https://local.test').searchParams.get('url'), 'https://p1.music.126.net/cover.jpg');
  }
  assert.equal(calls, 1);
});


test('本地封面统一根路径，不随后台和员工页面基址变化', () => {
  for (const input of ['images/custom.png', '../covers/a.jpg', '/album-art/front.jpg', '/cover.jpg']) {
    const normalized = normalizeMusicCover(input);
    const expected = new URL(input, 'https://app.example/').pathname;
    assert.equal(normalized, expected);
    for (const page of ['https://app.example/admin-app/', 'https://app.example/egg-music']) {
      assert.equal(new URL(normalized, page).pathname, expected);
      const display = new URL(displayMusicCover(input), page);
      assert.equal(display.pathname, '/api/public/music/local-cover');
      assert.equal(display.searchParams.get('path'), expected);
    }
  }
});
