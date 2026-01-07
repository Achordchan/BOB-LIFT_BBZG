# BOB-LIFT_BBZG（巴布之光庆祝系统）

面向电商/运营团队的“询盘 + 成交”大屏系统：实时展示询盘数、成交额、目标进度、团队成员与最近动态；成交时支持语音播报（TTS）、庆祝动画与音乐播放；提供管理后台用于配置用户、音乐、庆祝语与目标。

## 页面入口

- 主页面：`/`（大屏展示）
- 登录页：`/login`
- 管理后台：`/admin`
- 健康检查：`/health-check.html`

默认端口：`http://localhost:3000`

## 特性

- 询盘：增加/减少、音效与动效
- 成交：累计成交额、最近成交详情、庆祝语模板、语音播报与音乐
- 团队：用户管理、头像上传处理
- 音乐：上传 MP3、歌词（LRC）、默认战歌
- 大屏：TV 适配、最近动态滚动、平台目标展示/轮播

## 环境要求

- Node.js 14+（建议 18+）
- npm

## 本地启动

```bash
npm install
npm start
```

启动后访问：`http://localhost:3000`

### 首次登录

访问 `http://localhost:3000/login` 使用默认账号登录：

- 用户名：`admin`
- 密码：`admin`

## 仓库内容说明（重要）

本项目运行时会产生本地数据与上传文件。为了避免仓库膨胀/泄露隐私，以下内容**不应提交到 GitHub**（已通过 `.gitignore` 排除）。


## 常用 API（用于集成/触发）

以下接口通常用于外部系统触发（例如工作流、Webhook）。

### 健康检查

- `GET /api/ping`

### 询盘

- `GET /api/inquiries` 获取询盘数
- `GET /api/inquiries/add` 询盘 +1
- `GET /api/inquiries/reduce` 询盘 -1

示例：

```bash
curl "http://localhost:3000/api/inquiries/add"
curl "http://localhost:3000/api/inquiries/reduce"
```

### 成交

- `GET /api/deals` 获取成交总额
- `GET /api/deals/add?zongjine=金额&fuzeren=负责人&laiyuanpingtai=平台` 添加成交记录

示例：

```bash
curl "http://localhost:3000/api/deals/add?zongjine=1000&fuzeren=张三&laiyuanpingtai=阿里巴巴"
```

## TTS（语音播报）

系统支持阿里云 TTS 并会将生成的音频缓存到本地目录，定期清理。

- 需要在管理后台配置阿里云 TTS：AccessKey / AppKey / Secret 等
- 若未配置，成交播报会降级为不生成语音文件（具体表现以页面日志为准）

## 部署建议

### 本地 / NAS

本项目适合在局域网机器长期运行（PC/NAS）。建议使用进程守护（例如 PM2 / systemd / Docker）保证重启自动拉起。

需要确保目录有写入权限：

- `public/music/`（上传音乐、TTS 缓存）

### 安全提示

如果你要把触发接口暴露到公网（例如给外部系统调用），建议额外增加鉴权（例如 token 参数校验、IP 白名单、反向代理认证等），避免被他人刷接口。


