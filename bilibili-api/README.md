# 哔哩哔哩音频接入

后台显示网易云歌曲图片与 B 站视频封面，导入后保存封面地址；旧网易云导入记录若仍有来源 ID，会按需补取歌曲图片。封面写入和返回记录时均校验：本地地址统一按站点根路径规范化，随后只通过文件接口读取 public 下的真实图片，不执行该地址对应的路由；校验真实路径、越界符号链接、大小和图片格式。业务 API、登录/退出等入口不能作为封面。历史自定义远程 HTTP(S) 图片（包括无扩展名和图片变换 URL）保留来源地址，但浏览器只通过本站图片代理取得字节；代理不携带会话凭据，逐跳拒绝本站、内网及非公网 DNS 结果，并固定已验证地址进行连接。本站绝对静态地址转为相对路径，脚本协议、凭据 URL 和业务写入口会被过滤。

后台“音乐资产 → 在线导入”和 `/egg-music` 均可选择“哔哩哔哩”。支持关键词搜索、试听、拖动播放进度、下载 MP3，以及导入音乐库 / 设为个人播报。网易云保留原入口和歌词能力。多 P 视频默认使用第一 P；B 站不提供歌词，因此搜索结果不显示歌词按钮。

## 本地运行

需要 Python 3.9+ 和支持 libmp3lame 的 FFmpeg。Python 仅使用标准库，不新增 pip 依赖；Node 显式依赖 ipaddr.js 2.5.0，用于公网 IP 地址分类，避免手写 IPv4/IPv6 安全规则；FFmpeg 用于真正的音频转码，不能省略。在项目根目录的单独终端启动：

```sh
python3 -B bilibili-api/server.py
```

原 Node 服务继续使用 `./start.sh`。Python 服务只监听 `127.0.0.1:5001`，端口冲突直接报错，不自动换端口。停止时在对应终端按 Ctrl+C。

服务首次启动在 `storage/bilibili/api-token` 生成随机鉴权令牌，Node 从同一路径读取；不要将它写进前端或提交 Git。Cookie 保存在 `storage/bilibili/cookies.json`，权限为 0600；游客模式无需登录。后台“哔哩哔哩音频”默认使用原项目的扫码授权协议，二维码由已有 Ant Design 组件生成，无需安装 segno。可刷新状态、清除授权，也可展开手动 Cookie 授权。浏览器通过 SSE 接收等待扫码、手机确认、成功和过期状态；B 站上游协议仅提供查询接口，因此服务端每 3 秒查询一次，错误按 6 / 12 秒退避，连续 3 次错误、关闭连接、授权完成或 180 秒到期均停止。

| 配置 | 默认值 | 用途 |
| --- | --- | --- |
| Python `BBZG_BILIBILI_PORT` | `5001` | 本机服务端口 |
| Node `BBZG_BILIBILI_API_BASE` | `http://127.0.0.1:5001` | 音频服务地址 |
| 两端 `BBZG_BILIBILI_API_TOKEN` | 读取 / 生成本地令牌文件 | 分开部署时必须设置相同令牌 |
| Python `BILI_SESSDATA` | 未设置 | 可选账号凭据；使用后台管理授权时不要同时设置 |
| Node `BBZG_MUSIC_MAX_DOWNLOAD_BYTES` | `31457280` | 音乐库导入上限，30 MiB |
| Node `BBZG_MUSIC_DOWNLOAD_TIMEOUT_MS` | `30000` | 下载阶段总时限，30 秒 |

搜索上游未提供总数；有结果时允许继续翻页，遇到空页或第 50 页停止，不显示虚构总数。封面在 Node 端单独限制为 4 个并发、128 个排队请求，等待最长 20 秒；Python 端也单独分配 4 个图片并发，并为图片读取设置 12 秒 socket 截止，避免图片占用音频额度或长期堵塞图片队列。两端界面加载失败后仅重试两次（500 / 1500 毫秒），组件移除或图片切换时停止旧重试。

B 站请求可能因账号、区域或平台风控失败，界面会显示失败信息，不自动替换为其他来源。

通用远程封面代理不依赖 B 站 Python 服务；需要 DNS 返回真实公网地址。本机若使用 198.18.x.x Fake-IP DNS，代理会按安全策略拒绝，不能通过放开内网地址绕过。核心上游 API 读取上限为 2 MiB，单次读取总时限最多 12 秒，一次逻辑操作共用 30 秒网络预算，核心锁等待最多 5 秒。受信 B 站 API/CDN 保留 urllib 原有 HTTP CONNECT 代理配置兼容；任意远程封面代理不使用环境代理，避免绕过公网地址校验。

## 宝塔运行配置

这是新增的 Python 常驻进程，不是 Node 构建产物，也不需要对公网新增域名、SSL 或反向代理。现有 Node 站点代理前端请求至本机服务。

在宝塔 Python 项目 / 进程管理中创建独立项目，工作目录设为本站项目根目录，确认该进程 PATH 能找到 `ffmpeg` 且 `ffmpeg -encoders` 包含 `libmp3lame`，启动命令为 `python3 -B bilibili-api/server.py`，监听 `127.0.0.1:5001`，开启进程守护；Python 与 Node 进程应以同一系统用户运行，以读取权限为 0600 的令牌和凭据。若使用不同用户，使用两端相同的环境令牌并正确配置 Python 对 `storage/bilibili` 的读写权限。

现有部署脚本会同步 `bilibili-api` 源码并保留 `storage/`。它不会自动创建或重启新增 Python 项目；首次上线须完成上述面板配置，后续更新该目录时需在面板重启该项目。不要直接在现有 Docker Node 容器中使用默认 loopback 地址访问宿主 Python 服务；本接入按当前宝塔同机运行方式配置。

## 上游来源

`vendor/bili.py` 原样取自用户指定仓库：

- 仓库：`https://github.com/Achordchan/bilibili-audio`
- 固定提交：`76bad09bd8257ec377494223f752f5aea3d29702`
- 文件：`bili.py`

该文件负责 Wbi 签名、搜索、音轨解析和账号操作。本项目的 `server.py` 负责本机鉴权、CDN 及重定向校验、Range 代理、并发限制和凭据存储。仅请求音频流，不下载视频；试听、下载和导入统一输出 MP3（192 kbps、audio/mpeg），服务端先下载音轨再通过 FFmpeg 解码、编码，绝不只修改扩展名。成品缓存在 storage/bilibili/mp3-cache，以支持 Range 拖动和重复使用；转换并发上限 2，原始音轨限 100 MiB，MP3 成品限 30 MiB，缓存限 512 MiB / 24 小时。下载阶段使用独立 90 秒计时器关闭底层 socket，分段读取不会等待凑满 64 KiB，单次连接超时为 30 秒，转码进程超时为 90 秒；Node 等待转换响应最多 210 秒。缺少 FFmpeg 或转换失败时明确报错，不返回 M4A。上游该版本未附 LICENSE 文件，保留来源说明，不另行声明第三方代码许可证。

## 修改文件清单

| 文件 | 修改内容 |
| --- | --- |
| `bilibili-api/vendor/bili.py` | 引入固定版本上游核心，保持源码原样 |
| `bilibili-api/server.py` | 本机鉴权、扫码与账号 API、封面代理、MP3 Range 响应 |
| `bilibili-api/core_transport.py` | 上游 API 大小、读取时限与核心锁等待限制，保留 vendor 原文件 |
| `bilibili-api/auth_state.py` | 二维码代次与有效期校验、暂存凭据、原子提交与全局失效 |
| `bilibili-api/cdn_source.py` | 音频与图片共用的 CDN 重定向校验、独立 socket 截止与分段读取 |
| `bilibili-api/audio_mp3.py` | FFmpeg 转码、缓存、并发与容量限制、失败清理 |
| `bilibili-api/README.md` | 运行要求、配置、宝塔接入和验收边界 |
| `lib/bilibili-client.js` | 搜索、解析、服务访问以及 MP3 响应校验 |
| `lib/music-download.js` | 两个导入入口共用流式下载、并发限制和残片清理 |
| `lib/local-cover.js` | 只读 public 图片字节、真实路径与图片格式检查，兼容任意静态目录 |
| `lib/remote-cover.js` | 无凭据图片代理、逐跳校验、公网 DNS 地址固定与流量上限 |
| `lib/music-cover.js` | 封面地址规范化与历史网易云封面入口 |
| `lib/audit.js` | 补充 B 站授权和员工播报审计 |
| `routes/bilibili-music.js` | 搜索、试听、MP3 下载与封面路由 |
| `routes/bilibili-auth.js` | 二维码、会话隔离、SSE 状态、退避和退出机制 |
| `routes/music.js` | B 站后台导入复用现有任务，保存来源和封面 |
| `routes/egg.js` | B 站设为播报、音乐库复用和封面返回 |
| `routes/public-music.js` | 按歌曲来源 ID 查询并缓存历史网易云封面 |
| `server.js` | 注册新增路由 |
| `src/admin/api.ts` | 统一音乐库与成员管理的本地优先、按来源在线回退地址 |
| `src/admin/pages/UsersPage.tsx` | 成员试听支持 B 站回退并传递封面来源 |
| `src/admin/pages/MusicPage.tsx` | 来源切换、封面、在线导入与结果表格布局 |
| `src/admin/components/BilibiliAuthCard.tsx` | 默认扫码授权、状态提示与手动授权折叠入口 |
| `src/admin/components/MusicCover.tsx` | 歌曲图片 / 视频封面组件与加载失败状态 |
| `src/admin/components/GlobalAudioPlayer.tsx` | 播放器显示来源封面 |
| `src/admin/App.tsx` | B 站曲目清除上一首歌词状态 |
| `src/admin/types.ts` | 音乐记录、播放参数增加来源与封面字段 |
| `src/admin/navigation.tsx` | 更新在线导入导航与搜索关键词 |
| `src/admin/styles.css` | 封面、窄屏搜索表格和播放器布局的作用域样式 |
| `public/egg-music.html` | 来源选择、封面样式与播放器音源入口 |
| `public/js/egg-music.js` | B 站搜索、试听、下载、播报设置及封面展示 |
| `public/js/audio-core.js` | 切歌时忽略旧播放请求的 AbortError |
| `public/admin-app/index.html`、`public/admin-app/assets/*` | 重新生成后台产物并移除旧哈希文件 |
| `package.json`、`package-lock.json` | 声明 ipaddr.js 安全地址分类直接依赖并锁定版本 |
| `.gitignore` | 排除 Python 缓存和上游默认凭据路径 |
| `test/bilibili-music.test.js` | 权限、搜索、MP3 类型、导入、播报及失败清理 |
| `test/bilibili-auth.test.js` | 扫码状态、隔离、过期、退避和请求竞态 |
| `test/bilibili-service.test.py` | CDN 校验、凭据回滚、真实 FFmpeg 转码和 Range |
| `test/local-cover.test.js` | 根目录、自定义目录、无扩展名图片及越界/非图片拒绝回归 |
| `test/remote-cover.test.js` | 远程封面重定向、内网地址、DNS 重绑定、双栈地址回退和图片字节响应测试 |
| `test/music-cover.test.js` | 封面规范化、历史图片查询和缓存 |
| `test/admin-player-lyrics.test.js` | 增加本地文件缺失时 B 站/网易云预览来源契约回归 |
| `test/audio-core-playback.test.js` | 旧播放中断不破坏新曲目的回归测试 |

## 本地验收记录（2026-09-20）

- `npm run build:admin`：通过；Vite 提示部分构建包超过 500 kB。
- `npm test`：169 项通过，无失败或跳过。
- `python3 -B test/bilibili-service.test.py`：13 项通过，包括真实 FFmpeg 转码、授权写入竞态、音频/图片/API 读取截止与核心锁等待。
- `node --check`：新增 Node 模块及员工端脚本通过语法检查；`git diff --check` 通过。
- 真实 B 站搜索、二维码生成、视频封面加载、MP3 编码（ffprobe 确认 192000 bit/s）、206 分段响应均验证通过。
- 隔离员工账号完成“设为播报”，记录指向真实 `.mp3` 文件；浏览器实际试听成功。后台导入任务与封面保存通过接口测试，后台页面已检查布局。
- 已清理本次临时预览进程、测试账号和预览入口；测试替身仅位于 `test/`，不进入生产代码。
- 未执行真实手机扫码确认、正式大屏播报和生产部署；未验证 Safari / 移动端解码。网易云封面接口已通过集成测试，本地未启动其 Python 服务，因此未完成网易云在线接口实测。

- 审查修复后增加远程封面代理；真实网络烟测因本机 Fake-IP DNS 被安全策略拒绝，未放行私有地址。模拟公网 DNS 与重定向链的集成测试通过。

- 上游传输适配后，真实 B 站 nav API 返回 HTTP 200（游客 code=-101），验证了既有代理配置兼容；增加 HTTP 代理目标保持和慢速 CONNECT 截止测试。
