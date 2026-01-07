# BOB-LIFT_BBZG（BBZG）

一个给电商团队用的“询盘计数 + 成交播报 + 战歌庆祝”本地系统。

你要的效果就两点：

- **数据立刻变**（询盘/成交立刻更新到大屏）
- **播报立刻响**（成交后马上走“队列→TTS→音乐→弹窗”）

本项目是 **Node.js + Express + 纯静态前端**，数据用本地 `data.json` 存储，适合本地电脑或 NAS 运行。

## 页面入口

- `GET /`：主大屏（`public/index.html`）
- `GET /login`：登录页
- `GET /admin`：管理后台（需要登录）
- `GET /health-check.html`：健康检查页面
- `GET /egg-music.html`：彩蛋页面（需要 egg 会话或管理员）

## 鉴权模型（非常重要）

默认规则：

- **所有 `/api/*` 默认需要管理员登录**（Session：`req.session.loggedIn`）
- 为了让首页/TV 能“未登录也能展示”，在 `app/create-app.js` 里维护了一个 **public 白名单**

### public 只读（未登录允许 GET/HEAD）

首页/TV 会用到的典型接口：

- `GET /api/ping`
- `GET /api/dashboard`（主轮询接口）
- `GET /api/page-settings`
- `GET /api/platform-display-settings`
- `GET /api/platforms/targets`
- `GET /api/deals/recent`
- `GET /api/deals/leaderboard`
- `GET /api/defaultBattleSong/public`

### public 写入（未登录允许 POST）

成交播报链路需要 TTS：

- `POST /api/text-to-speech`

### public 写入（未登录允许 GET）

为了方便“外部系统触发”（例如扫码枪/工作流），本项目保留了以下 GET 写入：

- `GET /api/deals/add`（添加成交）
- `GET /api/inquiries/add`（询盘 +1）
- `GET /api/inquiries/reduce`（询盘 -1）

注意：以上 GET 写入接口**等同于“公开按钮”**，如果你要暴露到公网，务必加 token/签名校验。

## 播报链路（成交为什么能“排队”）

成交检测发生在前端：

- `/api/dashboard` 返回 `dealAmount` 和 `latestDeal`
- 前端在 `public/js/data.js` 的 `applyDealSnapshot()` 里检测到 `dealAmount` 增加
- 检测到增加后：
  - 优先调用 `window.addToQueue()`（队列系统，`public/js/dealQueue.js`）
  - 队列逐条处理：`showDealAnimation()`（`public/js/animation.js`）
  - `showDealAnimation()` 会先等语音播报（`public/js/sound.js`）：
    - 调 `POST /api/text-to-speech` 拿到 MP3（或复用缓存）
    - 播放 TTS
  - TTS 结束后播放音乐（用户专属音乐或默认战歌）并显示庆祝框

## 轮询策略（为什么能即时播报但不刷爆系统）

分两类：

### 1）播报关键数据（高频）

`public/js/init.js` 的 `startMainPolling()`：

- `GET /api/dashboard`：**前台约 1 秒一次**
- 页面后台（`document.hidden`）会自动降频（至少 30 秒）
- 切回前台会通过 `visibilitychange` 立即触发一次刷新

这条链路决定“播报是否即时”。

### 2）配置类数据（低频）

- `GET /api/page-settings`：在 `leaderboard.js` 做了 **60 秒节流**（并且 focus 强制刷新）
- `GET /api/platform-display-settings`：在 `platform-targets.js` **60 秒检查一次**

## 本地运行

### 环境要求

- Node.js 14+

### 安装 / 启动

```bash
npm install
npm start
```

启动后访问：

- `http://localhost:3000/`
- `http://localhost:3000/login`
- `http://localhost:3000/admin`

### 默认管理员

第一次启动会在 `data.json` 里自动生成管理员账号：

- 用户名：`admin`
- 密码：`admin`

登录后请尽快在管理后台修改密码。

## 仓库卫生（GitHub 必读）

本项目运行时会生成/上传大量文件，仓库只应该保存“代码 + 必要静态资源”。

### 不入库（运行时数据 / 隐私 / 大文件）

- `data.json`
- `public/music/`（除内置基础音效外）
- `public/music/tts/`（TTS 缓存）
- `public/music/custom/`（用户上传的音乐）
- `public/images/users/`（用户头像，通常有隐私）

以上已由 `.gitignore` 排除。

## 常用 API（给外部触发用）

### 询盘

- `GET /api/inquiries` 获取
- `GET /api/inquiries/add` +1
- `GET /api/inquiries/reduce` -1

### 成交

- `GET /api/deals` 获取总额
- `GET /api/deals/add?zongjine=1000&fuzeren=张三&laiyuanpingtai=阿里巴巴&userName=张三`

### 播报相关

- `POST /api/text-to-speech`（前端用于生成/复用 TTS MP3）
- `GET /api/defaultBattleSong/public`（前端获取默认战歌配置）

## 部署提示（NAS / 局域网）

- 确保 `public/music/` 可写（上传音乐、生成 TTS 都在这里）
- `data.json` 是数据库，记得定期备份
- 要长期运行建议用 PM2 或 Docker
