const path = require('path');

function registerAuthRoutes(app, deps) {
  const { getData, saveData, baseDir, requireLogin } = deps;

  // 登录页面
  app.get('/login', (req, res) => {
    res.sendFile(path.join(baseDir, 'public', 'login.html'));
  });

  // 登录处理
  app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // 获取数据，检查是否有管理员配置
    const data = getData();
    if (!data.admin) {
      // 如果没有管理员配置，创建默认的
      data.admin = {
        username: 'admin',
        password: 'admin'
      };
      saveData(data);
    }

    // 使用管理员配置验证登录
    if (username === data.admin.username && password === data.admin.password) {
      req.session.loggedIn = true;
      res.redirect('/admin');
    } else {
      res.redirect('/login?error=1');
    }
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

    // 确保管理员配置存在
    if (!data.admin) {
      data.admin = {
        username: 'admin',
        password: 'admin'
      };
    }

    // 验证当前密码
    if (currentPassword !== data.admin.password) {
      return res.status(400).json({
        success: false,
        message: '当前密码不正确'
      });
    }

    // 更新密码
    data.admin.password = newPassword;
    saveData(data);

    res.json({
      success: true,
      message: '密码修改成功'
    });
  });

  // 登出
  app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
  });

  // 提供管理页面，需要登录
  app.get('/admin', requireLogin, (req, res) => {
    res.sendFile(path.join(baseDir, 'public', 'admin.html'));
  });
}

module.exports = {
  registerAuthRoutes
};
