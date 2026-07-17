const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScriptModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const loadedModule = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(
    loadedModule,
    loadedModule.exports,
    require
  );
  return loadedModule.exports;
}

const {
  keepLyricsForReplay,
  keepLyricsWhenReloadHasNoContent
} = loadTypeScriptModule(path.join(__dirname, '../src/admin/lyrics-state.ts'));

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
