# 歌曲封面 WebP 与历史迁移

## 数据流与策略

- 歌曲上传：`MusicPage.tsx` 的可选封面字段 → `services/uploads.js` 私有暂存目录 `storage/cover-uploads` → `routes/music.js` → `lib/cover-storage.js` → `public/music/covers/<SHA256>.webp` → `data.json.music[].coverUrl`。
- 管理员/员工在线导入：`routes/music.js` / `routes/egg.js` → 同一 `importCover`。远程下载复用 `lib/remote-cover.js` 的公网 IP、DNS 绑定、逐跳重定向、12 秒总时限和 5 MiB 限制；本地图片只读 public 内真实文件，禁止符号链接越界。SHA256 = 文件内容校验值，相同转换结果共用一个文件。
- 展示仍使用 `musicCoverUrl` → `/api/public/music/local-cover?path=...`，代理按真实格式返回 `image/webp`；管理员歌曲列表、全局播放器、员工音乐库的展示尺寸和错误占位逻辑保持现状。搜索结果预览及无显式封面地址的网易云历史记录仍走原查询/代理。
- 复用已有 sharp，不新增依赖。输入最大 5 MiB、4000 万像素；按 EXIF 旋转、最长边 640、不放大、不裁切、保留透明度、WebP 质量 80 / effort 4、默认剥离元数据。已合规的 WebP 不重复有损压缩。动态、多页图片不转换，避免丢失帧。
- 转换后完整解码并核验格式与尺寸，再用临时文件和原子重命名发布。上传原图仅在写库成功且重新读取记录确认引用后删除；失败原图保留在私有暂存区供人工核查，不自动清理。管理员/员工导入失败保留原地址，写入 `coverOptimization.status=failed` 和原因；成功记录包含原地址、前后尺寸/体积/哈希。
- WebP 文件不会随歌曲删除自动删除：多个歌曲可能共享一个封面。孤立文件和失败暂存图需要单独进行引用审计后再清理，本工具不执行删除。

## 历史迁移工具（默认只读）

在项目根目录运行；下列命令中的目录应换成要处理的**离线副本**及其旁边的新目录：

```sh
node scripts/migrate-music-covers.js --base /path/to/offline-copy
node scripts/migrate-music-covers.js --base /path/to/offline-copy --prepare --out /path/to/new-cover-bundle --hostname bbzg.example.com
node scripts/migrate-music-covers.js --base /path/to/offline-copy --verify --out /path/to/new-cover-bundle
```

`--hostname` 填实际站点主机名，让同域绝对地址正确按本地文件处理，下载器拒绝请求本站。`--prepare` 才下载/转换，串行处理；既不修改指定副本的 data.json，也不删除原图。输出目录必须不存在且不能位于 public 内，父目录必须存在。目录权限 0700，数据备份 0600，含完整业务数据，不得发布到静态目录或提交 Git。

迁移包包含：

| 文件 | 用途 |
| --- | --- |
| `original-data.json` | 原始数据的逐字节备份 |
| `candidate-data.json` | 仅替换成功转换歌曲的 coverUrl，失败记录保持原值 |
| `originals/<SHA256>` | 成功读取的源图片，包含远程图片的实际字节 |
| `public/music/covers/*.webp` | 已完整解码的候选 WebP |
| `manifest.json` | 按歌曲 ID 记录原/新引用、尺寸、字节数、哈希、成功/跳过/失败原因 |

`--verify` 会检查源数据未漂移、两份 JSON 哈希、原图/输出图片哈希、WebP 完整解码、尺寸与体积、逐条引用，以及候选数据没有非封面修改。任一校验失败返回非零退出码。个别图片转换失败会在清单中记录，候选数据保留它们的旧引用；命令成功不表示所有封面均转换成功，必须查看 failed/skipped 数量。

无显式 coverUrl 的旧记录、已经使用托管 WebP 的记录会跳过。旧 `/api/public/music/cover?id=...` 地址无法作为本地文件读取，会记录失败并保留其正常查询行为。工具不凭歌曲名猜测图片，也不提取音频内嵌封面。

## 切换与恢复方案（本次未执行）

1. 获得生产迁移授权后，在停写窗口停止全部应用实例及其他 data.json 写入者；备份整份 data.json、public/music/covers 和历史本地封面目录。按最终快照生成迁移包，检查清单，处理失败项；先在离线环境验证候选歌曲列表及播放器。
2. 对**当前待切换目录**运行 `--verify`。如果源数据已变化，重新生成迁移包，禁止强行覆盖。核验之后保持停写，避免校验与切换之间的竞争。
3. 只复制包中 `public/music/covers` 到对应目录，校验目标文件哈希、可解码性、服务账号可读权限；不能把整个迁移包复制到 public。原图及 originals 继续保留。
4. 在 data.json 同目录准备 candidate-data.json 副本，保持原文件权限、所有者，再以原子重命名替换 data.json；启动应用，检查歌曲 API 返回 URL、封面 HTTP 200 / `image/webp`、列表/播放器展示。不要在尚未完成验收时恢复业务写入。
5. 如验收失败，在仍停写的窗口原子恢复 original-data.json；旧本地图未删除，旧引用可直接恢复。远程源图同时留有 originals 备份，但原远程服务是否可用仍属于外部依赖；必要时将备份恢复为经审计的本地图片引用。
6. 如果恢复业务写入后才需要回滚，**不得覆盖整份旧 JSON**。按歌曲 ID 仅将仍等于清单新地址的 coverUrl 恢复原值，保留后续所有其他业务修改；有引用冲突的记录需人工处理。该阶段须另行生成、审阅并核验字段级回滚补丁。

工具有意不提供在线 apply 或自动删除。原图备份会暂时增加磁盘占用；三方远程封面本来不占本站图片空间，本地化后会增加本站用量。压缩收益指图片字节数与后续传输量，不等于迁移包保留期间的磁盘净减少。只有完成引用审计、展示验收并明确备份保留周期后，才另行授权清理。

## 本地验证（2026-09-20）

从当前本地 data.json 读取到 50 首歌曲，其中 13 首具有显式 coverUrl；没有修改该数据文件。从其中前三个 URL 用 curl 下载真实图片至 `.tmp/cover-verification`，再用生产转换函数处理。该目录被 Git 忽略，未将真实图片作为测试 fixture 提交。

| 样本 | 实际输入格式/尺寸 | 原字节数 | 输出尺寸 | WebP 字节数 | 减少 |
| --- | --- | ---: | --- | ---: | ---: |
| 1 | JPEG / 1425×1425 | 287965 | 640×640 | 55042 | 80.89% |
| 2 | JPEG / 1417×1417 | 131453 | 640×640 | 23580 | 82.06% |
| 3 | PNG / 1600×1600（URL 后缀 jpg） | 2480856 | 640×640 | 45462 | 98.17% |

三个输出均完整解码通过；另在 `.tmp/cover-verification/offline` 建立独立的三条样本数据，实际执行 `--prepare` 和 `--verify`，结果 ready=3、failed=0，备份及原文件保持可读。前后 SHA256 及尺寸保存在 `.tmp/cover-verification/report.json`。当前网络环境下，应用安全下载器对这些域名返回“封面域名未解析到允许的公网地址”；curl 能读取真实图片。因此本轮证明转换与本地存储/引用链路，不证明生产远程下载可用；没有放宽 DNS/公网安全策略。

自动验证：

```sh
node --test test/cover-storage.test.js test/remote-cover.test.js test/local-cover.test.js test/music-cover.test.js test/bilibili-music.test.js
./node_modules/.bin/tsc -p tsconfig.admin.json --noEmit
./node_modules/.bin/vite build --config vite.admin.config.ts --outDir ../../.tmp/cover-admin-build
node scripts/migrate-music-covers.js
git diff --check
```

界面仅增加“上传音乐”状态下的可选封面表单项，复用 Ant Design Upload 与现有纵向表单，不修改 CSS、列表或播放器布局。已做 JSX/类型和构建检查，未做浏览器/截图验收。未执行生产迁移、部署或生产远程导入验证。
