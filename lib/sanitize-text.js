function sanitizeBusinessText(value, options = {}) {
  const maxLength = Number(options.maxLength) > 0 ? Number(options.maxLength) : 64;
  const fallback = options.fallback == null ? '' : String(options.fallback);
  let text = value == null ? '' : String(value);
  text = text
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return fallback;
  if (text.length > maxLength) text = text.slice(0, maxLength).trim();
  return text || fallback;
}

function sanitizeDealPerson(value) {
  return sanitizeBusinessText(value, { maxLength: 32, fallback: '匿名' });
}

function sanitizeDealPlatform(value) {
  return sanitizeBusinessText(value, { maxLength: 40, fallback: '未知平台' });
}

module.exports = {
  sanitizeBusinessText,
  sanitizeDealPerson,
  sanitizeDealPlatform
};
