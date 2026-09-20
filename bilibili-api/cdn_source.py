"""音频与封面共用的有界 CDN 读取；独立计时器中断慢速滴流。"""
from contextlib import contextmanager
import base64
import http.client
import socket
import threading
import time
import urllib.parse
import urllib.request


class DeadlineResponse:
    def __init__(self, response, expired):
        self.response = response
        self.expired = expired
        self.status = response.status
        self.headers = response.headers

    def read(self, size):
        if self.expired.is_set():
            raise RuntimeError('资源下载超时')
        try:
            chunk = self.response.read1(size)
        except OSError as error:
            if self.expired.is_set():
                raise RuntimeError('资源下载超时') from error
            raise
        if self.expired.is_set():
            raise RuntimeError('资源下载超时')
        return chunk


@contextmanager
def open_cdn_source(url, validate, headers, timeout=90, method='GET', use_proxy=True):
    deadline = time.monotonic() + timeout
    for _ in range(6):
        validate(url)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError('资源下载超时')
        parsed = urllib.parse.urlsplit(url)
        connection_type = http.client.HTTPSConnection if parsed.scheme == 'https' else http.client.HTTPConnection
        proxy_url = urllib.request.getproxies().get(parsed.scheme) if use_proxy and not urllib.request.proxy_bypass(parsed.hostname) else None
        proxy = urllib.parse.urlsplit(proxy_url) if proxy_url else None
        request_headers = {**headers, 'Connection': 'close'}
        if proxy and proxy.scheme != 'http':
            raise RuntimeError('当前受信上游传输需要 HTTP CONNECT 代理')
        connection = connection_type(proxy.hostname if proxy else parsed.hostname,
                                     (proxy.port or 80) if proxy else parsed.port,
                                     timeout=min(30, remaining))
        proxy_headers = {}
        if proxy and proxy.username is not None:
            credentials = f'{urllib.parse.unquote(proxy.username)}:{urllib.parse.unquote(proxy.password or "")}'
            proxy_headers['Proxy-Authorization'] = 'Basic ' + base64.b64encode(credentials.encode()).decode()
        if proxy and parsed.scheme == 'https':
            connection.set_tunnel(parsed.hostname, parsed.port or 443, headers=proxy_headers)
        elif proxy:
            request_headers.update(proxy_headers)
        response = None
        timer = None
        expired = threading.Event()
        transport = None
        try:
            def abort():
                expired.set()
                try:
                    current = transport or connection.sock
                    if current is not None:
                        current.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
            timer = threading.Timer(max(0, deadline - time.monotonic()), abort)
            timer.daemon = True
            timer.start()
            connection.connect()
            transport = connection.sock
            if expired.is_set():
                raise RuntimeError('资源下载超时')
            target = url if proxy and parsed.scheme == 'http' else urllib.parse.urlunsplit(('', '', parsed.path or '/', parsed.query, ''))
            # 与原 urllib 传输一致，要求关闭连接，兼容无长度的 API 响应结束语义。
            connection.request(method, target, headers=request_headers)
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.headers.get('Location')
                if not location:
                    raise RuntimeError('资源重定向缺少目标地址')
                url = urllib.parse.urljoin(url, location)
                continue
            yield DeadlineResponse(response, expired)
            return
        except (OSError, http.client.HTTPException) as error:
            if expired.is_set():
                raise RuntimeError('资源下载超时') from error
            raise
        finally:
            if timer is not None:
                timer.cancel()
                timer.join()
            if response is not None:
                response.close()
            connection.close()
    raise RuntimeError('资源重定向次数过多')
