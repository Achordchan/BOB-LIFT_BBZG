const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const {
  configureApp,
  configureJsonParser,
  configureUrlencodedParser,
  configureStaticPublic,
  configureStaticMusic
} = require('./app/create-app');
const { getData: getDataFromStore, saveData: saveDataFromStore } = require('./lib/data-store');
const { createInitialData } = require('./lib/data-bootstrap');
const { createUpload } = require('./services/uploads');
const { registerAudioPlaybackRoutes } = require('./routes/audio-playback');
const { registerInquiryRoutes } = require('./routes/inquiries');
const { registerDealRoutes } = require('./routes/deals');
const { registerUserRoutes } = require('./routes/users');
const { registerMusicRoutes } = require('./routes/music');
const { registerTtsRoutes } = require('./routes/tts');
const { registerPlatformTargetsRoutes } = require('./routes/platform-targets');
const { registerTargetsRoutes } = require('./routes/targets');
const { registerCelebrationRoutes } = require('./routes/celebration');
const { registerDebugRoutes } = require('./routes/debug');
const { registerAuthRoutes } = require('./routes/auth');
const { registerPlatformDisplaySettingsRoutes } = require('./routes/platform-display-settings');
const { registerPageSettingsRoutes } = require('./routes/page-settings');
const { registerMiscRoutes } = require('./routes/misc');
const { registerPublicMusicRoutes } = require('./routes/public-music');
const { registerEggRoutes } = require('./routes/egg');

// 添加性能诊断日志
console.time('启动总时间');
console.log('开始加载服务器...');

const app = express();
const PORT = process.env.PORT || 3000;

function parseDealAmountInput(input) {
  const raw = (input == null ? '' : String(input)).trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/[，]/g, ',')
    .replace(/[\s￥¥]/g, '')
    .replace(/,/g, '');
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}

function formatDealAmountForTts(input, amountNumber) {
  const rawNum = Number.isFinite(amountNumber) ? amountNumber : parseDealAmountInput(input);
  if (!Number.isFinite(rawNum) || rawNum <= 0) return '0.00';
  // 仅去掉分隔符，保留小数点（统一两位）
  return rawNum.toFixed(2);
}
console.timeLog('启动总时间', 'Express实例化完成');

// 配置session
configureApp(app);

// 数据存储路径
const DATA_PATH = path.join(__dirname, 'data.json');
console.log('开始读取数据文件...');
console.time('数据文件读取时间');

// 配置 multer 用于文件上传
const upload = createUpload(__dirname);

// 初始化数据文件
if (!fs.existsSync(DATA_PATH)) {
  console.log('数据文件不存在，创建初始数据文件...');
  console.time('初始化数据文件时间');
  fs.writeFileSync(DATA_PATH, JSON.stringify(createInitialData(uuidv4)));
  console.timeEnd('初始化数据文件时间');
  console.log('初始数据文件创建完成');
} else {
  console.log('数据文件已存在，路径:', DATA_PATH);
}
console.timeEnd('数据文件读取时间');

// 读取数据
function getData() {
  return getDataFromStore(DATA_PATH);
}

// 保存数据
function saveData(data) {
  return saveDataFromStore(DATA_PATH, data);
}

registerAudioPlaybackRoutes(app, {
  requireLogin,
  upload,
  getData,
  saveData,
  uuidv4,
  baseDir: __dirname
});

registerInquiryRoutes(app, {
  getData,
  saveData
});

registerDealRoutes(app, {
  getData,
  saveData,
  uuidv4,
  getUserMusicConfig,
  parseDealAmountInput,
  formatDealAmountForTts
});

registerUserRoutes(app, {
  getData,
  saveData,
  uuidv4,
  upload,
  baseDir: __dirname
});

registerMusicRoutes(app, {
  requireLogin,
  upload,
  getData,
  saveData,
  uuidv4,
  baseDir: __dirname
});

registerTtsRoutes(app, {
  requireLogin,
  getData,
  saveData,
  baseDir: __dirname,
  parseDealAmountInput,
  formatDealAmountForTts
});

registerPlatformTargetsRoutes(app, {
  getData,
  saveData,
  uuidv4
});

registerTargetsRoutes(app, {
  getData,
  saveData
});

registerCelebrationRoutes(app, {
  getData,
  saveData,
  uuidv4
});

registerDebugRoutes(app);

registerAuthRoutes(app, {
  getData,
  saveData,
  baseDir: __dirname,
  requireLogin
});

registerPlatformDisplaySettingsRoutes(app, {
  dataPath: DATA_PATH
});

registerPageSettingsRoutes(app, {
  dataPath: DATA_PATH
});

registerPublicMusicRoutes(app);

registerEggRoutes(app, {
  getData,
  saveData,
  uuidv4,
  baseDir: __dirname
});

// 获取用户音乐配置
function getUserMusicConfig(userId) {
  const data = getData();
  const user = data.users.find(user => user.id === userId);
  
  if (!user || !user.musicId) {
    return null;
  }
  
  const music = data.music.find(m => m.id === user.musicId);
  if (music) {
    return {
      user,
      music
    };
  }
  
  return null;
}

// 服务静态文件
configureStaticPublic(app);
// 服务音频文件
configureStaticMusic(app, __dirname);

// 解析 JSON 请求体
configureJsonParser(app);
// 解析表单数据
configureUrlencodedParser(app);

registerMiscRoutes(app, {
  getData
});

// 验证中间件
function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
}

// 健康检查页面（不需要登录）
app.get('/health-check', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'health-check.html'));
});

// 彩蛋页面（不需要登录）
app.get('/egg-music', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'egg-music.html'));
});

// 提供主页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404处理器 - 放在所有路由之后
app.use('/api/*', (req, res) => {
  console.log(`API 404错误: ${req.method} ${req.originalUrl}`);

  const baseAvailableEndpoints = [
    'GET /api/users',
    'POST /api/users/update-sort',
    'GET /api/platforms/targets',
    'POST /api/platforms/targets',
    'GET /api/platform-display-settings',
    'POST /api/platform-display-settings',
    'GET /api/debug/routes'
  ];

  const dynamicApiEndpoints = [];
  try {
    if (app && app._router && Array.isArray(app._router.stack)) {
      app._router.stack.forEach((middleware) => {
        if (middleware && middleware.route && middleware.route.path) {
          const methods = Object.keys(middleware.route.methods || {});
          methods.forEach((method) => {
            const endpoint = `${String(method).toUpperCase()} ${middleware.route.path}`;
            if (middleware.route.path && String(middleware.route.path).startsWith('/api')) {
              dynamicApiEndpoints.push(endpoint);
            }
          });
        } else if (middleware && middleware.name === 'router' && middleware.handle && Array.isArray(middleware.handle.stack)) {
          middleware.handle.stack.forEach((routerMiddleware) => {
            if (routerMiddleware && routerMiddleware.route && routerMiddleware.route.path) {
              const methods = Object.keys(routerMiddleware.route.methods || {});
              methods.forEach((method) => {
                const endpoint = `${String(method).toUpperCase()} ${routerMiddleware.route.path}`;
                if (routerMiddleware.route.path && String(routerMiddleware.route.path).startsWith('/api')) {
                  dynamicApiEndpoints.push(endpoint);
                }
              });
            }
          });
        }
      });
    }
  } catch (_) {
  }

  const seen = new Set();
  const availableEndpoints = [];
  baseAvailableEndpoints.forEach((e) => {
    if (!seen.has(e)) {
      seen.add(e);
      availableEndpoints.push(e);
    }
  });
  dynamicApiEndpoints.forEach((e) => {
    if (!seen.has(e)) {
      seen.add(e);
      availableEndpoints.push(e);
    }
  });

  res.status(404).json({
    success: false,
    message: `API端点不存在: ${req.method} ${req.originalUrl}`,
    availableEndpoints
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.timeEnd('启动总时间');
  console.log(`服务器运行在 http://localhost:${PORT}`);
});