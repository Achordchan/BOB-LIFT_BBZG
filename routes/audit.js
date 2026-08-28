const { readAudit } = require('../lib/audit');

/** 后台「操作日志」只读接口（仅管理员）。 */
function registerAuditRoutes(app, deps) {
  const { requireLogin } = deps || {};

  app.get('/api/audit', requireLogin, (req, res) => {
    try {
      const result = readAudit({
        limit: req.query.limit,
        actor: req.query.actor,
        actorType: req.query.actorType,
        q: req.query.q,
        since: req.query.since,
        until: req.query.until
      });
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ success: false, message: '读取操作日志失败' });
    }
  });
}

module.exports = { registerAuditRoutes };
