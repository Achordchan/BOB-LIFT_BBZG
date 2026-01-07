function registerDebugRoutes(app) {
  // 诊断端点 - 列出所有注册的路由
  app.get('/api/debug/routes', (req, res) => {
    if (req.session && req.session.loggedIn) {
      const routes = [];

      // 获取Express应用的路由栈
      app._router.stack.forEach((middleware) => {
        if (middleware.route) {
          // 直接路由
          const methods = Object.keys(middleware.route.methods);
          routes.push({
            path: middleware.route.path,
            methods: methods.map(m => m.toUpperCase())
          });
        } else if (middleware.name === 'router') {
          // 路由器中间件
          middleware.handle.stack.forEach((routerMiddleware) => {
            if (routerMiddleware.route) {
              const methods = Object.keys(routerMiddleware.route.methods);
              routes.push({
                path: routerMiddleware.route.path,
                methods: methods.map(m => m.toUpperCase())
              });
            }
          });
        }
      });

      res.json({
        success: true,
        routes: routes.filter(route => route.path.startsWith('/api')),
        serverTime: new Date().toISOString(),
        nodeVersion: process.version
      });
    } else {
      res.status(401).json({ success: false, message: '需要登录才能访问诊断信息' });
    }
  });
}

module.exports = {
  registerDebugRoutes
};
