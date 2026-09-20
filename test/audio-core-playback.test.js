const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('切换曲目产生的旧 AbortError 不破坏新曲目的播放状态', async () => {
  const listeners = {};
  let rejectPlay;
  const audio = {
    paused: true, currentSrc: '/api/public/music/bilibili/stream?id=test', currentTime: 0,
    querySelector: () => null, addEventListener: () => {},
    play: () => new Promise((_resolve, reject) => { rejectPlay = reject; }),
    pause: () => {}
  };
  const text = { textContent: '', style: {} };
  const icon = { style: {} };
  const button = { style: {}, querySelector: selector => selector === '.play-text' ? text : icon,
    addEventListener: (name, fn) => { listeners[name] = fn; } };
  const root = { querySelector: selector => selector === '.music-audio' ? audio : selector === '.play-music-btn' ? button : null };
  const window = { location: { href: 'http://localhost/egg-music' }, addEventListener: () => {} };
  const context = { window, URL, Set, isFinite, console, document: { querySelectorAll: () => [] }, fetch: async () => ({ ok: true }) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/audio-core.js'), 'utf8'), context);
  window.AudioCore.bindAudioPlayer(root);
  listeners.click();
  await Promise.resolve();
  text.textContent = '暂停';
  rejectPlay(Object.assign(new Error('old track interrupted'), { name: 'AbortError' }));
  await Promise.resolve();
  assert.equal(text.textContent, '暂停');
});
