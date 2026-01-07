# 巴布之光庆祝系统 (BBZG)

这是一个专为电商团队设计的实时询盘计数器和成交庆祝系统，支持多用户成交音乐配置、语音播报、动画效果和数据统计功能。

## 项目架构

### 技术栈
- **后端**: Node.js + Express.js
- **前端**: HTML5 + CSS3 + JavaScript (原生)
- **数据存储**: JSON文件本地存储
- **文件上传**: Multer
- **图片处理**: Sharp
- **语音合成**: 阿里云TTS + Web Speech API
- **定时任务**: node-cron
- **会话管理**: express-session

### 系统架构

#### 后端架构 (server.js)
```
├── 认证系统
│   ├── 登录验证 (/login)
│   ├── 会话管理 (express-session)
│   └── API权限控制
├── 核心API
│   ├── 询盘管理 (/api/inquiries/*)
│   ├── 成交管理 (/api/deals/*)
│   ├── 用户管理 (/api/users/*)
│   └── 音乐管理 (/api/music/*)
├── 文件处理
│   ├── 音乐文件上传
│   ├── 用户头像处理 (Sharp图片裁剪)
│   └── LRC歌词文件处理
├── 语音服务
│   ├── 阿里云TTS集成
│   ├── 语音配置管理
│   └── TTS文件缓存和清理
└── 数据管理
    ├── JSON文件存储 (data.json)
    ├── 数据备份机制
    └── 历史记录管理
```

#### 前端架构
```
public/
├── 页面文件
│   ├── index.html (主显示页面)
│   ├── admin.html (管理后台)
│   └── login.html (登录页面)
├── JavaScript模块
│   ├── 核心模块
│   │   ├── main.js (主页面逻辑)
│   │   ├── init.js (初始化)
│   │   ├── data.js (数据获取)
│   │   └── animation.js (动画效果)
│   ├── 音频系统
│   │   ├── audioSystem.js (音频系统初始化)
│   │   ├── musicPlayer.js (音乐播放器)
│   │   └── sound.js (音效处理)
│   ├── 显示模块
│   │   ├── leaderboard.js (排行榜)
│   │   └── tv-display.js (TV显示适配)
│   └── 管理后台
│       ├── admin-init.js (后台初始化)
│       ├── admin-users.js (用户管理)
│       ├── admin-music.js (音乐管理)
│       ├── admin-tts.js (TTS配置)
│       └── admin-celebration.js (庆祝语管理)
├── 样式文件
│   ├── style.css (主页面样式)
│   ├── admin.css (管理后台样式)
│   ├── leaderboard.css (排行榜样式)
│   └── tv-display.css (TV显示样式)
└── 资源文件
    ├── images/ (图片资源)
    └── music/ (音乐和音效文件)
```

### 数据结构 (data.json)
```json
{
  "inquiryCount": 询盘总数,
  "dealAmount": 成交总金额,
  "users": [用户列表],
  "music": [音乐文件列表],
  "celebrationMessages": [庆祝语模板],
  "inquiryConfig": {询盘音效配置},
  "defaultBattleSong": {默认战歌配置},
  "voiceConfig": {语音播报配置},
  "aliyunTtsConfig": {阿里云TTS配置},
  "targets": {目标设置},
  "inquiriesHistory": [询盘历史记录],
  "dealsHistory": [成交历史记录]
}
```

## 功能特点

### 核心功能
- ✅ **实时询盘计数**: 支持增加/减少询盘数量，带动画效果
- ✅ **成交金额统计**: 实时显示成交总金额和增长动画
- ✅ **用户成交音乐**: 每个用户可配置专属成交音乐
- ✅ **语音播报**: 成交时自动播放庆祝语音
- ✅ **庆祝动画**: 全屏庆祝动画效果
- ✅ **排行榜显示**: 用户成交排行榜
- ✅ **历史记录**: 询盘和成交历史追踪

### 管理功能
- ✅ **用户管理**: 添加/编辑/删除用户，上传头像
- ✅ **音乐管理**: 上传音乐文件和LRC歌词
- ✅ **庆祝语管理**: 自定义成交庆祝文案模板
- ✅ **TTS配置**: 阿里云语音合成服务配置
- ✅ **目标设置**: 设置询盘和成交目标
- ✅ **数据统计**: 查看各类统计数据

### 显示适配
- ✅ **TV显示优化**: 支持电视浏览器显示
- ✅ **响应式设计**: 适配不同屏幕尺寸
- ✅ **飞视浏览器**: 专门优化TV端显示效果

## 快速开始

### 环境要求
- Node.js 14.0+
- npm 6.0+

### 安装依赖
```bash
npm install
```

### 启动应用
```bash
npm start
```

应用将在 http://localhost:3000 启动。

### 首次使用
1. 访问 http://localhost:3000/login
2. 使用默认账号登录：
   - 用户名: `admin`
   - 密码: `admin`
3. 进入管理后台配置系统

## 使用指南

### 主显示页面
- 访问 http://localhost:3000 查看实时数据
- 显示当前询盘总数和成交金额
- 自动播放成交庆祝动画和音乐
- 显示用户成交排行榜

### 管理系统
访问 http://localhost:3000/admin 进入管理系统：

#### 用户管理
- 添加新用户，设置姓名和职位
- 上传用户头像（支持裁剪）
- 为用户配置专属成交音乐
- 删除不需要的用户

#### 音乐管理
- 上传音乐文件（支持MP3格式）
- 上传LRC歌词文件
- 设置默认战歌
- 配置询盘音效（增加/减少）

#### 庆祝语管理
- 添加自定义庆祝语模板
- 使用占位符：`{person}` `{platform}` `{amount}`
- 删除不需要的庆祝语

#### TTS配置
- 配置阿里云语音合成服务
- 设置语音参数（音色、语速、音量等）
- 测试TTS功能

#### 首页设置
- 设置询盘和成交目标
- 配置目标重置周期
- 手动调整当前数值

## API 接口

### 询盘相关
- `GET /api/inquiries` - 获取询盘数量
- `GET /api/inquiries/add` - 增加询盘（+1）
- `GET /api/inquiries/reduce` - 减少询盘（-1）
- `POST /api/inquiries/set` - 设置询盘数量

### 成交相关
- `GET /api/deals` - 获取成交金额
- `GET /api/deals/add?zongjine=金额&fuzeren=负责人&laiyuanpingtai=平台` - 添加成交记录
- `POST /api/deals/set` - 设置成交金额

### 数据统计
- `GET /api/deals/leaderboard` - 获取成交排行榜
- `GET /api/deals/recent` - 获取最近活动记录
- `GET /api/activities` - 获取活动统计

## 开发指南

### 添加新功能
1. 后端API：在 `server.js` 中添加新的路由
2. 前端逻辑：在 `public/js/` 目录下创建对应模块
3. 样式：在 `public/css/` 目录下添加样式
4. 数据结构：更新 `data.json` 结构定义

### 调试功能
- 使用浏览器控制台调用 `testDealAPI(金额, 负责人, 平台)` 测试成交功能
- 查看 `data.json` 文件了解数据存储情况
- 检查服务器日志排查问题

### 部署注意事项
- 确保 `public/music/` 目录有写入权限
- 配置阿里云TTS服务（可选）
- 定期备份 `data.json` 数据文件
- 建议使用 PM2 等进程管理工具

## 更新日志

### 最新版本特性
- ✅ 支持用户头像上传和裁剪
- ✅ 阿里云TTS语音合成集成
- ✅ 自动TTS文件清理机制
- ✅ TV显示优化和适配
- ✅ 用户成交排行榜
- ✅ 目标设置和进度追踪
- ✅ 庆祝语模板系统

### 已知问题
- TTS文件可能占用较多存储空间（已配置自动清理）
- 大量用户时建议优化数据存储方式
- TV端某些浏览器可能存在兼容性问题

### 规划功能
- 📋 钉钉通讯录集成
- 📋 数据库存储支持
- 📋 多语言支持
- 📋 WebSocket实时推送
- 📋 移动端APP

## 技术支持

如需技术支持或功能定制，请联系开发团队。

---

**项目作者**: 陈驰宇-Achord  
**项目版本**: v2.0.0  
**最后更新**: 2025年5月 