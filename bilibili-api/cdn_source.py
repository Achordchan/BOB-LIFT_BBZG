"""音频与封面共用的有界 CDN 读取；独立计时器中断慢速滴流。"""
from contextlib import contextmanager
import http.client
import socket
import threading
import time
import urllib.parse


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
def open_cdn_source(url, validate, headers, timeout=90, method='GET'):
    deadline = time.monotonic() + timeout
    for _ in range(6):
        validate(url)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError('资源下载超时')
        parsed = urllib.parse.urlsplit(url)
        connection_type = http.client.HTTPSConnection if parsed.scheme == 'https' else http.client.HTTPConnection
        connection = connection_type(parsed.hostname, parsed.port, timeout=min(30, remaining))
        response = None
        timer = None
        expired = threading.Event()
        try:
            connection.connect()
            transport = connection.sock
            def abort():
                expired.set()
                try:
                    transport.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
            timer = threading.Timer(max(0, deadline - time.monotonic()), abort)
            timer.daemon = True
            timer.start()
            target = urllib.parse.urlunsplit(('', '', parsed.path or '/', parsed.query, ''))
            connection.request(method, target, headers=headers)
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.headers.get('Location')
                if not location:
                    raise RuntimeError('资源重定向缺少目标地址')
                url = urllib.parse.urljoin(url, location)
                continue
            yield DeadlineResponse(response, expired)
            return
        except OSError as error:
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
