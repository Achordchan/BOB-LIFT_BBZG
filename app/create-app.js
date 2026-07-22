const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { createFileSessionStore } = require('../lib/session-file-store');
const { verifyExternalWriteToken } = require('../lib/external-write-token');
const FileStore = createFileSessionStore(session);

function configureApp(app) {
  // 配置session
  const sessionSecret = String(process.env.BBZG_SESSION_SECRET || process.env.SESSION_SECRET || '').trim();
  if (!sessionSecret) {
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (isProd) {
      throw new Error('生产环境必须设置 BBZG_SESSION_SECRET 或 SESSION_SECRET');
    }
    console.warn('警告: 未设置 BBZG_SESSION_SECRET，使用开发默认密钥；生产环境必须配置独立密钥');
  }
  const cookieSecure = String(process.env.BBZG_COOKIE_SECURE || '').trim() === '1'
    || String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const sameSite = String(process.env.BBZG_COOKIE_SAMESITE || 'lax').toLowerCase();
  const trustProxy = String(process.env.BBZG_TRUST_PROXY || '').trim();
  const trustProxyLower = trustProxy.toLowerCase();
  if (trustProxy === '1' || trustProxyLower === 'true') {
    app.set('trust proxy', 1);
  } else if (trustProxy && /^\d+$/.test(trustProxy) && Number(trustProxy) >= 1) {
    // hop 数必须 >= 1；0 等价于不信任反代，生产 Secure Cookie 会失效
    app.set('trust proxy', Number(trustProxy));
  }

  const sessionDir = String(process.env.BBZG_SESSION_DIR || path.join(process.cwd(), 'storage', 'sessions')).trim();
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
  } catch (error) {
    console.warn('创建 session 目录失败，将继续尝试 FileStore:', sessionDir, error && error.message);
  }
  app.use(session({
    secret: sessionSecret || 'bbzg-dev-only-change-me',
    resave: false,
    saveUninitialized: false,
    name: 'bbzg.sid',
    store: (() => {
      const store = new FileStore({
        path: sessionDir,
        ttl: 3600,
        retries: 1,
        logFn: function () {}
      });
      // 跨重启清理过期 session，不阻塞启动
      if (typeof store.purgeExpired === 'function') {
        store.purgeExpired((err) => {
          if (err && process.env.BBZG_API_LOG === '1') {
            console.warn('清理过期 session 失败:', err.message || err);
          }
        });
      }
      return store;
    })(),
    cookie: {
      maxAge: 3600000, // 1小时过期
      httpOnly: true,
      sameSite: ['lax', 'strict', 'none'].includes(sameSite) ? sameSite : 'lax',
      secure: cookieSecure
    }
  }));
  if (process.env.BBZG_PROFILE_STARTUP === '1') {
    try { console.timeLog('启动总时间', 'Session配置完成'); } catch (_) {}
  }

  configureParsers(app);

  // 记录所有API请求
  const apiLogLastTime = new Map();
  const enableApiLog = process.env.BBZG_API_LOG === '1';
  app.use('/api/', (req, res, next) => {
    if (!enableApiLog) {
      next();
      return;
    }

    const logKey = `${req.method} ${req.path}`;
    const now = Date.now();
    const isHighFreqGet = req.method === 'GET' && (
      req.path === '/deals' ||
      req.path === '/inquiries' ||
      req.path === '/inquiries/latest' ||
      req.path === '/deals/latest' ||
      req.path === '/targets'
    );

    if (isHighFreqGet) {
      const last = apiLogLastTime.get(logKey) || 0;
      if (now - last >= 30000) {
        apiLogLastTime.set(logKey, now);
        console.log(`API请求: ${req.method} ${req.path} - ${new Date().toISOString()}`);
      }
    } else {
      console.log(`API请求: ${req.method} ${req.path} - ${new Date().toISOString()}`);
    }
    next();
  });

  // 保护所有API接口，需要登录
  app.use('/api/', (req, res, next) => {
    const isAdmin = !!(req.session && req.session.loggedIn);
    const isEgg = !!(req.session && req.session.eggUserId);
    const rawPath = String(req.path || '');
    const p = rawPath.replace(/\/+$/g, '') || '/';

    if (p === '/egg/login') {
      next();
      return;
    }
    if (p.startsWith('/egg/')) {
      if (isEgg || isAdmin) {
        next();
      } else {
        res.status(401).json({ success: false, message: '未授权访问' });
      }
      return;
    }

    if (p.startsWith('/public/music/')) {
      if (isEgg || isAdmin) {
        next();
      } else {
        res.status(401).json({ success: false, message: '未授权访问' });
      }
      return;
    }

    // 公开只读接口（不含任何写操作路径）
    const publicReadonly = new Set([
      '/text-to-speech',
      '/aliyun-tts-config',
      '/ping',
      '/health',
      '/dashboard',
      '/stream/main',
      '/page-settings',
      '/users',
      '/deals',
      '/deals/latest',
      '/deals/leaderboard',
      '/deals/recent',
      '/inquiries',
      '/inquiries/latest',
      '/inquiries/config',
      '/targets',
      '/startup-audio',
      '/personalized/fire',
      '/platform-display-settings',
      '/platforms/targets',
      '/themes/active',
      '/defaultBattleSong/public'
    ]);

    // 大屏公开 POST：严格限流在路由内完成，不与成交/询盘写凭证混用
    const publicAnonymousPost = new Set([
      '/text-to-speech'
    ]);

    // 业务写入入口：允许 token / 管理员会话（不含 TTS）
    const publicWrite = new Set([
      '/deals/add',
      '/inquiries/add',
      '/inquiries/reduce'
    ]);

    if ((req.method === 'GET' || req.method === 'HEAD') && publicReadonly.has(p)) {
      next();
      return;
    }

    if (req.method === 'POST' && publicAnonymousPost.has(p)) {
      next();
      return;
    }

    function adminMustChangePassword() {
      const getData = typeof app.get === 'function' ? app.get('bbzgGetData') : null;
      if (typeof getData !== 'function') return false;
      try {
        const data = getData();
        const admin = data && data.admin ? data.admin : null;
        return !!(admin && admin.mustChangePassword);
      } catch (_) {
        return false;
      }
    }

    function rejectIfMustChangePassword() {
      if (!isAdmin || !adminMustChangePassword()) return false;
      const allowed = new Set([
        '/admin/profile',
        '/admin/account',
        '/change-password',
        '/logout',
        '/health',
        '/ping'
      ]);
      if (allowed.has(p)) return false;
      res.status(403).json({
        success: false,
        message: '请先修改默认密码后再使用后台功能',
        mustChangePassword: true
      });
      return true;
    }

    const getData = typeof app.get === 'function' ? app.get('bbzgGetData') : null;
    const connectorToken = String(
      (typeof req.get === 'function' ? req.get('x-bbzg-write-token') : '')
      || (req.query && req.query.token)
      || ''
    ).trim();
    let connectorAuthorized = false;
    if (connectorToken && typeof getData === 'function') {
      try {
        connectorAuthorized = verifyExternalWriteToken(getData(), connectorToken);
      } catch (_) {
        connectorAuthorized = false;
      }
    }
    const writeMethodAllowed = req.method === 'POST' || req.method === 'GET';
    if (writeMethodAllowed && publicWrite.has(p)) {
      // 管理员在强制改密期间不能通过会话绕过写入口
      if (rejectIfMustChangePassword()) return;
      if (isAdmin) {
        next();
        return;
      }
      if (connectorAuthorized) {
        req.bbzgExternalWriteAuthorized = true;
        next();
        return;
      }
      res.status(401).json({
        success: false,
        message: '未授权访问：请在后台生成并绑定外部接口 Token'
      });
      return;
    }

    if (isAdmin) {
      if (rejectIfMustChangePassword()) return;
      if (process.env.BBZG_API_LOG === '1') {
        console.log(`已登录用户访问: ${req.method} ${req.path}`);
      }
      next();
      return;
    }

    if (process.env.BBZG_API_LOG === '1') {
      console.log(`拒绝未授权访问: ${req.method} ${req.path}`);
    }
    res.status(401).json({ success: false, message: '未授权访问' });
  });
}

function configureParsers(app) {
  if (app.__bbzgParsersConfigured) return;
  app.__bbzgParsersConfigured = true;
  configureJsonParser(app);
  configureUrlencodedParser(app);
}

function configureStatic(app, baseDir) {
  if (app.__bbzgStaticConfigured) return;
  app.__bbzgStaticConfigured = true;
  configureStaticPublic(app);
  configureStaticMusic(app, baseDir);
}

function configureJsonParser(app) {
  if (app.__bbzgJsonParserConfigured) return;
  app.__bbzgJsonParserConfigured = true;
  app.use(express.json());
}

function configureUrlencodedParser(app) {
  if (app.__bbzgUrlencodedParserConfigured) return;
  app.__bbzgUrlencodedParserConfigured = true;
  app.use(express.urlencoded({ extended: true }));
}

function configureStaticPublic(app) {
  if (app.__bbzgStaticPublicConfigured) return;
  app.__bbzgStaticPublicConfigured = true;
  app.use(express.static('public', { index: false }));
}

function configureStaticMusic(app, baseDir) {
  if (app.__bbzgStaticMusicConfigured) return;
  app.__bbzgStaticMusicConfigured = true;
  app.use('/music', express.static(path.join(baseDir, 'public', 'music')));
}

module.exports = {
  configureApp,
  configureParsers,
  configureStatic,
  configureJsonParser,
  configureUrlencodedParser,
  configureStaticPublic,
  configureStaticMusic
};
