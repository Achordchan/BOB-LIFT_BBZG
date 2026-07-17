function getClientIp(req, options = {}) {
  const trustProxy = options.trustProxy != null
    ? Boolean(options.trustProxy)
    : (String(process.env.BBZG_TRUST_PROXY || '').trim() === '1'
      || String(process.env.BBZG_TRUST_PROXY || '').toLowerCase() === 'true'
      || /^\d+$/.test(String(process.env.BBZG_TRUST_PROXY || '').trim()));

  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return (req.socket && req.socket.remoteAddress) || req.ip || 'unknown';
}

module.exports = {
  getClientIp
};
