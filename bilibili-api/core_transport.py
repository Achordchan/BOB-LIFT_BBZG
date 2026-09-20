"""为原样引入的上游核心提供有界 API 传输与有时限的串行锁。"""
import io
import threading
import time
import urllib.parse

from cdn_source import open_cdn_source


class CoreRequestGate:
    def __init__(self, wait_timeout=5, request_timeout=30):
        self.lock = threading.RLock()
        self.local = threading.local()
        self.wait_timeout = wait_timeout
        self.request_timeout = request_timeout

    def __enter__(self):
        if not self.lock.acquire(timeout=self.wait_timeout):
            raise RuntimeError('上游服务繁忙，请稍后重试')
        stack = getattr(self.local, 'stack', [])
        previous = getattr(self.local, 'deadline', None)
        stack.append(previous)
        self.local.stack = stack
        self.local.deadline = min(previous or float('inf'), time.monotonic() + self.request_timeout)
        return self

    def __exit__(self, *_args):
        self.local.deadline = self.local.stack.pop()
        self.lock.release()

    def remaining(self):
        deadline = getattr(self.local, 'deadline', None)
        return max(0, deadline - time.monotonic()) if deadline else self.request_timeout


class BufferedApiResponse(io.BytesIO):
    def __init__(self, body, response):
        super().__init__(body)
        self.headers = response.headers
        self.status = response.status

    def getcode(self):
        return self.status


def install_core_transport(core, gate, open_source=open_cdn_source, max_bytes=2 * 1024 * 1024):
    allowed = {'api.bilibili.com', 'www.bilibili.com', 'passport.bilibili.com',
               'account.bilibili.com', 'search.bilibili.com', 'bilibili.com'}
    def validate(url):
        parsed = urllib.parse.urlsplit(url)
        if (parsed.scheme != 'https' or parsed.hostname not in allowed
                or parsed.username or parsed.password or parsed.port not in (None, 443)):
            raise ValueError('不允许请求该上游 API 地址')

    def request(url, referer=None, method='GET', timeout=15, extra_headers=None):
        remaining = min(float(timeout), 12, gate.remaining())
        if remaining <= 0:
            raise RuntimeError('上游 API 请求超时')
        headers = {'User-Agent': core.UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                   'Cookie': core.cookie_string(), 'Referer': referer or 'https://www.bilibili.com/'}
        headers.update(extra_headers or {})
        with open_source(url, validate, headers, timeout=remaining, method=method) as response:
            expected = int(response.headers.get('Content-Length', '0'))
            if expected > max_bytes:
                raise RuntimeError('上游 API 响应过大')
            chunks, received = [], 0
            while True:
                chunk = response.read(min(65536, max_bytes + 1 - received))
                if not chunk:
                    break
                received += len(chunk)
                if received > max_bytes:
                    raise RuntimeError('上游 API 响应过大')
                chunks.append(chunk)
            if expected and expected != received:
                raise RuntimeError('上游 API 响应不完整')
            return BufferedApiResponse(b''.join(chunks), response)
    core.http_req = request
