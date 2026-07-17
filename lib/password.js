const crypto = require('crypto');

const HASH_PREFIX = 'scrypt$';
const KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password || ''), salt, KEYLEN).toString('hex');
  return `${HASH_PREFIX}${salt}$${hash}`;
}

function isHashedPassword(value) {
  return typeof value === 'string' && value.startsWith(HASH_PREFIX);
}

function verifyPassword(password, stored) {
  const raw = String(stored || '');
  const input = String(password || '');
  if (!raw) return false;

  if (isHashedPassword(raw)) {
    const parts = raw.split('$');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const expected = parts[2];
    if (!salt || !expected) return false;
    let actual;
    try {
      actual = crypto.scryptSync(input, salt, KEYLEN).toString('hex');
    } catch {
      return false;
    }
    if (actual.length !== expected.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  // 兼容历史明文密码
  const a = Buffer.from(input);
  const b = Buffer.from(raw);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function needsRehash(stored) {
  return !isHashedPassword(stored);
}

function isDefaultAdminCredentials(username, passwordOrHash, rawPassword) {
  const user = String(username || '');
  if (user !== 'admin') return false;
  if (rawPassword != null) return String(rawPassword) === 'admin';
  return !isHashedPassword(passwordOrHash) && String(passwordOrHash || '') === 'admin';
}

module.exports = {
  hashPassword,
  verifyPassword,
  needsRehash,
  isHashedPassword,
  isDefaultAdminCredentials
};
