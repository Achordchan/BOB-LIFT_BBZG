const express = require('express');
const session = require('express-session');
const path = require('path');

function configureApp(app) {
  // 配置session
  app.use(session({
    secret: 'bbzg-admin-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 } // 1小时过期
  }));
  console.timeLog('启动总时间', 'Session配置完成');

  configureParsers(app);

  // 记录所有API请求
  const apiLogLastTime = new Map();
  app.use('/api/', (req, res, next) => {
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

    const publicReadonly = new Set([
      '/text-to-speech',
      '/aliyun-tts-config',
      '/ping',
      '/dashboard',
      '/page-settings',
      '/users',
      '/deals',
      '/deals/add',
      '/deals/latest',
      '/deals/leaderboard',
      '/deals/recent',
      '/inquiries',
      '/inquiries/add',
      '/inquiries/reduce',
      '/inquiries/latest',
      '/inquiries/config',
      '/targets',
      '/startup-audio',
      '/personalized/fire',
      '/platform-display-settings',
      '/platforms/targets',
      '/defaultBattleSong/public'
    ]);

    const publicWrite = new Set([
      '/deals/add',
      '/inquiries/add',
      '/inquiries/reduce',
      '/text-to-speech'
    ]);

    if ((req.method === 'GET' || req.method === 'HEAD') && publicReadonly.has(p)) {
      next();
      return;
    }

    if (req.method === 'POST' && publicWrite.has(p)) {
      next();
      return;
    }

    if (isAdmin) {
      console.log(`已登录用户访问: ${req.method} ${req.path}`);
      next();
      return;
    }

    console.log(`拒绝未授权访问: ${req.method} ${req.path} - Session:`, req.session);
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
  app.use(express.static('public'));
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
