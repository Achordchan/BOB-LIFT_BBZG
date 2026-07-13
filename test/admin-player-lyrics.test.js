const assert = require('node:assert/strict');
const test = require('node:test');
const {
  keepLyricsForReplay,
  keepLyricsWhenReloadHasNoContent
} = require('../src/admin/lyrics-state.ts');

const loadedLyrics = {
  title: 'Love Me Harder',
  rawContent: '[00:01.00]歌词',
  lines: [{ time: 1, text: '歌词' }],
  trackId: 'netease-28971281'
};

test('重复试听同一首网易云歌曲时保留已有歌词', () => {
  assert.equal(
    keepLyricsForReplay(loadedLyrics, 'netease-28971281'),
    loadedLyrics
  );
  assert.equal(
    keepLyricsForReplay(loadedLyrics, 'netease-other'),
    null
  );
});

test('重复加载歌词返回空内容或失败时不覆盖已有歌词', () => {
  const fallback = {
    title: 'Love Me Harder',
    rawContent: '暂无歌词',
    lines: [],
    trackId: 'netease-28971281'
  };

  assert.equal(
    keepLyricsWhenReloadHasNoContent(loadedLyrics, 'netease-28971281', fallback),
    loadedLyrics
  );
  assert.equal(
    keepLyricsWhenReloadHasNoContent(null, 'netease-28971281', fallback),
    fallback
  );
});
