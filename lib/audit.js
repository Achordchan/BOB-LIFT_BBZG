'use strict';

/**
 * 操作/审计日志：记录“谁、何时、做了什么业务动作”。
 *
 * - 存储：storage/audit/audit.jsonl（追加式，一行一条 JSON），部署 rsync 排除 storage/ 故不丢；
 *   超过上限自动切割并保留有限份数，避免无限增长。
 * - 采集：全局中间件按白名单在响应完成时落库，不需逐一改动业务路由；
 *   也可用 recordAudit(req, ...) 在关键成功点显式补记。
 * - 详情经 sanitizeLogValue 脱敏。
 */

const fs = require('fs');
const path = require('path');
const { sanitizeLogValue } = require('./safe-error');
const { getClientIp } = require('./request-ip');

const AUDIT_DIR = String(process.env.BBZG_AUDIT_DIR || path.join(process.cwd(), 'storage', 'audit')).trim();
const AUDIT_FILE = path.join(AUDIT_DIR, 'audit.jsonl');
const MAX_BYTES = Number(process.env.BBZG_AUDIT_MAX_BYTES || 50 * 1024 * 1024);
const KEEP_ARCHIVES = Math.max(1, Number(process.env.BBZG_AUDIT_KEEP || 5));
const READ_TAIL_BYTES = 2 * 1024 * 1024; // 读取时最多扫尾部 2MB

function ensureDir() {
  try { fs.mkdirSync(AUDIT_DIR, { recursive: true }); } catch (_) { /* ignore */ }
}

function resolveActor(req) {
  const s = (req && req.session) || {};
  if (s.loggedIn) return { actor: String(s.adminUsername || 'admin'), actorType: 'admin' };
  if (s.eggUserId) return { actor: String(s.eggUsername || s.eggUserId), actorType: 'staff' };
  if (req && req.bbzgExternalWriteAuthorized) return { actor: 'external-token', actorType: 'connector' };
  return { actor: 'anonymous', actorType: 'anon' };
}

function rotateIfNeeded() {
  try {
    const st = fs.statSync(AUDIT_FILE);
    if (st.size < MAX_BYTES) return;
  } catch (_) {
    return; // 文件不存在，无需切割
  }
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.renameSync(AUDIT_FILE, path.join(AUDIT_DIR, `audit-${stamp}.jsonl`));
    // 清理超出保留数的历史归档
    const archives = fs.readdirSync(AUDIT_DIR)
      .filter((n) => /^audit-.*\.jsonl$/.test(n))
      .sort();
    while (archives.length > KEEP_ARCHIVES) {
      const old = archives.shift();
      try { fs.unlinkSync(path.join(AUDIT_DIR, old)); } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }
}

/** 追加一条审计记录 */
function writeAudit(record) {
  ensureDir();
  rotateIfNeeded();
  const entry = {
    ts: record.ts || new Date().toISOString(),
    actor: record.actor || 'anonymous',
    actorType: record.actorType || 'anon',
    action: record.action || '未知操作',
    target: record.target != null ? sanitizeLogValue(String(record.target)).slice(0, 200) : '',
    detail: record.detail != null ? sanitizeLogValue(String(record.detail)).slice(0, 500) : '',
    ip: record.ip || 'unknown',
    method: record.method || '',
    // 路径可能带查询串（外部连接器用 ?token=... 写入），必须脱敏后再落库
    path: record.path != null ? sanitizeLogValue(String(record.path)).slice(0, 300) : '',
    status: record.status != null ? Number(record.status) : null,
    requestId: record.requestId || ''
  };
  try {
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    process.stderr.write(`写入审计日志失败: ${error && error.message}\n`);
  }
  return entry;
}

/** 显式补记（在路由成功点调用），自动带上操作人/IP/requestId */
function recordAudit(req, action, options = {}) {
  const who = resolveActor(req);
  return writeAudit({
    actor: who.actor,
    actorType: who.actorType,
    action,
    target: options.target,
    detail: options.detail,
    ip: (() => { try { return getClientIp(req); } catch (_) { return 'unknown'; } })(),
    method: req && req.method,
    path: req && (req.originalUrl || req.path),
    status: options.status,
    requestId: req && req.id
  });
}

/** 读取审计记录（尾部扫描 + 过滤 + 最新在前） */
function readAudit(query = {}) {
  const limit = Math.min(2000, Math.max(1, Number(query.limit) || 300));
  const actor = String(query.actor || '').trim().toLowerCase();
  const actorType = String(query.actorType || '').trim().toLowerCase();
  const q = String(query.q || '').trim().toLowerCase();
  const since = query.since ? Date.parse(String(query.since)) : NaN;
  const until = query.until ? Date.parse(String(query.until)) : NaN;

  // 读取当前文件；不足预算时继续向更早的归档回溯，
  // 避免刚轮转后后台只剩寥寥几条、历史记录查不到
  function readFileTail(file, budget) {
    try {
      const st = fs.statSync(file);
      const start = Math.max(0, st.size - budget);
      const len = st.size - start;
      if (len <= 0) return '';
      const fd = fs.openSync(file, 'r');
      try {
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, start);
        let text = buf.toString('utf8');
        if (start > 0) { const nl = text.indexOf('\n'); if (nl >= 0) text = text.slice(nl + 1); }
        return text;
      } finally { fs.closeSync(fd); }
    } catch (_) {
      return '';
    }
  }

  let raw = readFileTail(AUDIT_FILE, READ_TAIL_BYTES);
  let budget = READ_TAIL_BYTES - Buffer.byteLength(raw, 'utf8');
  if (budget > 0) {
    let archives = [];
    try {
      archives = fs.readdirSync(AUDIT_DIR)
        .filter((n) => /^audit-.*\.jsonl$/.test(n))
        .sort()
        .reverse(); // 文件名含时间戳，倒序即最近的归档在前
    } catch (_) { archives = []; }
    for (const name of archives) {
      if (budget <= 0) break;
      const chunk = readFileTail(path.join(AUDIT_DIR, name), budget);
      if (!chunk) continue;
      raw = chunk.endsWith('\n') ? chunk + raw : chunk + '\n' + raw; // 更早的记录排在前面
      budget -= Buffer.byteLength(chunk, 'utf8');
    }
  }

  const rows = raw.split(/\r?\n/).filter(Boolean);
  let entries = rows.map((line) => { try { return JSON.parse(line); } catch (_) { return null; } }).filter(Boolean);
  const scanned = entries.length;

  if (actor) entries = entries.filter((e) => String(e.actor || '').toLowerCase().includes(actor));
  if (actorType) entries = entries.filter((e) => String(e.actorType || '').toLowerCase() === actorType);
  if (!Number.isNaN(since)) entries = entries.filter((e) => Date.parse(e.ts) >= since);
  if (!Number.isNaN(until)) entries = entries.filter((e) => Date.parse(e.ts) <= until);
  if (q) entries = entries.filter((e) => `${e.action} ${e.target} ${e.detail} ${e.actor} ${e.path}`.toLowerCase().includes(q));

  entries.reverse(); // 最新在前
  return { entries: entries.slice(0, limit), scanned };
}

// ── 白名单：把变更类端点映射为可读的业务动作 ─────────────────────────
// 有意不纳入审计的端点：
//   /api/audio-cleanup/scan、/api/personalized/list —— 只读查询，不改数据；
//   /api/netease/qr/create —— 仅生成二维码，真正的授权成功已在路由内显式补记；
//   /api/test-aliyun-tts —— 连通性测试，不产生业务变更；
//   /api/text-to-speech、/text-to-speech —— 大屏高频播报生成，纳入会淹没审计轨迹。
function pick(body, keys) {
  if (!body || typeof body !== 'object') return '';
  const parts = [];
  for (const k of keys) {
    const v = body[k];
    if (v == null || v === '') continue;
    const text = typeof v === 'object' ? '[对象]' : String(v);
    parts.push(`${k}=${text.slice(0, 60)}`);
    if (parts.length >= 4) break;
  }
  return parts.join(' ');
}

const AUDIT_RULES = [
  // 登录 / 账号安全（登录失败也记录）
  { m: 'POST', re: /^\/login\/?$/, action: '登录后台', detail: (r) => pick(r.body, ['username', 'account']), always: true, success: (r) => !!(r.session && r.session.loggedIn) },
  { m: 'POST', re: /^\/api\/change-password\/?$/, action: '修改后台密码' },
  { m: 'POST', re: /^\/api\/admin\/account\/?$/, action: '修改后台账号' },
  { m: 'DELETE', re: /^\/api\/admin\/sessions\/[^/]+\/?$/, action: '注销后台会话' },
  { m: 'GET', re: /^\/logout\/?$/, action: '退出后台', always: true },
  { m: 'POST', re: /^\/api\/admin\/external-write-token\/regenerate\/?$/, action: '重置外部接口 Token' },
  { m: 'POST', re: /^\/api\/egg\/login\/?$/, action: '员工端登录', always: true, success: (r) => !!(r.session && r.session.eggUserId) },
  { m: 'POST', re: /^\/api\/egg\/logout\/?$/, action: '员工端登出' },
  { m: 'POST', re: /^\/api\/egg\/change-password\/?$/, action: '员工修改密码' },
  // 成交 / 询盘
  { m: 'POST', re: /^\/api\/deals\/add\/?$/, action: '录入成交', detail: (r) => pick(r.body, ['fuzeren', 'salesperson', 'name', 'zongjine', 'amount', 'platform']) },
  // 外部连接器（钉钉等）使用的 GET 写入口同样会改动业务数据，必须审计
  { m: 'GET', re: /^\/api\/deals\/add\/?$/, action: '录入成交', detail: (r) => pick(r.query, ['fuzeren', 'salesperson', 'name', 'zongjine', 'amount', 'platform']) },
  { m: 'POST', re: /^\/api\/deals\/set\/?$/, action: '校准成交', detail: (r) => pick(r.body, ['amount']) },
  { m: 'POST', re: /^\/api\/inquiries\/add\/?$/, action: '新增询盘', detail: (r) => pick(r.body, ['platform', 'count']) },
  { m: 'POST', re: /^\/api\/inquiries\/reduce\/?$/, action: '询盘减少', detail: (r) => pick(r.body, ['platform', 'count']) },
  { m: 'GET', re: /^\/api\/inquiries\/add\/?$/, action: '新增询盘', detail: (r) => pick(r.query, ['platform', 'count']) },
  { m: 'GET', re: /^\/api\/inquiries\/reduce\/?$/, action: '询盘减少', detail: (r) => pick(r.query, ['platform', 'count']) },
  { m: 'POST', re: /^\/api\/inquiries\/set\/?$/, action: '校准询盘', detail: (r) => pick(r.body, ['count']) },
  { m: 'POST', re: /^\/api\/inquiries\/config\/?$/, action: '修改询盘配置' },
  // 目标 / 平台
  { m: 'POST', re: /^\/api\/targets\/?$/, action: '修改经营目标' },
  { m: 'POST', re: /^\/api\/platforms\/targets\/?$/, action: '修改平台目标' },
  { m: 'POST', re: /^\/api\/platforms\/reset\/?$/, action: '重置平台进度' },
  { m: 'POST', re: /^\/api\/platform-display-settings\/?$/, action: '修改平台展示' },
  // 成员
  { m: 'POST', re: /^\/api\/users\/add\/?$/, action: '新增成员', detail: (r) => pick(r.body, ['name', 'loginUsername']) },
  { m: 'PUT', re: /^\/api\/users\/update\/[^/]+\/?$/, action: '编辑成员' },
  { m: 'DELETE', re: /^\/api\/users\/delete\/[^/]+\/?$/, action: '删除成员' },
  { m: 'POST', re: /^\/api\/users\/update-sort\/?$/, action: '调整成员排序' },
  { m: 'POST', re: /^\/api\/users\/config\/?$/, action: '修改用户配置' },
  { m: 'POST', re: /^\/api\/users\/[^/]+\/photo\/?$/, action: '更新成员照片' },
  // 音频
  { m: 'POST', re: /^\/api\/music\/upload\/?$/, action: '上传音乐' },
  { m: 'POST', re: /^\/api\/music\/update\/?$/, action: '编辑音乐' },
  { m: 'DELETE', re: /^\/api\/music\/delete\/[^/]+\/?$/, action: '删除音乐' },
  { m: 'POST', re: /^\/api\/music\/import-netease\/?$/, action: '导入网易云音乐', detail: (r) => pick(r.body, ['name', 'neteaseId']) },
  { m: 'POST', re: /^\/api\/sound\/upload\/?$/, action: '上传音效' },
  { m: 'POST', re: /^\/api\/defaultBattleSong\/select\/?$/, action: '设置默认战歌' },
  { m: 'POST', re: /^\/api\/defaultBattleSong\/upload\/?$/, action: '上传并设为默认战歌' },
  { m: 'DELETE', re: /^\/api\/defaultBattleSong\/delete\/?$/, action: '移除默认战歌' },
  // 个性化音频：新增/上传/删除均改动配置，发射是面向大屏的运营动作
  { m: 'POST', re: /^\/api\/personalized\/add\/?$/, action: '新增个性化音频', detail: (r) => pick(r.body, ['name', 'source']) },
  { m: 'POST', re: /^\/api\/personalized\/upload\/?$/, action: '上传个性化音频' },
  { m: 'DELETE', re: /^\/api\/personalized\/delete\/[^/]+\/?$/, action: '删除个性化音频' },
  { m: 'POST', re: /^\/api\/personalized\/fire\/?$/, action: '推送个性化音频到首页', detail: (r) => pick(r.body, ['audioPath']) },
  // 文件维护：会真实删除磁盘音频
  { m: 'POST', re: /^\/api\/audio-cleanup\/delete\/?$/, action: '删除可清理音频', detail: (r) => pick(r.body, ['audioPath']) },
  { m: 'POST', re: /^\/api\/cleanup-tts-files\/?$/, action: '清理 TTS 文件' },
  // 员工端设置个人播报音乐
  { m: 'POST', re: /^\/api\/egg\/set-broadcast-music\/?$/, action: '员工设置播报音乐', detail: (r) => pick(r.body, ['musicId', 'name']) },
  { m: 'POST', re: /^\/api\/egg\/set-broadcast-from-netease\/?$/, action: '员工从网易云设置播报', detail: (r) => pick(r.body, ['neteaseId', 'name']) },
  { m: 'POST', re: /^\/api\/startup-audio\/upload\/?$/, action: '上传启动音频' },
  // 保存启动音频配置（切换系统默认 / 音乐库 / TTS）也会持久化变更，需审计
  { m: 'POST', re: /^\/api\/startup-audio\/?$/, action: '保存启动音频配置', detail: (r) => pick(r.body, ['mode', 'audioPath']) },
  // 主题 / 文案 / 庆祝语
  { m: 'POST', re: /^\/api\/themes\/activate\/?$/, action: '切换首页主题', detail: (r) => pick(r.body, ['theme', 'id', 'key']) },
  { m: 'POST', re: /^\/api\/page-settings\/?$/, action: '修改页面文案' },
  { m: 'POST', re: /^\/api\/celebration-messages\/add\/?$/, action: '新增庆祝语' },
  { m: 'DELETE', re: /^\/api\/celebration-messages\/[^/]+\/?$/, action: '删除庆祝语' },
  // TTS / 网易云授权
  { m: 'POST', re: /^\/api\/aliyun-tts-config\/?$/, action: '修改 TTS 配置' },
  { m: 'POST', re: /^\/api\/netease\/cookie\/?$/, action: '手动设置网易云 Cookie' },
  { m: 'DELETE', re: /^\/api\/netease\/cookie\/?$/, action: '清除网易云授权' }
];

function matchRule(method, urlPath) {
  const p = String(urlPath || '').split('?')[0];
  for (const rule of AUDIT_RULES) {
    if (rule.m === method && rule.re.test(p)) return rule;
  }
  return null;
}

/** 全局审计中间件：响应完成时按白名单落库 */
function auditMiddleware() {
  return function auditMiddlewareHandler(req, res, next) {
    const rule = matchRule(req.method, req.path);
    if (!rule) return next();

    // 记录进入时的操作人（用于登出等会话在处理中被清空的场景）
    const startActor = resolveActor(req);
    // 在处理器改动 body 之前，先算好 detail（部分处理器会清洗/覆盖 body）
    let detail = '';
    try { detail = typeof rule.detail === 'function' ? rule.detail(req) : ''; } catch (_) { detail = ''; }

    res.on('finish', () => {
      const status = res.statusCode;
      // 登录等重定向类动作用会话判定成败；其余按状态码
      const ok = typeof rule.success === 'function'
        ? !!rule.success(req, res)
        : (status >= 200 && status < 400);
      if (!ok && !rule.always) return; // 默认只记成功的变更

      const finishActor = resolveActor(req);
      const who = finishActor.actorType !== 'anon' ? finishActor : startActor;
      let ip = 'unknown';
      try { ip = getClientIp(req); } catch (_) { /* ignore */ }

      writeAudit({
        actor: who.actor,
        actorType: who.actorType,
        action: rule.action + (ok ? '' : '（失败）'),
        detail,
        ip,
        method: req.method,
        path: req.originalUrl || req.path,
        status,
        requestId: req.id
      });
    });
    next();
  };
}

module.exports = {
  writeAudit,
  recordAudit,
  readAudit,
  auditMiddleware,
  auditDir: AUDIT_DIR,
  auditFile: AUDIT_FILE
};
