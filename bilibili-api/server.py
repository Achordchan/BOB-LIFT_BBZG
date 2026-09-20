#!/usr/bin/env python3
"""BBZG 的本机音频服务；复用固定版本 bilibili-audio 核心。"""
import hmac
import json
import os
from pathlib import Path
import secrets
import sys
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from audio_mp3 import Mp3Cache, byte_range
from auth_state import AuthorizationState
from cdn_source import open_cdn_source
STATE = ROOT.parent / 'storage' / 'bilibili'
STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
sys.path.insert(0, str(ROOT / 'vendor'))
import bili

# Cookie 与服务令牌位于部署时保留的 storage，不改第三方核心源码。
bili.COOKIE_FILE = str(STATE / 'cookies.json')
if Path(bili.COOKIE_FILE).exists():
    bili.COOKIES.update(json.loads(Path(bili.COOKIE_FILE).read_text()))
if os.environ.get('BILI_SESSDATA'):
    bili.COOKIES['SESSDATA'] = os.environ['BILI_SESSDATA']
TOKEN = os.environ.get('BBZG_BILIBILI_API_TOKEN', '')
if not TOKEN:
    token_file = STATE / 'api-token'
    try:
        fd = os.open(token_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        TOKEN = token_file.read_text().strip()
    else:
        TOKEN = secrets.token_urlsafe(32)
        with os.fdopen(fd, 'w') as target:
            target.write(TOKEN)
if not TOKEN:
    raise SystemExit('服务令牌不能为空')

CORE_LOCK = threading.Lock()
AUTH = AuthorizationState(bili, CORE_LOCK)
SLOTS = threading.BoundedSemaphore(12)
IMAGE_SLOTS = threading.BoundedSemaphore(4)
MP3_CACHE = Mp3Cache(STATE / 'mp3-cache', bili.FFMPEG, bili.MP3_OK)


def validate_url(url, suffixes):
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme not in ('https', 'http') or parsed.username or parsed.password
            or parsed.port not in (None, 80, 443) or not bili.host_allowed(parsed.hostname, suffixes)):
        raise ValueError('只允许访问哔哩哔哩 CDN')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # 不将 Cookie、令牌或带签名的音频 URL 写入访问日志。

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def dispatch(self):
        if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + TOKEN):
            return self.send_json({'ok': False, 'error': '服务鉴权失败'}, 403)
        slots = IMAGE_SLOTS if urllib.parse.urlsplit(self.path).path == '/api/image' else SLOTS
        if not slots.acquire(blocking=False):
            return self.send_json({'ok': False, 'error': '音频服务繁忙'}, 503)
        try:
            self.route()
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            self.close_connection = True
        except (ValueError, RuntimeError) as error:
            self.send_json({'ok': False, 'error': str(error)}, 400)
        except Exception:
            self.send_json({'ok': False, 'error': '哔哩哔哩请求失败，请稍后重试'}, 502)
        finally:
            slots.release()

    def route(self):
        parsed = urllib.parse.urlsplit(self.path)
        query = dict(urllib.parse.parse_qsl(parsed.query))
        route = parsed.path
        if self.command == 'GET' and route in ('/api/stream', '/api/image'):
            if route == '/api/stream':
                return self.mp3(query.get('url', ''), query.get('track', ''))
            return self.image(query.get('url', ''))
        if route in ('/api/login/qrcode', '/api/login/poll', '/api/login/manual', '/api/login/logout', '/api/login/cancel'):
            if self.command == 'GET' and route == '/api/login/qrcode':
                result = AUTH.issue()
            elif self.command == 'GET' and route == '/api/login/poll':
                result = AUTH.poll(query.get('key', ''))
            elif self.command == 'POST' and route == '/api/login/logout':
                result = AUTH.replace()
            elif self.command == 'POST' and route in ('/api/login/manual', '/api/login/cancel'):
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 16384:
                    raise ValueError('授权内容无效')
                data = json.loads(self.rfile.read(length))
                if route == '/api/login/cancel':
                    AUTH.cancel(str(data.get('key', '')))
                    result = {}
                else:
                    result = AUTH.replace(str(data.get('cookie', '')))
            else:
                return self.send_json({'ok': False, 'error': '接口不存在'}, 404)
            return self.send_json({'ok': True, **result})
        # 上游共享 Cookie/Wbi 状态不是线程安全对象，核心操作串行执行。
        with CORE_LOCK:
            if self.command == 'GET' and route == '/api/search':
                keyword = query.get('keyword', '').strip()
                page = int(query.get('page', '1'))
                if not keyword or len(keyword) > 200 or not 1 <= page <= 50:
                    raise ValueError('搜索参数无效')
                result = {'items': bili.search_videos(keyword, page)}
            elif self.command == 'GET' and route == '/api/audio':
                result = bili.resolve_audio(query.get('bvid', ''), query.get('cid'))
            elif self.command == 'GET' and route == '/api/login/status':
                result = {**bili.nav_info(), 'mp3': bili.MP3_OK}
            else:
                return self.send_json({'ok': False, 'error': '接口不存在'}, 404)
        self.send_json({'ok': True, **result})

    def mp3(self, url, track):
        validate_url(url, bili.MEDIA_HOST_SUFFIXES)
        def open_source():
            return open_cdn_source(url, lambda target: validate_url(target, bili.MEDIA_HOST_SUFFIXES),
                                     {'User-Agent': bili.UA, 'Referer': 'https://www.bilibili.com/'})
        file = MP3_CACHE.get(track or url, open_source)
        with file.open('rb') as reader:
            size = os.fstat(reader.fileno()).st_size
            try:
                start, end, status = byte_range(self.headers.get('Range'), size)
            except ValueError:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            self.send_response(status)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Content-Length', str(end - start + 1))
            self.send_header('Accept-Ranges', 'bytes')
            if status == 206:
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.end_headers()
            reader.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = reader.read(min(65536, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def image(self, url):
        suffixes = bili.IMG_HOST_SUFFIXES
        validate_url(url, suffixes)
        headers = {'User-Agent': bili.UA, 'Referer': 'https://www.bilibili.com/'}
        with open_cdn_source(url, lambda target: validate_url(target, suffixes), headers, timeout=12) as upstream:
            if upstream.status != 200:
                raise RuntimeError('哔哩哔哩封面不可用')
            limit = 5 * 1024 * 1024
            if int(upstream.headers.get('Content-Length', '0')) > limit:
                raise ValueError('资源文件过大')
            content_type = upstream.headers.get('Content-Type', '')
            if not content_type.startswith('image/'):
                raise ValueError('封面格式无效')
            self.send_response(upstream.status)
            self.send_header('Content-Type', content_type)
            for key in ('Content-Length', 'Content-Range', 'Accept-Ranges'):
                if upstream.headers.get(key):
                    self.send_header(key, upstream.headers[key])
            self.end_headers()
            received = 0
            try:
                while True:
                    chunk = upstream.read(65536)
                    if not chunk:
                        break
                    received += len(chunk)
                    if received > limit:
                        break
                    self.wfile.write(chunk)
            except (OSError, TimeoutError, RuntimeError):
                pass
            self.close_connection = True


if __name__ == '__main__':
    port = int(os.environ.get('BBZG_BILIBILI_PORT', '5001'))
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    bili.init_session()
    print(f'哔哩哔哩音频服务已启动：127.0.0.1:{port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
