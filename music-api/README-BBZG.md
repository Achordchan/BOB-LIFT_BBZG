# BBZG 内部网易云音乐 API

来源：Suxiaoqinx/Netease_url，MIT License。

部署位置：`/www/wwwroot/netease_music_api`

Cookie 文件：`/www/wwwroot/netease_music_api/cookie.txt`（由后台自动读写，一般无需手工编辑）

服务只监听 `127.0.0.1:5000`，由 `bbzg_app` 后端内部调用，不直接对公网开放。

## 安全：管理令牌（推荐启用）

仅监听 loopback 并不等于“管理员”——同机其他账号/进程也能访问 loopback。
授权与 Cookie 管理端点（`/qrlogin/*`、`/cookie/*`）支持共享令牌鉴权：

1. 生成令牌：`openssl rand -hex 32`
2. 音乐服务（Python 项目环境变量）设 `NETEASE_ADMIN_TOKEN=<令牌>`
   （或部署时用 `MUSIC_API_ADMIN_TOKEN` 注入；已存在的项目需在宝塔面板手动加）
3. Node 后端（宝塔 Node 项目环境变量）设 `BBZG_NETEASE_ADMIN_TOKEN=<同一令牌>`

两侧一致后，Node 代理会带上 `X-Netease-Admin-Token`，音乐服务校验通过才放行；
未配置时保持向后兼容（仅 loopback 保护，并在启动日志给出告警）。

## 授权方式（推荐：后台扫码）

进入后台「音频中心 → 音乐管理 → 网易云授权」卡片：

- **扫码登录**：点击后展示二维码，用网易云音乐 APP 扫码并在手机确认，登录态会自动写入 `cookie.txt`，实时生效、随时可换。
- **手动粘贴 Cookie**：应急用，粘贴至少包含 `MUSIC_U` 的 Cookie 字符串即可。
- **清除授权**：一键登出并清空 Cookie（清除/覆盖前会自动备份）。

后台通过 `bbzg_app` 代理调用本服务的以下内部接口：

```
POST /qrlogin/create   # 生成二维码（返回 unikey 与二维码图片 data URI）
GET  /qrlogin/check    # 轮询扫码状态，成功时写入 cookie（801 等待/802 已扫/803 成功/800 过期）
GET  /cookie/status    # 查询当前授权状态
POST /cookie/set       # 手动写入 cookie
POST /cookie/clear     # 清除 cookie（登出）
```

## 手工维护（可选）

如需绕过后台直接维护，把网易云 Cookie 粘贴到 `cookie.txt` 后执行：

```bash
systemctl restart bbzg-netease-api
curl -fsS http://127.0.0.1:5000/health
```

> 说明：网易云鉴权只依赖 `MUSIC_U`，扫码登录也仅产出该字段，因此授权有效性以 `MUSIC_U` 为准。
