"""仅测试隔离副本，不访问真实账号或本地凭据。"""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import io
import wave
from unittest.mock import patch


class BilibiliServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        root = Path(cls.temp.name) / 'bilibili-api'
        shutil.copytree(Path(__file__).resolve().parents[1] / 'bilibili-api', root)
        spec = importlib.util.spec_from_file_location('isolated_bili_service', root / 'server.py')
        cls.service = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.service)
        cls.server = cls.service.ThreadingHTTPServer(('127.0.0.1', 0), cls.service.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def request(self, endpoint, body=None, authorized=True):
        headers = {'Content-Type': 'application/json'}
        if authorized:
            headers['Authorization'] = 'Bearer ' + self.service.TOKEN
        req = urllib.request.Request(self.base + endpoint, headers=headers,
                                     data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req, timeout=3) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as response:
            with response:
                return response.status, json.load(response)

    def test_rejects_unauthorized_calls(self):
        self.assertEqual(self.request('/api/search?keyword=x', authorized=False)[0], 403)

    def test_cdns_and_redirects_are_allowlisted(self):
        validate = self.service.validate_url
        validate('https://upos.bilivideo.com/audio.m4a', ('bilivideo.com',))
        for url in ['http://127.0.0.1/a', 'https://bilivideo.com.evil.test/a',
                    'file:///etc/passwd', 'https://user@upos.bilivideo.com/a',
                    'https://upos.bilivideo.com:8080/a']:
            with self.assertRaises(ValueError):
                validate(url, ('bilivideo.com',))
        with self.assertRaises(ValueError):
            with self.service.open_cdn_source('http://127.0.0.1/private', lambda url: validate(url, ('bilivideo.com',)), {}):
                self.fail('不应打开被禁止的地址')

    def test_qr_endpoints_reuse_upstream_core(self):
        with patch.object(self.service.bili, 'qr_generate', return_value={'key': 'test', 'url': 'https://account.bilibili.com/test'}):
            self.assertEqual(self.request('/api/login/qrcode')[1]['key'], 'test')
        with patch.object(self.service.bili, 'qr_poll', return_value={'state': 'scanned'}) as check:
            self.assertEqual(self.request('/api/login/poll?key=test')[1]['state'], 'scanned')
            check.assert_called_once_with('test')

    def test_failed_manual_authorization_preserves_previous_account(self):
        self.service.bili.COOKIES.clear()
        self.service.bili.COOKIES['SESSDATA'] = 'previous-test-account'
        self.service.bili.save_cookies()
        with patch.object(self.service.bili, 'nav_info', return_value={'logged_in': False}):
            self.assertEqual(self.request('/api/login/manual', {'cookie': 'SESSDATA=invalid-test'})[0], 400)
        self.assertEqual(self.service.bili.COOKIES['SESSDATA'], 'previous-test-account')
        self.assertEqual(Path(self.service.bili.COOKIE_FILE).stat().st_mode & 0o777, 0o600)

    def test_logout_or_manual_replace_fences_inflight_qr_writes(self):
        from concurrent.futures import ThreadPoolExecutor
        for replacement in (None, 'new-account'):
            with self.subTest(replacement=replacement):
                self.service.AUTH.invalidate()
                self.service.bili.COOKIES.clear()
                self.service.bili.COOKIES['SESSDATA'] = 'previous-account'
                self.service.bili.save_cookies()
                with patch.object(self.service.bili, 'qr_generate', return_value={'key': 'race', 'url': 'https://account.bilibili.com/test'}):
                    self.assertEqual(self.request('/api/login/qrcode')[0], 200)
                started, resume, invalidated = threading.Event(), threading.Event(), threading.Event()
                original_invalidate = self.service.AUTH.invalidate
                def invalidate():
                    result = original_invalidate()
                    invalidated.set()
                    return result
                def poll(_key):
                    self.service.bili.COOKIES['SESSDATA'] = 'stale-qr-account'
                    self.service.bili.save_cookies()
                    started.set()
                    self.assertTrue(resume.wait(2))
                    return {'state': 'confirmed', 'logged_in': True}
                def manual(_cookie):
                    self.service.bili.COOKIES['SESSDATA'] = 'new-account'
                    self.service.bili.save_cookies()
                    return {'logged_in': True}
                with patch.object(self.service.bili, 'qr_poll', side_effect=poll), \
                     patch.object(self.service.bili, 'manual_login', side_effect=manual), \
                     patch.object(self.service.AUTH, 'invalidate', side_effect=invalidate), \
                     ThreadPoolExecutor(max_workers=2) as pool:
                    pending = pool.submit(self.request, '/api/login/poll?key=race')
                    self.assertTrue(started.wait(2))
                    self.assertEqual(json.loads(Path(self.service.bili.COOKIE_FILE).read_text())['SESSDATA'], 'previous-account')
                    endpoint = '/api/login/logout' if replacement is None else '/api/login/manual'
                    update = pool.submit(self.request, endpoint, {} if replacement is None else {'cookie': 'SESSDATA=new-account'})
                    self.assertTrue(invalidated.wait(2))
                    resume.set()
                    self.assertEqual(pending.result()[1]['state'], 'expired')
                    self.assertEqual(update.result()[0], 200)
                cookies = json.loads(Path(self.service.bili.COOKIE_FILE).read_text())
                self.assertEqual(cookies.get('SESSDATA'), replacement)
                self.assertEqual(self.request('/api/login/poll?key=race')[1]['state'], 'expired')

    def test_cancelled_qr_never_commits_credentials(self):
        self.service.AUTH.invalidate()
        with patch.object(self.service.bili, 'qr_generate', return_value={'key': 'cancel', 'url': 'https://account.bilibili.com/test'}):
            self.request('/api/login/qrcode')
        self.assertEqual(self.request('/api/login/cancel', {'key': 'cancel'})[0], 200)
        with patch.object(self.service.bili, 'qr_poll') as poll:
            self.assertEqual(self.request('/api/login/poll?key=cancel')[1]['state'], 'expired')
            poll.assert_not_called()

    def test_mp3_ranges_and_missing_encoder(self):
        self.assertEqual(self.service.byte_range('bytes=2-5', 8), (2, 5, 206))
        self.assertEqual(self.service.byte_range('bytes=-3', 8), (5, 7, 206))
        self.assertEqual(self.service.byte_range(None, 8), (0, 7, 200))
        for header in ['bytes=9-', 'bytes=5-2', 'bytes=-0', 'bytes=1-2,4-5']:
            with self.assertRaises(ValueError):
                self.service.byte_range(header, 8)
        cache = self.service.Mp3Cache(Path(self.temp.name) / 'disabled', None, False)
        with self.assertRaisesRegex(RuntimeError, 'FFmpeg'):
            cache.get('test', lambda: None)

    def test_slow_cdn_deadline_releases_conversion_slots(self):
        import time
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        stopped = threading.Event()
        class SlowCdn(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass
            def do_GET(self):
                self.send_response(200)
                self.send_header('Content-Length', '1000')
                self.end_headers()
                try:
                    for _ in range(30):
                        self.wfile.write(b'a')
                        self.wfile.flush()
                        if stopped.wait(0.02):
                            break
                except OSError:
                    pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), SlowCdn)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f'http://127.0.0.1:{server.server_port}/audio'
            cache = self.service.Mp3Cache(Path(self.temp.name) / 'slow-cdn', 'unused-encoder', True)
            started = time.monotonic()
            with self.assertRaisesRegex(RuntimeError, '超时'):
                cache.get('slow', lambda: self.service.open_cdn_source(url, lambda _url: None, {}, timeout=0.15))
            self.assertLess(time.monotonic() - started, 0.5)
            self.assertEqual(cache.pending, set())
            self.assertTrue(cache.slots.acquire(blocking=False))
            self.assertTrue(cache.slots.acquire(blocking=False))
            cache.slots.release()
            cache.slots.release()
            self.assertEqual(list(cache.directory.iterdir()), [])
        finally:
            stopped.set()
            server.shutdown()
            server.server_close()
            thread.join()

    def test_slow_cover_deadline_releases_image_slot(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from http.client import IncompleteRead
        stopped, released = threading.Event(), threading.Event()
        class SlowImage(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass
            def do_GET(self):
                self.send_response(200)
                self.send_header('Content-Type', 'image/png')
                self.send_header('Content-Length', '1000')
                self.end_headers()
                try:
                    for _ in range(30):
                        self.wfile.write(b'a')
                        self.wfile.flush()
                        if stopped.wait(0.02):
                            break
                except OSError:
                    pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), SlowImage)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        original_open = self.service.open_cdn_source
        original_release = self.service.IMAGE_SLOTS.release
        def open_test_source(_url, _validate, headers, timeout):
            self.assertEqual(timeout, 12)
            return original_open(f'http://127.0.0.1:{server.server_port}/image', lambda _url: None, headers, timeout=0.15)
        def release_slot():
            original_release()
            released.set()
        try:
            with patch.object(self.service, 'open_cdn_source', side_effect=open_test_source), \
                 patch.object(self.service.IMAGE_SLOTS, 'release', side_effect=release_slot):
                request = urllib.request.Request(self.base + '/api/image?url=https://i0.hdslb.com/cover.jpg',
                                                 headers={'Authorization': 'Bearer ' + self.service.TOKEN})
                with urllib.request.urlopen(request, timeout=2) as response:
                    with self.assertRaises(IncompleteRead):
                        response.read()
                self.assertTrue(released.wait(2))
            for _ in range(4):
                self.assertTrue(self.service.IMAGE_SLOTS.acquire(blocking=False))
            for _ in range(4):
                self.service.IMAGE_SLOTS.release()
        finally:
            stopped.set()
            server.shutdown()
            server.server_close()
            thread.join()

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), '本机需要 FFmpeg 和 ffprobe')
    def test_real_mp3_conversion_cache_and_failure_cleanup(self):
        import subprocess
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(44100)
            wav.writeframes(b'\x00\x00' * 44100)
        calls = []
        def source():
            calls.append(1)
            response = io.BytesIO(buffer.getvalue())
            response.status = 200
            response.headers = {'Content-Length': str(len(buffer.getvalue()))}
            return response
        cache = self.service.Mp3Cache(Path(self.temp.name) / 'conversion', shutil.which('ffmpeg'), True)
        result = cache.get('test-wav', source)
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name',
                                '-of', 'json', str(result)], capture_output=True, check=True)
        self.assertEqual(json.loads(probe.stdout)['streams'][0]['codec_name'], 'mp3')
        self.assertEqual(cache.get('test-wav', source), result)
        self.assertEqual(len(calls), 1)
        def broken():
            response = io.BytesIO(b'not an audio file')
            response.status, response.headers = 200, {}
            return response
        with self.assertRaisesRegex(RuntimeError, '转换失败'):
            cache.get('broken-input', broken)
        self.assertEqual(len(list(cache.directory.iterdir())), 1)


if __name__ == '__main__':
    unittest.main()
