# BBZG 内部网易云音乐 API

来源：Suxiaoqinx/Netease_url，MIT License。

部署位置：`/www/wwwroot/netease_music_api`

Cookie 文件：`/www/wwwroot/netease_music_api/cookie.txt`

把网易云 Cookie 粘贴到上述文件后，执行：

```bash
systemctl restart bbzg-netease-api
curl -fsS http://127.0.0.1:5000/health
```

服务只监听 `127.0.0.1:5000`，由 `bbzg_app` 后端内部调用，不直接对公网开放。
