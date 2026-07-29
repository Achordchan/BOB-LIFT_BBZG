const fs = require('fs');
const path = require('path');

const MANAGED_AUDIO_PREFIXES = {
  tts: '/music/tts/',
  custom: '/music/custom/'
};

function normalizeManagedAudioPath(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.includes('\0')) return null;

  const match = value.match(/^\/music\/(tts|custom)\/([^/\\]+)$/);
  if (!match) return null;

  const [, kind, filename] = match;
  if (!filename || filename === '.' || filename === '..' || filename.includes('?') || filename.includes('#')) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(filename);
    if (decoded.includes('/') || decoded.includes('\\') || decoded === '.' || decoded === '..') return null;
  } catch {
    return null;
  }

  return `${MANAGED_AUDIO_PREFIXES[kind]}${filename}`;
}

function resolveManagedAudioPath(baseDir, value) {
  const audioPath = normalizeManagedAudioPath(value);
  if (!audioPath) return null;

  const kind = audioPath.startsWith(MANAGED_AUDIO_PREFIXES.tts) ? 'tts' : 'custom';
  const filename = audioPath.slice(MANAGED_AUDIO_PREFIXES[kind].length);
  const root = path.resolve(baseDir, 'public', 'music', kind);
  const filePath = path.resolve(root, filename);
  if (path.dirname(filePath) !== root) return null;

  return { audioPath, kind, filename, root, filePath };
}

function collectReferencedAudioPaths(data) {
  const referenced = new Set();
  const add = (value) => {
    const normalized = normalizeManagedAudioPath(value);
    if (normalized) referenced.add(normalized);
  };

  if (data && data.startupAudio) add(data.startupAudio.audioPath);
  if (data && Array.isArray(data.personalizedAudio)) {
    data.personalizedAudio.forEach((item) => add(item && item.audioPath));
  }
  if (data && data.personalizedFire) add(data.personalizedFire.audioPath);

  return referenced;
}

function scanUnreferencedAudioFiles(baseDir, data) {
  const referenced = collectReferencedAudioPaths(data);
  const items = [];

  for (const kind of Object.keys(MANAGED_AUDIO_PREFIXES)) {
    const root = path.resolve(baseDir, 'public', 'music', kind);
    if (!fs.existsSync(root)) continue;

    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (error) {
      console.error('扫描目录失败:', root, error);
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const audioPath = `${MANAGED_AUDIO_PREFIXES[kind]}${entry.name}`;
      if (referenced.has(audioPath)) continue;

      try {
        const stats = fs.statSync(path.join(root, entry.name));
        items.push({
          audioPath,
          sizeKb: Math.round(stats.size / 1024)
        });
      } catch (_) {}
    }
  }

  return items.sort((a, b) => (b.sizeKb || 0) - (a.sizeKb || 0));
}

async function cleanupExpiredTtsFiles({ baseDir, getData, maxAgeInDays = 7, now = Date.now() }) {
  const result = {
    totalCount: 0,
    deletedCount: 0,
    protectedCount: 0,
    unexpiredCount: 0,
    failedCount: 0
  };
  const root = path.resolve(baseDir, 'public', 'music', 'tts');
  if (!fs.existsSync(root)) return result;

  const cutoffTime = now - (maxAgeInDays * 24 * 60 * 60 * 1000);
  const cleanAll = maxAgeInDays === 0;
  const referencedAtStart = collectReferencedAudioPaths(getData());
  const entries = await fs.promises.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.mp3')) continue;

    result.totalCount++;
    const audioPath = `${MANAGED_AUDIO_PREFIXES.tts}${entry.name}`;
    if (referencedAtStart.has(audioPath)) {
      result.protectedCount++;
      continue;
    }

    const filePath = path.join(root, entry.name);
    let stats;
    try {
      stats = await fs.promises.stat(filePath);
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      result.failedCount++;
      continue;
    }

    if (!cleanAll && stats.mtimeMs >= cutoffTime) {
      result.unexpiredCount++;
      continue;
    }

    try {
      const currentReferences = collectReferencedAudioPaths(getData());
      if (currentReferences.has(audioPath)) {
        result.protectedCount++;
        continue;
      }
      fs.unlinkSync(filePath);
      result.deletedCount++;
    } catch (error) {
      if (!error || error.code !== 'ENOENT') result.failedCount++;
    }
  }

  return result;
}

module.exports = {
  normalizeManagedAudioPath,
  resolveManagedAudioPath,
  collectReferencedAudioPaths,
  scanUnreferencedAudioFiles,
  cleanupExpiredTtsFiles
};
