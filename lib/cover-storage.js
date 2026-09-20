const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const sharp = require('sharp');
const { normalizeMusicCover } = require('./music-cover');
const { downloadRemoteCover } = require('./remote-cover');

const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_OPTIONS = { limitInputPixels: 40 * 1000 * 1000, failOn: 'warning' };
const COVER_PREFIX = '/music/covers/';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function readCoverFile(file) {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || !stat.size || stat.size > MAX_BYTES) throw new Error('封面必须为 5 MB 以内的图片');
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const result = await handle.read(bytes, size, bytes.length - size, null);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    if (size > MAX_BYTES) throw new Error('封面超过 5 MB');
    return bytes.subarray(0, size);
  } finally { await handle.close(); }
}

async function readCoverSource(value, { baseDir, hostname = '', request } = {}) {
  let url = normalizeMusicCover(value, hostname);
  if (!url) throw new Error('封面地址无效');
  const parsed = new URL(url, 'https://cover-resource.invalid');
  if (['/api/public/music/bilibili/image', '/api/public/music/cover-image'].includes(parsed.pathname)) {
    url = parsed.searchParams.get('url') || '';
    // 解包后仍由统一下载器执行公网校验，不能请求本站或任意内部 API。
    return downloadRemoteCover(url, hostname, { request });
  }
  if (/^https?:\/\//.test(url)) return downloadRemoteCover(url, hostname, { request });
  let requested = parsed.pathname === '/api/public/music/local-cover' ? parsed.searchParams.get('path') : decodeURIComponent(parsed.pathname);
  if (!requested || !requested.startsWith('/') || requested.startsWith('//') || /[\\\u0000-\u001f]/.test(requested)
      || /^\/api(?:\/|$)/i.test(requested)) throw new Error('封面地址不是本地图片');
  const root = await fs.realpath(path.join(baseDir, 'public'));
  const file = await fs.realpath(path.resolve(root, `.${requested}`));
  if (!file.startsWith(root + path.sep)) throw new Error('封面路径越界');
  return readCoverFile(file);
}

async function convertCover(bytes) {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('封面必须为 5 MB 以内的图片');
  const before = await sharp(bytes, IMAGE_OPTIONS).metadata();
  if (!['jpeg', 'png', 'webp', 'avif', 'heif', 'gif', 'tiff'].includes(before.format)) throw new Error('不支持的封面图片格式');
  if ((before.pages || 1) > 1) throw new Error('不转换动态或多页封面，避免改变展示行为');
  let output = await sharp(bytes, IMAGE_OPTIONS).rotate()
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 }).toBuffer();
  // 合规 WebP 不重复有损压缩；仍执行完整解码核验。
  if (before.format === 'webp' && before.width <= 640 && before.height <= 640 && !before.orientation) output = bytes;
  const decoded = await sharp(output, IMAGE_OPTIONS).raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(output, IMAGE_OPTIONS).metadata();
  if (after.format !== 'webp' || decoded.info.width > 640 || decoded.info.height > 640) throw new Error('WebP 转换核验失败');
  return { bytes: output, before: { format: before.format, width: before.width, height: before.height, bytes: bytes.length },
    after: { format: 'webp', width: after.width, height: after.height, bytes: output.length }, sourceHash: hash(bytes), outputHash: hash(output) };
}

async function storeCover(bytes, baseDir) {
  const result = await convertCover(bytes);
  const dir = path.join(baseDir, 'public', 'music', 'covers');
  await fs.mkdir(dir, { recursive: true });
  const filename = `${result.outputHash}.webp`;
  const destination = path.join(dir, filename);
  const temporary = path.join(dir, `.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, result.bytes, { flag: 'wx' });
    if (hash(await fs.readFile(temporary)) !== result.outputHash) throw new Error('封面写入核验失败');
    await fs.rename(temporary, destination);
  } finally { await fs.rm(temporary, { force: true }); }
  const { bytes: _, ...report } = result;
  return { ...report, coverUrl: COVER_PREFIX + filename };
}

async function importCover(value, options) {
  const original = normalizeMusicCover(value, options.hostname);
  if (!original) return { coverUrl: '' };
  try {
    const result = await storeCover(await readCoverSource(original, options), options.baseDir);
    return { coverUrl: result.coverUrl, coverOriginalUrl: original, coverOptimization: { status: 'ready', ...result } };
  } catch (error) {
    // 封面失败不能使已经下载的歌曲不可用；保存原因供运维重试和迁移核验。
    return { coverUrl: original, coverOptimization: { status: 'failed', message: error.message } };
  }
}

module.exports = { readCoverFile, readCoverSource, convertCover, storeCover, importCover, hash, COVER_PREFIX };
