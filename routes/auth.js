const path = require('path');
const express = require('express');

function registerAuthRoutes(app, deps) {
  const { getData, saveData, baseDir, requireLogin } = deps;
  const adminAppDir = path.join(baseDir, 'public', 'admin-app');

  function ensureAdmin(data) {
    if (!data.admin) {
      data.admin = {
        username: 'admin',
        password: 'admin'
      };
    }
    return data.admin;
  }

  function getClientIp(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || req.socket.remoteAddress || '';
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

    // 获取数据，检查是否有管理员配置
    const data = getData();
    const admin = ensureAdmin(data);

    // 使用管理员配置验证登录
    if (username === admin.username && password === admin.password) {
      req.session.loggedIn = true;
      addOperationLog(data, req, '登录后台', `账号 ${admin.username} 登录成功`);
      saveData(data);
      res.redirect('/admin');
    } else {
      res.redirect('/login?error=1');
    }
  });

  app.get('/api/admin/profile', requireLogin, (req, res) => {
    const data = getData();
    const admin = ensureAdmin(data);
    res.json({
      success: true,
      username: admin.username,
      role: '管理员',
      operationLogs: Array.isArray(data.adminOperationLogs) ? data.adminOperationLogs.slice(0, 30) : []
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
    if (currentPassword !== admin.password) {
      return res.status(400).json({ success: false, message: '当前密码不正确' });
    }

    const changes = [];
    if (nextUsername !== admin.username) {
      changes.push(`账号由 ${admin.username} 改为 ${nextUsername}`);
      admin.username = nextUsername;
    }
    if (nextPassword) {
      admin.password = nextPassword;
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

    const data = getData();

    const admin = ensureAdmin(data);

    // 验证当前密码
    if (currentPassword !== admin.password) {
      return res.status(400).json({
        success: false,
        message: '当前密码不正确'
      });
    }

    // 更新密码
    admin.password = newPassword;
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
