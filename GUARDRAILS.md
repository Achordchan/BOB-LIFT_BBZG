# Server.js Refactor Guardrails

这份清单的目标只有一个：**Never break userspace（不改变任何用户可见行为）**。

每次你把 `server.js` 拆出一个模块（或移动路由/中间件）后，都按下面顺序做一次验证。

## 1) 语法与加载（30 秒）

在项目根目录执行：

```bash
node --check server.js && node --check routes/*.js
```

预期：无输出、退出码为 0。

## 2) 启动（30 秒）

启动服务（按你现在的方式）：

```bash
npm start
```

预期：
- 服务正常监听端口
- 控制台没有启动时报错

## 3) 登录与会话（1 分钟）

- **未登录访问 `/admin`**：应跳转到 `/login`
- **访问 `/login`**：页面正常显示
- **登录成功后访问 `/admin`**：能进入后台

## 4) 核心页面与聚合接口（1 分钟）

- **主页 `/`**：能打开（前端脚本正常跑）
- **健康检查 `/health-check`**：能打开
- **聚合接口 `GET /api/dashboard`**：返回 `success: true`

## 5) Users（2 分钟）

- **列表**：`GET /api/users` 返回 `success: true` 且 `users` 为数组
- **新增**：后台添加一个用户（验证写入后刷新仍存在）
- **排序**：后台触发一次 `POST /api/users/update-sort`（上/下移动）
- **上传头像**：给一个用户上传半身照/全身照，确认显示正常

## 6) Deals / Inquiries（2 分钟）

- **查询**：
  - `GET /api/deals`
  - `GET /api/deals/latest`
  - `GET /api/inquiries`
  - `GET /api/inquiries/latest`
- **新增**：后台各新增一条，确认首页能反映（音效/动效如原来一样）

## 7) Music / Sound / Default Battle Song（2 分钟）

- **音乐列表**：`GET /api/music` 返回 `success: true`
- **上传音乐**：`POST /api/music/upload`
  - 字段名必须仍然是 `musicFile`
  - 歌词仍支持 `lrcFile` 或 `lrcContent`
- **上传音效**：`POST /api/sound/upload`（字段名必须仍然是 `sound`）
- **默认战歌**：
  - `GET /api/defaultBattleSong/public`
  - 后台上传一次默认战歌，再删除一次

## 8) 诊断与 404（30 秒）

- **诊断路由**：登录后访问 `GET /api/debug/routes`
- **API 404 行为**：请求一个不存在的 `/api/xxx`，应返回 404 JSON（而不是挂死/返回 HTML）

---

## 最小必跑集合（建议每次重构后先跑这个）

1. `node --check server.js && node --check routes/*.js`
2. `npm start` 启动成功 + 打开 `/admin`
3. 后台：上传一个音效 + 访问一次 `GET /api/defaultBattleSong/public`

如果最小集合不过，就不要继续拆下一个模块，先修复。
