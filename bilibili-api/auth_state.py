"""共享账号的授权事务：网络请求使用临时 Cookie，提交前核验授权代次。"""
import json
import os
from pathlib import Path
import tempfile
import threading
import time


class AuthorizationState:
    def __init__(self, core, core_lock, lifetime=180):
        self.core = core
        self.core_lock = core_lock
        self.lock = threading.Lock()
        self.generation = 0
        self.pending = {}
        self.lifetime = lifetime

    def invalidate(self):
        # 不等待网络锁：清除授权必须立即使正在查询的旧二维码失去提交资格。
        with self.lock:
            self.generation += 1
            self.pending.clear()
            return self.generation

    def cancel(self, key):
        with self.lock:
            self.pending.pop(key, None)

    def issue(self):
        with self.lock:
            generation = self.generation
        with self.core_lock:
            result = self.core.qr_generate()
        with self.lock:
            if generation != self.generation:
                raise RuntimeError('授权已更新，请重新生成二维码')
            now = time.monotonic()
            self.pending = {key: value for key, value in self.pending.items() if value[1] > now}
            if len(self.pending) >= 100:
                raise RuntimeError('授权服务繁忙')
            self.pending[result['key']] = (generation, now + self.lifetime)
        return result

    def _stage(self, operation):
        original = self.core.COOKIES
        save = self.core.save_cookies
        self.core.COOKIES = dict(original)
        self.core.save_cookies = lambda: None
        try:
            result = operation()
            return result, dict(self.core.COOKIES)
        finally:
            self.core.COOKIES = original
            self.core.save_cookies = save

    def _commit(self, cookies):
        destination = Path(self.core.COOKIE_FILE)
        descriptor, temporary = tempfile.mkstemp(dir=destination.parent, prefix='.cookies-')
        try:
            with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
                json.dump(cookies, output, ensure_ascii=False)
            os.replace(temporary, destination)
        finally:
            Path(temporary).unlink(missing_ok=True)
        self.core.COOKIES.clear()
        self.core.COOKIES.update(cookies)
        self.generation += 1
        self.pending.clear()

    def poll(self, key):
        with self.core_lock:
            with self.lock:
                lease = self.pending.get(key)
                if not lease or lease[0] != self.generation or lease[1] <= time.monotonic():
                    return {'state': 'expired'}
            result, cookies = self._stage(lambda: self.core.qr_poll(key))
            with self.lock:
                if (self.pending.get(key) != lease or lease[0] != self.generation
                        or lease[1] <= time.monotonic()):
                    return {'state': 'expired'}
                if result.get('state') == 'confirmed':
                    self._commit(cookies)
                elif result.get('state') == 'expired':
                    self.pending.pop(key, None)
            return result

    def replace(self, cookie=None):
        generation = self.invalidate()
        with self.core_lock:
            with self.lock:
                if generation != self.generation:
                    raise RuntimeError('授权操作已被更新的请求替代')
            operation = self.core.logout if cookie is None else lambda: self.core.manual_login(cookie)
            result, cookies = self._stage(operation)
            with self.lock:
                if generation != self.generation:
                    raise RuntimeError('授权操作已被更新的请求替代')
                self._commit(cookies)
            return result or {}
