function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production'
    || String(process.env.BBZG_ENV || '').toLowerCase() === 'production';
}

function createErrorId() {
  return `E${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
}

function sanitizeLogValue(value) {
  const text = String(value == null ? '' : value);
  return text
    // Bearer 必须先处理，避免 Authorization: Bearer xxx 被拆成 Authorization:*** + 明文 token
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer ***')
    .replace(/(accessKeySecret|password|loginPassword|token|authorization|cookie|session)([\"'\s:=]+)([^,\"'\s}]+)/gi, '$1$2***')
    .replace(/(access[_-]?key[_-]?id|access[_-]?key[_-]?secret|api[_-]?key|secret)([\"'\s:=]+)([^,\"'\s}]+)/gi, '$1$2***');
}

function logSafe(level, message, detail) {
  const fn = console[level] || console.log;
  if (detail == null) {
    fn(message);
    return;
  }
  if (typeof detail === 'string') {
    fn(message, sanitizeLogValue(detail));
    return;
  }
  if (detail && detail.message) {
    fn(message, sanitizeLogValue(detail.message));
    return;
  }
  try {
    fn(message, sanitizeLogValue(JSON.stringify(detail)));
  } catch {
    fn(message);
  }
}

function publicErrorPayload(message, error, options = {}) {
  const errorId = createErrorId();
  const includeDetail = options.includeDetail != null ? options.includeDetail : !isProduction();
  const payload = {
    success: false,
    message,
    errorId
  };
  if (includeDetail && error) {
    payload.error = error && error.message ? String(error.message) : String(error);
  }
  return payload;
}

module.exports = {
  isProduction,
  createErrorId,
  sanitizeLogValue,
  logSafe,
  publicErrorPayload
};
