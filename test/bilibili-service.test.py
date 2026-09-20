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
        handler = self.service.CdnRedirect(('bilivideo.com',))
        with self.assertRaises(ValueError):
            handler.redirect_request(None, None, 302, '', {}, 'http://127.0.0.1/private')

    def test_qr_endpoints_reuse_upstream_core(self):
        with patch.object(self.service.bili, 'qr_generate', return_value={'key': 'test', 'url': 'https://account.bilibili.com/test'}):
            self.assertEqual(self.request('/api/login/qrcode')[1]['key'], 'test')
        with patch.object(self.service.bili, 'qr_poll', return_value={'state': 'scanned'}) as check:
            self.assertEqual(self.request('/api/login/poll?key=test')[1]['state'], 'scanned')
            check.assert_called_once_with('test')

    def test_failed_manual_authorization_preserves_previous_account(self):
        self.service.bili.COOKIES.clear()
        self.service.bili.COOKIES['SESSDATA'] = 'previous-test-account'
        with patch.object(self.service.bili, 'nav_info', return_value={'logged_in': False}):
            self.assertEqual(self.request('/api/login/manual', {'cookie': 'SESSDATA=invalid-test'})[0], 400)
        self.assertEqual(self.service.bili.COOKIES['SESSDATA'], 'previous-test-account')
        self.assertEqual(Path(self.service.bili.COOKIE_FILE).stat().st_mode & 0o777, 0o600)

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
