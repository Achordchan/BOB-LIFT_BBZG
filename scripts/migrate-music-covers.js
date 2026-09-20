#!/usr/bin/env node
// 只生成/核验迁移包，不修改运行中的数据或删除任何原图。
const fs = require('node:fs/promises');
const path = require('node:path');
const { readCoverSource, storeCover, hash, COVER_PREFIX } = require('../lib/cover-storage');
const sharp = require('sharp');

async function inventory(baseDir) {
  const bytes = await fs.readFile(path.join(baseDir, 'data.json'));
  const data = JSON.parse(bytes);
  if (!Array.isArray(data.music)) throw new Error('data.json 缺少 music 数组');
  const ids = data.music.map(item => item.id);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new Error('歌曲 ID 缺失或重复，不能安全迁移');
  return { bytes, data };
}

async function prepare(baseDir, outputDir, hostname = '') {
  const { bytes, data } = await inventory(baseDir);
  // 独占新目录，防止覆盖先前的恢复包；目录须位于 public 之外。
  const publicRoot = await fs.realpath(path.join(baseDir, 'public'));
  const parent = await fs.realpath(path.dirname(outputDir));
  const resolvedOutput = path.join(parent, path.basename(outputDir));
  if (resolvedOutput === publicRoot || resolvedOutput.startsWith(publicRoot + path.sep)) throw new Error('迁移包不能放在 public 内');
  outputDir = resolvedOutput;
  await fs.mkdir(outputDir, { mode: 0o700 });
  await fs.mkdir(path.join(outputDir, 'originals'));
  await fs.writeFile(path.join(outputDir, 'original-data.json'), bytes, { flag: 'wx', mode: 0o600 });
  const entries = [];
  for (const song of data.music) {
    const entry = { id: song.id, originalUrl: song.coverUrl ?? null };
    entries.push(entry);
    if (!song.coverUrl) { entry.status = 'skipped'; entry.reason = '没有显式封面地址，保留原有按来源 ID 查询行为'; continue; }
    if (song.coverUrl.startsWith(COVER_PREFIX)) { entry.status = 'skipped'; entry.reason = '已使用托管 WebP，保持原引用'; continue; }
    try {
      const source = await readCoverSource(song.coverUrl, { baseDir, hostname });
      const sourceHash = hash(source);
      await fs.writeFile(path.join(outputDir, 'originals', sourceHash), source, { mode: 0o600 });
      const result = await storeCover(source, outputDir);
      Object.assign(entry, result, { status: 'ready' });
      song.coverUrl = result.coverUrl;
    } catch (error) {
      entry.status = 'failed'; entry.reason = error.message;
    }
  }
  if (hash(await fs.readFile(path.join(baseDir, 'data.json'))) !== hash(bytes)) throw new Error('准备期间数据已变化，请保留此包并重新准备');
  const candidate = Buffer.from(JSON.stringify(data, null, 2) + '\n');
  await fs.writeFile(path.join(outputDir, 'candidate-data.json'), candidate, { mode: 0o600 });
  const manifest = { version: 1, createdAt: new Date().toISOString(), dataHash: hash(bytes), candidateHash: hash(candidate), entries };
  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  await verify(baseDir, outputDir);
  return manifest;
}

async function verify(baseDir, outputDir) {
  const manifest = JSON.parse(await fs.readFile(path.join(outputDir, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1) throw new Error('不支持的迁移包版本');
  const original = await fs.readFile(path.join(outputDir, 'original-data.json'));
  const candidate = await fs.readFile(path.join(outputDir, 'candidate-data.json'));
  if (hash(original) !== manifest.dataHash || hash(candidate) !== manifest.candidateHash) throw new Error('数据备份或候选数据校验失败');
  if (hash(await fs.readFile(path.join(baseDir, 'data.json'))) !== manifest.dataHash) throw new Error('当前数据已变化，禁止使用旧候选数据覆盖');
  const expected = JSON.parse(original);
  const seen = new Set();
  for (const entry of manifest.entries) {
    if (seen.has(entry.id)) throw new Error('清单包含重复歌曲');
    seen.add(entry.id);
    const song = expected.music.find(item => item.id === entry.id);
    if (!song || (song.coverUrl ?? null) !== entry.originalUrl) throw new Error('原引用核验失败');
    if (entry.status !== 'ready') continue;
    if (!/^[a-f0-9]{64}$/.test(entry.sourceHash) || !/^[a-f0-9]{64}$/.test(entry.outputHash)
        || entry.coverUrl !== `${COVER_PREFIX}${entry.outputHash}.webp`) throw new Error('封面文件或引用格式错误');
    const before = await fs.readFile(path.join(outputDir, 'originals', entry.sourceHash));
    const after = await fs.readFile(path.join(outputDir, 'public', 'music', 'covers', `${entry.outputHash}.webp`));
    if (hash(before) !== entry.sourceHash || hash(after) !== entry.outputHash) throw new Error('封面哈希核验失败');
    const metadata = await sharp(after).metadata();
    await sharp(after).raw().toBuffer();
    if (metadata.format !== 'webp' || metadata.width !== entry.after.width || metadata.height !== entry.after.height
        || metadata.width > 640 || metadata.height > 640 || after.length !== entry.after.bytes || before.length !== entry.before.bytes) throw new Error('封面尺寸或体积核验失败');
    song.coverUrl = entry.coverUrl;
  }
  if (JSON.stringify(expected) !== JSON.stringify(JSON.parse(candidate))) throw new Error('候选数据包含封面引用之外的修改');
  return manifest;
}

async function main(args) {
  const allowed = new Set(['--base', '--out', '--hostname', '--prepare', '--verify']);
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!allowed.has(key) || options[key] !== undefined) throw new Error(`未知或重复参数：${key}`);
    options[key] = ['--prepare', '--verify'].includes(key) ? true : args[++index];
    if (!options[key] || String(options[key]).startsWith('--')) throw new Error(`参数缺少值：${key}`);
  }
  const base = path.resolve(options['--base'] || path.join(__dirname, '..'));
  if (options['--prepare'] && options['--verify']) throw new Error('prepare 和 verify 不能同时使用');
  if (!options['--prepare'] && !options['--verify']) {
    const { data } = await inventory(base);
    console.log(JSON.stringify({ mode: 'inventory', songs: data.music.length,
      explicitCovers: data.music.filter(song => song.coverUrl).length,
      message: '未下载或修改数据。使用 --prepare --out <新目录> 生成迁移包；使用 --verify --out <目录> 核验。' }, null, 2));
    return;
  }
  if (!options['--out']) throw new Error('必须指定 --out 迁移包目录');
  const output = path.resolve(options['--out']);
  const manifest = options['--prepare'] ? await prepare(base, output, options['--hostname'] || '') : await verify(base, output);
  console.log(JSON.stringify({ mode: options['--prepare'] ? 'prepared' : 'verified', output,
    ready: manifest.entries.filter(entry => entry.status === 'ready').length,
    skipped: manifest.entries.filter(entry => entry.status === 'skipped').length,
    failed: manifest.entries.filter(entry => entry.status === 'failed').length }, null, 2));
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { prepare, verify };
