const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function proxyLocalCover(req, res, options = {}) {
  let handle;
  try {
    const requested = decodeURIComponent(String(req.query.path || ''));
    if (!requested.startsWith('/') || requested.startsWith('//') || /[\\\u0000-\u001f]/.test(requested)) throw new Error('无效路径');
    const root = await fs.promises.realpath(options.publicDir || path.join(__dirname, '../public'));
    const candidate = path.resolve(root, `.${requested}`);
    if (!candidate.startsWith(root + path.sep)) throw new Error('越界路径');
    const file = await fs.promises.realpath(candidate);
    if (!file.startsWith(root + path.sep)) throw new Error('越界文件');
    handle = await fs.promises.open(file, 'r');
    const stat = await handle.stat();
    const max = 5 * 1024 * 1024;
    if (!stat.isFile() || !stat.size || stat.size > max) throw new Error('文件不可用');
    const buffer = Buffer.alloc(max + 1);
    let size = 0;
    while (size < buffer.length) {
      const result = await handle.read(buffer, size, buffer.length - size, null);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    if (size > max) throw new Error('文件过大');
    const image = buffer.subarray(0, size);
    const metadata = await sharp(image, { limitInputPixels: 40 * 1000 * 1000 }).metadata();
    const types = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', heif: 'image/heif', tiff: 'image/tiff' };
    const type = types[metadata.format];
    if (!type) throw new Error('不是支持的图片');
    res.set({ 'Content-Type': type, 'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.send(image);
  } catch (_) {
    if (!res.destroyed) res.status(404).json({ success: false, message: '本地封面不存在或不是有效图片' });
  } finally { await handle?.close(); }
}

module.exports = { proxyLocalCover };
