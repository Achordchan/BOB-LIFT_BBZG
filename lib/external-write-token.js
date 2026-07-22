const crypto = require('crypto');

const TOKEN_PREFIX = 'bbzg_';

function hashExternalWriteToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function createExternalWriteToken() {
  const token = `${TOKEN_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;
  const updatedAt = new Date().toISOString();
  return {
    token,
    record: {
      tokenHash: hashExternalWriteToken(token),
      tokenPreview: `${TOKEN_PREFIX}••••${token.slice(-6)}`,
      updatedAt
    }
  };
}

function verifyExternalWriteToken(data, token) {
  const record = data && data.externalWriteAccess;
  const expected = record && typeof record.tokenHash === 'string' ? record.tokenHash : '';
  const rawToken = String(token || '').trim();
  if (!expected || !rawToken) return false;
  const actual = hashExternalWriteToken(rawToken);
  if (actual.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function getExternalWriteTokenStatus(data) {
  const record = data && data.externalWriteAccess;
  const configured = !!(record && typeof record.tokenHash === 'string' && record.tokenHash.length === 64);
  return {
    configured,
    preview: configured ? String(record.tokenPreview || '') : '',
    updatedAt: configured ? String(record.updatedAt || '') : null,
    parameterName: 'token',
    parameterLocation: 'Query'
  };
}

module.exports = {
  createExternalWriteToken,
  getExternalWriteTokenStatus,
  hashExternalWriteToken,
  verifyExternalWriteToken
};
