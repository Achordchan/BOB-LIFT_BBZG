"""将上游音轨转为真实 MP3，缓存成品以支持 Range 播放与重复导入。"""
import hashlib
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import time


class Mp3Cache:
    def __init__(self, directory, ffmpeg, enabled):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.ffmpeg = ffmpeg
        self.enabled = enabled
        self.condition = threading.Condition()
        self.pending = set()
        self.slots = threading.BoundedSemaphore(2)

    def prune(self, keep=None):
        files = sorted(self.directory.glob('*.mp3'), key=lambda p: p.stat().st_mtime)
        total = sum(p.stat().st_size for p in files)
        for file in files:
            if file == keep:
                continue
            try:
                stat = file.stat()
                if time.time() - stat.st_mtime > 86400 or total > 512 * 1024 * 1024:
                    file.unlink(missing_ok=True)
                    total -= stat.st_size
            except FileNotFoundError:
                pass

    def get(self, identifier, open_source):
        if not self.enabled or not self.ffmpeg:
            raise RuntimeError('服务端未安装支持 libmp3lame 的 FFmpeg，无法转换 MP3')
        key = hashlib.sha256(identifier.encode()).hexdigest()
        target = self.directory / f'{key}.mp3'
        with self.condition:
            if not self.condition.wait_for(lambda: key not in self.pending, timeout=120):
                raise RuntimeError('音频转换等待超时，请稍后重试')
            self.prune()
            if target.exists() and target.stat().st_size:
                os.utime(target, None)
                return target
            if not self.slots.acquire(blocking=False):
                raise RuntimeError('已有音频正在转换，请稍后重试')
            self.pending.add(key)
        try:
            with tempfile.TemporaryDirectory(prefix='convert-', dir=self.directory) as directory:
                source = Path(directory) / 'source.audio'
                output = Path(directory) / 'output.mp3'
                deadline = time.monotonic() + 90
                received = 0
                with open_source() as upstream, source.open('wb') as writer:
                    if upstream.status != 200:
                        raise RuntimeError('下载原始音轨失败')
                    if int(upstream.headers.get('Content-Length', '0')) > 100 * 1024 * 1024:
                        raise RuntimeError('原始音轨超过 100 MiB，无法转换')
                    while True:
                        chunk = upstream.read(65536)
                        if not chunk:
                            break
                        received += len(chunk)
                        if received > 100 * 1024 * 1024:
                            raise RuntimeError('原始音轨超过 100 MiB，无法转换')
                        if time.monotonic() > deadline:
                            raise RuntimeError('音轨下载超时')
                        writer.write(chunk)
                if not received:
                    raise RuntimeError('原始音轨为空')
                try:
                    result = subprocess.run([
                        self.ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin',
                        '-protocol_whitelist', 'file,pipe', '-i', str(source),
                        '-map', '0:a:0', '-vn', '-map_metadata', '-1',
                        '-c:a', 'libmp3lame', '-b:a', '192k', '-fs', str(31 * 1024 * 1024),
                        '-f', 'mp3', str(output)
                    ], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                       stderr=subprocess.PIPE, timeout=90)
                except subprocess.TimeoutExpired as error:
                    raise RuntimeError('MP3 转换超时') from error
                if result.returncode or not output.exists() or not output.stat().st_size:
                    raise RuntimeError('MP3 转换失败，原始音轨无法解码')
                if output.stat().st_size > 30 * 1024 * 1024:
                    raise RuntimeError('转换后的 MP3 超过 30 MiB')
                os.replace(output, target)
            with self.condition:
                self.prune(keep=target)
            return target
        finally:
            with self.condition:
                self.pending.discard(key)
                self.slots.release()
                self.condition.notify_all()


def byte_range(header, size):
    if not header:
        return 0, size - 1, 200
    match = re.fullmatch(r'bytes=(\d*)-(\d*)', header)
    if not match or not any(match.groups()):
        raise ValueError('无效的 Range')
    first, last = match.groups()
    if first:
        start = int(first)
        end = min(int(last), size - 1) if last else size - 1
    else:
        length = int(last)
        start, end = max(0, size - length), size - 1
    if start >= size or start > end:
        raise ValueError('Range 超出音频大小')
    return start, end, 206
