const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const {
  cleanupExpiredTtsFiles,
  normalizeManagedAudioPath,
  scanUnreferencedAudioFiles
} = require('../lib/audio-assets');
const { registerAudioPlaybackRoutes } = require('../routes/audio-playback');
const { registerTtsRoutes } = require('../routes/tts');

function createFixture(t) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbzg-audio-assets-'));
  const ttsDir = path.join(baseDir, 'public', 'music', 'tts');
  const customDir = path.join(baseDir, 'public', 'music', 'custom');
  fs.mkdirSync(ttsDir, { recursive: true });
  fs.mkdirSync(customDir, { recursive: true });
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));
  return { baseDir, ttsDir, customDir };
}

function writeAudio(dir, filename, ageInDays = 0) {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, 'audio');
  const timestamp = new Date(Date.now() - ageInDays * 24 * 60 * 60 * 1000);
  fs.utimesSync(filePath, timestamp, timestamp);
  return filePath;
}

function findRouteHandler(app, method, routePath) {
  const layer = app._router.stack.find(
    (entry) => entry.route && entry.route.path === routePath && entry.route.methods[method]
  );
  assert.ok(layer, `missing route ${method} ${routePath}`);
  return layer.route.stack.at(-1).handle;
}

function invoke(handler, req = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headersSent: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.headersSent = true;
        resolve({ statusCode: this.statusCode, body });
        return this;
      }
    };
    try {
      const pending = handler(req, res);
      if (pending && typeof pending.catch === 'function') pending.catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

function registerPlaybackApp(baseDir, getData) {
  const app = express();
  registerAudioPlaybackRoutes(app, {
    requireLogin: (_req, _res, next) => next(),
    upload: { single: () => (_req, _res, next) => next() },
    getData,
    saveData: () => true,
    uuidv4: () => 'id',
    baseDir
  });
  return app;
}

function registerTtsApp(baseDir, getData) {
  const app = express();
  registerTtsRoutes(app, {
    requireLogin: (_req, _res, next) => next(),
    getData,
    saveData: () => true,
    baseDir,
    parseDealAmountInput: () => 0,
    formatDealAmountForTts: () => '0.00'
  });
  return app;
}

test('过期 TTS 清理保护所有业务引用并删除未引用文件', async (t) => {
  const { baseDir, ttsDir, customDir } = createFixture(t);
  const startup = writeAudio(ttsDir, 'startup.mp3', 30);
  const library = writeAudio(ttsDir, 'library.mp3', 30);
  const fired = writeAudio(ttsDir, 'fired.mp3', 30);
  const orphan = writeAudio(ttsDir, 'orphan.mp3', 30);
  const fresh = writeAudio(ttsDir, 'fresh.mp3', 1);
  const custom = writeAudio(customDir, 'library-custom.mp3', 30);
  const data = {
    startupAudio: { audioPath: '/music/tts/startup.mp3' },
    personalizedAudio: [
      { audioPath: '/music/tts/library.mp3' },
      { audioPath: '/music/custom/library-custom.mp3' }
    ],
    personalizedFire: { audioPath: '/music/tts/fired.mp3' }
  };

  const result = await cleanupExpiredTtsFiles({ baseDir, getData: () => data, maxAgeInDays: 7 });

  assert.equal(fs.existsSync(startup), true);
  assert.equal(fs.existsSync(library), true);
  assert.equal(fs.existsSync(fired), true);
  assert.equal(fs.existsSync(custom), true);
  assert.equal(fs.existsSync(orphan), false);
  assert.equal(fs.existsSync(fresh), true);
  assert.deepEqual(result, {
    totalCount: 5,
    deletedCount: 1,
    protectedCount: 3,
    unexpiredCount: 1,
    failedCount: 0
  });
});

test('清理全部仍跳过业务引用文件', async (t) => {
  const { baseDir, ttsDir } = createFixture(t);
  const protectedFile = writeAudio(ttsDir, 'protected.mp3');
  const orphan = writeAudio(ttsDir, 'orphan.mp3');
  const data = { personalizedFire: { audioPath: '/music/tts/protected.mp3' } };

  const result = await cleanupExpiredTtsFiles({ baseDir, getData: () => data, maxAgeInDays: 0 });

  assert.equal(fs.existsSync(protectedFile), true);
  assert.equal(fs.existsSync(orphan), false);
  assert.equal(result.protectedCount, 1);
  assert.equal(result.deletedCount, 1);
});

test('孤儿扫描排除 startup、音效库和 personalizedFire 引用', (t) => {
  const { baseDir, ttsDir, customDir } = createFixture(t);
  writeAudio(ttsDir, 'startup.mp3');
  writeAudio(ttsDir, 'fired.mp3');
  writeAudio(customDir, 'library.mp3');
  writeAudio(ttsDir, 'orphan.mp3');
  const data = {
    startupAudio: { audioPath: '/music/tts/startup.mp3' },
    personalizedAudio: [{ audioPath: '/music/custom/library.mp3' }],
    personalizedFire: { audioPath: '/music/tts/fired.mp3' }
  };

  assert.deepEqual(
    scanUnreferencedAudioFiles(baseDir, data).map((item) => item.audioPath),
    ['/music/tts/orphan.mp3']
  );
});

test('删除接口基于最新数据拒绝删除已引用音频', async (t) => {
  const { baseDir, ttsDir } = createFixture(t);
  const filePath = writeAudio(ttsDir, 'in-use.mp3');
  let data = {};
  const app = registerPlaybackApp(baseDir, () => data);
  const scan = findRouteHandler(app, 'post', '/api/audio-cleanup/scan');
  const remove = findRouteHandler(app, 'post', '/api/audio-cleanup/delete');

  const scanned = await invoke(scan, { body: {} });
  assert.equal(scanned.body.items.some((item) => item.audioPath === '/music/tts/in-use.mp3'), true);

  data = { startupAudio: { audioPath: '/music/tts/in-use.mp3' } };
  const blocked = await invoke(remove, { body: { audioPath: '/music/tts/in-use.mp3' } });
  assert.equal(blocked.statusCode, 409);
  assert.equal(fs.existsSync(filePath), true);

  data = {};
  const removed = await invoke(remove, { body: { audioPath: '/music/tts/in-use.mp3' } });
  assert.equal(removed.statusCode, 200);
  assert.equal(fs.existsSync(filePath), false);
});

test('受管路径拒绝遍历、反斜杠和非受管目录', async (t) => {
  const { baseDir } = createFixture(t);
  const outside = path.join(baseDir, 'public', 'music', 'outside.mp3');
  fs.writeFileSync(outside, 'keep');
  const app = registerPlaybackApp(baseDir, () => ({}));
  const remove = findRouteHandler(app, 'post', '/api/audio-cleanup/delete');
  const invalidPaths = [
    '/music/tts/../outside.mp3',
    '/music/tts/%2e%2e%2foutside.mp3',
    '/music/tts/..\\outside.mp3',
    '/music/other/outside.mp3'
  ];

  for (const audioPath of invalidPaths) {
    assert.equal(normalizeManagedAudioPath(audioPath), null);
    const result = await invoke(remove, { body: { audioPath } });
    assert.equal(result.statusCode, 400);
  }
  assert.equal(fs.existsSync(outside), true);
});

test('手动 TTS 清理校验年龄参数并返回准确结果', async (t) => {
  const previous = process.env.BBZG_DISABLE_TTS_MAINTENANCE;
  process.env.BBZG_DISABLE_TTS_MAINTENANCE = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.BBZG_DISABLE_TTS_MAINTENANCE;
    else process.env.BBZG_DISABLE_TTS_MAINTENANCE = previous;
  });
  const { baseDir, ttsDir } = createFixture(t);
  const protectedFile = writeAudio(ttsDir, 'protected.mp3', 30);
  const orphan = writeAudio(ttsDir, 'orphan.mp3', 30);
  const data = { startupAudio: { audioPath: '/music/tts/protected.mp3' } };
  const app = registerTtsApp(baseDir, () => data);
  const cleanup = findRouteHandler(app, 'post', '/api/cleanup-tts-files');

  for (const maxAgeInDays of ['0', -1, 1.5, Number.NaN, 3651]) {
    const invalid = await invoke(cleanup, { body: { maxAgeInDays } });
    assert.equal(invalid.statusCode, 400);
  }

  const result = await invoke(cleanup, { body: { maxAgeInDays: 0 } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.cleanup.deletedCount, 1);
  assert.equal(result.body.cleanup.protectedCount, 1);
  assert.equal(fs.existsSync(protectedFile), true);
  assert.equal(fs.existsSync(orphan), false);
});
