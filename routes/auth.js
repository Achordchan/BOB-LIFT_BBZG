const path = require('path');
const express = require('express');
const { hashPassword, verifyPassword, needsRehash, isDefaultAdminCredentials } = require('../lib/password');
const { createRateLimiter } = require('../lib/rate-limit');
const { getClientIp } = require('../lib/request-ip');

function registerAuthRoutes(app, deps) {
  const { getData, saveData, baseDir, requireLogin } = deps;
  const adminAppDir = path.join(baseDir, 'public', 'admin-app');
  const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8, blockMs: 15 * 60 * 1000 });

  function ensureAdmin(data) {
    if (!data.admin) {
      data.admin = {
        username: 'admin',
        password: hashPassword('admin'),
        mustChangePassword: true
      };
    }
    if (!Object.prototype.hasOwnProperty.call(data.admin, 'mustChangePassword')) {
      data.admin.mustChangePassword = isDefaultAdminCredentials(data.admin.username, data.admin.password);
    }
    return data.admin;
  }

  function addOperationLog(data, req, action, detail) {
    data.adminOperationLogs = Array.isArray(data.adminOperationLogs) ? data.adminOperationLogs : [];
    data.adminOperationLogs.unshift({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      action,
      detail,
      ip: getClientIp(req),
      userAgent: String(req.headers['user-agent'] || ''),
      createdAt: new Date().toISOString()
    });
    data.adminOperationLogs = data.adminOperationLogs.slice(0, 80);
  }

  app.use('/admin-app', requireLogin, express.static(adminAppDir, {
    maxAge: '1y',
    immutable: true
  }));

  // 登录页面
  app.get('/login', (req, res) => {
    res.sendFile(path.join(baseDir, 'public', 'login.html'));
  });

  // 登录处理
  app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const ip = getClientIp(req) || 'unknown';
    const rateKey = `admin-login:${ip}:${String(username || '').trim().toLowerCase()}`;
    const limited = loginLimiter.check(rateKey);
    if (!limited.allowed) {
      res.redirect('/login?error=locked');
      return;
    }

    const data = getData();
    const admin = ensureAdmin(data);
    const inputUsername = String(username || '').trim();
    const inputPassword = String(password || '');

    if (inputUsername === admin.username && verifyPassword(inputPassword, admin.password)) {
      const shouldRehash = needsRehash(admin.password);
      const forceChange = isDefaultAdminCredentials(admin.username, admin.password, inputPassword);
      const adminUsername = admin.username;

      const finalize = () => {
        // regenerate / 异步之后重新读取，避免覆盖登录期间的并发写入
        const latest = getData();
        const latestAdmin = ensureAdmin(latest);
        if (shouldRehash) {
          latestAdmin.password = hashPassword(inputPassword);
        }
        if (forceChange) {
          latestAdmin.mustChangePassword = true;
        }
        req.session.loggedIn = true;
        req.session.adminUsername = adminUsername;
        addOperationLog(latest, req, '登录后台', `账号 ${adminUsername} 登录成功`);
        saveData(latest);
        loginLimiter.success(rateKey);
        if (latestAdmin.mustChangePassword) {
          res.redirect('/admin?page=system&forcePassword=1');
          return;
        }
        res.redirect('/admin');
      };

      if (typeof req.session.regenerate === 'function') {
        req.session.regenerate((err) => {
          if (err) {
            console.error('session regenerate failed:', err);
            res.redirect('/login?error=1');
            return;
          }
          finalize();
        });
      } else {
        finalize();
      }
    } else {
      loginLimiter.fail(rateKey);
      res.redirect('/login?error=1');
    }
  });

  app.get('/api/admin/profile', requireLogin, (req, res) => {
    const data = getData();
    const admin = ensureAdmin(data);
    const includeLogs = String(req.query.logs || '') === '1';
    res.json({
      success: true,
      username: admin.username,
      role: '管理员',
      mustChangePassword: !!admin.mustChangePassword,
      operationLogs: includeLogs && Array.isArray(data.adminOperationLogs) ? data.adminOperationLogs.slice(0, 30) : []
    });
  });

  app.post('/api/admin/account', requireLogin, (req, res) => {
    const { username, currentPassword, newPassword } = req.body || {};
    const nextUsername = String(username || '').trim();
    const nextPassword = String(newPassword || '');

    if (!nextUsername) {
      return res.status(400).json({ success: false, message: '请输入账号名称' });
    }
    if (!currentPassword) {
      return res.status(400).json({ success: false, message: '请输入当前密码' });
    }
    if (nextPassword && nextPassword.length < 6) {
      return res.status(400).json({ success: false, message: '新密码至少 6 位' });
    }

    const data = getData();
    const admin = ensureAdmin(data);
    if (!verifyPassword(String(currentPassword || ''), admin.password)) {
      return res.status(400).json({ success: false, message: '当前密码不正确' });
    }

    const changes = [];
    if (nextUsername !== admin.username) {
      changes.push(`账号由 ${admin.username} 改为 ${nextUsername}`);
      admin.username = nextUsername;
    }
    if (nextPassword) {
      admin.password = hashPassword(nextPassword);
      admin.mustChangePassword = false;
      changes.push('登录密码已更新');
    }
    if (!changes.length) {
      return res.json({ success: true, message: '账号信息未变化' });
    }

    addOperationLog(data, req, '修改账号密码', changes.join('；'));
    saveData(data);
    res.json({ success: true, message: '账号信息已更新', username: admin.username });
  });

  // 修改管理员密码
  app.post('/api/change-password', (req, res) => {
    // 确保用户已登录
    if (!req.session || !req.session.loggedIn) {
      return res.status(401).json({
        success: false,
        message: '未授权访问'
      });
    }

    const { currentPassword, newPassword } = req.body;

    // 验证参数
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '请提供当前密码和新密码'
      });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: '新密码至少 6 位'
      });
    }

    const data = getData();

    const admin = ensureAdmin(data);

    // 验证当前密码
    if (!verifyPassword(String(currentPassword || ''), admin.password)) {
      return res.status(400).json({
        success: false,
        message: '当前密码不正确'
      });
    }

    // 更新密码
    admin.password = hashPassword(String(newPassword || ''));
    admin.mustChangePassword = false;
    addOperationLog(data, req, '修改账号密码', '登录密码已更新');
    saveData(data);

    res.json({
      success: true,
      message: '密码修改成功'
    });
  });

  // 登出
  app.get('/logout', (req, res) => {
    if (req.session && req.session.loggedIn) {
      const data = getData();
      const admin = ensureAdmin(data);
      addOperationLog(data, req, '退出后台', `账号 ${admin.username} 退出登录`);
      saveData(data);
    }
    req.session.destroy();
    res.redirect('/login');
  });

  // 提供新版 React 管理后台，需要登录。
  app.get(['/admin', '/admin/*'], requireLogin, (req, res) => {
    res.sendFile(path.join(adminAppDir, 'index.html'));
  });
}

module.exports = {
  registerAuthRoutes
};
