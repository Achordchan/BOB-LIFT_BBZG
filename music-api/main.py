"""网易云音乐API服务主程序

提供网易云音乐相关API服务，包括：
- 歌曲信息获取
- 音乐搜索
- 歌单和专辑详情
- 音乐下载
- 健康检查
"""

import base64
import io
import logging
import os
import sys
import threading
import time
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
from urllib.parse import quote
from flask import Flask, request, send_file, render_template, Response

try:
    from music_api import (
        NeteaseAPI, APIException, QualityLevel, QRLoginManager,
        url_v1, name_v1, lyric_v1, search_music,
        playlist_detail, album_detail
    )
    from cookie_manager import CookieManager, CookieException
    from music_downloader import MusicDownloader, DownloadException, AudioFormat
except ImportError as e:
    print(f"导入模块失败: {e}")
    print("请确保所有依赖模块存在且可用")
    sys.exit(1)


@dataclass
class APIConfig:
    """API配置类"""
    host: str = os.environ.get('NETEASE_API_HOST', '127.0.0.1')
    port: int = int(os.environ.get('NETEASE_API_PORT', '5000'))
    debug: bool = False
    downloads_dir: str = 'downloads'
    max_file_size: int = 500 * 1024 * 1024  # 500MB
    request_timeout: int = 30
    log_level: str = 'INFO'
    cors_origins: str = '*'


class APIResponse:
    """API响应工具类"""
    
    @staticmethod
    def success(data: Any = None, message: str = 'success', status_code: int = 200) -> Tuple[Dict[str, Any], int]:
        """成功响应"""
        response = {
            'status': status_code,
            'success': True,
            'message': message
        }
        if data is not None:
            response['data'] = data
        return response, status_code
    
    @staticmethod
    def error(message: str, status_code: int = 400, error_code: str = None) -> Tuple[Dict[str, Any], int]:
        """错误响应"""
        response = {
            'status': status_code,
            'success': False,
            'message': message
        }
        if error_code:
            response['error_code'] = error_code
        return response, status_code


class MusicAPIService:
    """音乐API服务类"""
    
    def __init__(self, config: APIConfig):
        self.config = config
        self.logger = self._setup_logger()
        self.cookie_manager = CookieManager(os.environ.get('NETEASE_COOKIE_FILE', 'cookie.txt'))
        self.netease_api = NeteaseAPI()
        self.qr_manager = QRLoginManager()
        # 最近一次下发的扫码 key；仅允许它写入 Cookie，
        # 防止“重新扫码”后旧二维码达成登录再覆盖新授权。
        # _auth_lock 串行化 active_qr_key 的变更与 Cookie 读写/清除，
        # 避免线程化 Flask 下“检查-写入”之间的竞态。
        self.active_qr_key = None
        self.qr_seq = 0
        self._auth_lock = threading.Lock()
        self.downloader = MusicDownloader()
        
        # 创建下载目录
        self.downloads_path = Path(config.downloads_dir)
        self.downloads_path.mkdir(exist_ok=True)
        
        self.logger.info(f"音乐API服务初始化完成，下载目录: {self.downloads_path.absolute()}")
    
    def _setup_logger(self) -> logging.Logger:
        """设置日志记录器"""
        logger = logging.getLogger('music_api')
        logger.setLevel(getattr(logging, self.config.log_level.upper()))
        
        if not logger.handlers:
            # 控制台处理器
            console_handler = logging.StreamHandler()
            console_formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            console_handler.setFormatter(console_formatter)
            logger.addHandler(console_handler)
            
            # 文件处理器
            try:
                file_handler = logging.FileHandler('music_api.log', encoding='utf-8')
                file_formatter = logging.Formatter(
                    '%(asctime)s - %(name)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s'
                )
                file_handler.setFormatter(file_formatter)
                logger.addHandler(file_handler)
            except Exception as e:
                logger.warning(f"无法创建日志文件: {e}")
        
        return logger
    
    def _get_cookies(self) -> Dict[str, str]:
        """获取Cookie"""
        try:
            cookie_str = self.cookie_manager.read_cookie()
            return self.cookie_manager.parse_cookie_string(cookie_str)
        except CookieException as e:
            self.logger.warning(f"获取Cookie失败: {e}")
            return {}
        except Exception as e:
            self.logger.error(f"Cookie处理异常: {e}")
            return {}
    
    def _extract_music_id(self, id_or_url: str) -> str:
        """提取音乐ID"""
        try:
            # 处理短链接
            if '163cn.tv' in id_or_url:
                import requests
                response = requests.get(id_or_url, allow_redirects=False, timeout=10)
                id_or_url = response.headers.get('Location', id_or_url)
            
            # 处理网易云链接
            if 'music.163.com' in id_or_url:
                index = id_or_url.find('id=') + 3
                if index > 2:
                    return id_or_url[index:].split('&')[0]
            
            # 直接返回ID
            return str(id_or_url).strip()
            
        except Exception as e:
            self.logger.error(f"提取音乐ID失败: {e}")
            return str(id_or_url).strip()
    
    def _format_file_size(self, size_bytes: int) -> str:
        """格式化文件大小"""
        if size_bytes == 0:
            return "0B"
        
        units = ["B", "KB", "MB", "GB", "TB"]
        size = float(size_bytes)
        unit_index = 0
        
        while size >= 1024.0 and unit_index < len(units) - 1:
            size /= 1024.0
            unit_index += 1
        
        return f"{size:.2f}{units[unit_index]}"
    
    def _get_quality_display_name(self, quality: str) -> str:
        """获取音质显示名称"""
        quality_names = {
            'standard': "标准音质",
            'exhigh': "极高音质", 
            'lossless': "无损音质",
            'hires': "Hi-Res音质",
            'sky': "沉浸环绕声",
            'jyeffect': "高清环绕声",
            'jymaster': "超清母带",
            'dolby': "杜比全景声"
        }
        return quality_names.get(quality, f"未知音质({quality})")
    
    def _validate_request_params(self, required_params: Dict[str, Any]) -> Optional[Tuple[Dict[str, Any], int]]:
        """验证请求参数"""
        for param_name, param_value in required_params.items():
            if not param_value:
                return APIResponse.error(f"参数 '{param_name}' 不能为空", 400)
        return None
    
    def _safe_get_request_data(self) -> Dict[str, Any]:
        """安全获取请求数据"""
        try:
            if request.method == 'GET':
                return dict(request.args)
            else:
                # 优先使用JSON数据，然后是表单数据
                json_data = request.get_json(silent=True) or {}
                form_data = dict(request.form)
                # 合并数据，JSON优先
                return {**form_data, **json_data}
        except Exception as e:
            self.logger.error(f"获取请求数据失败: {e}")
            return {}

    def build_qr_data_uri(self, login_url: str) -> str:
        """将登录链接生成二维码，返回 data:image/svg+xml 的 base64 data URI。

        使用 qrcode 的 SVG 工厂，无需 Pillow 依赖。
        """
        import qrcode
        import qrcode.image.svg

        factory = qrcode.image.svg.SvgPathImage
        img = qrcode.make(login_url, image_factory=factory)
        buf = io.BytesIO()
        img.save(buf)
        svg_bytes = buf.getvalue()
        b64 = base64.b64encode(svg_bytes).decode('ascii')
        return f"data:image/svg+xml;base64,{b64}"

    def backup_existing_cookie(self, suffix: Optional[str] = None) -> None:
        """备份当前 cookie（若存在且非空）。

        备份失败时抛出 CookieException，用于在覆盖/清除前中止破坏性操作，
        兑现“覆盖前自动备份”的保证，避免在无法备份时丢失唯一副本。
        """
        try:
            has_existing = self.cookie_manager.cookie_file.exists() and bool(self.cookie_manager.read_cookie())
        except Exception:
            # 读取失败按“存在”处理，强制走备份逻辑（备份失败则中止）
            has_existing = self.cookie_manager.cookie_file.exists()
        if not has_existing:
            return
        if suffix:
            self.cookie_manager.backup_cookie(suffix)
        else:
            self.cookie_manager.backup_cookie()

    def save_login_cookie(self, cookie_dict: Dict[str, str]) -> Tuple[bool, str]:
        """将扫码得到的 cookie 字典写入 cookie 文件（写入前自动备份）。

        Returns:
            (是否成功, 错误信息)
        """
        music_u = (cookie_dict or {}).get('MUSIC_U', '')
        if not music_u:
            return False, '未获取到 MUSIC_U'

        # 组装 cookie 字符串，补充网易云客户端常用字段
        parts = [f"MUSIC_U={music_u}"]
        for name in ('MUSIC_A', '__csrf', 'NMTID'):
            value = cookie_dict.get(name)
            if value:
                parts.append(f"{name}={value}")
        parts.extend(['os=pc', 'appver=8.9.70'])
        cookie_string = '; '.join(parts)

        # 覆盖前备份现有 cookie；备份失败则中止，不销毁原副本
        try:
            self.backup_existing_cookie()
        except CookieException as e:
            return False, f'备份现有 Cookie 失败，已中止覆盖: {e}'

        ok = self.cookie_manager.write_cookie(cookie_string)
        return (ok, '' if ok else '写入 Cookie 失败')


# 创建Flask应用和服务实例
config = APIConfig()
app = Flask(__name__)
api_service = MusicAPIService(config)


@app.before_request
def before_request():
    """请求前处理"""
    # 记录请求信息
    api_service.logger.info(
        f"{request.method} {request.path} - IP: {request.remote_addr} - "
        f"User-Agent: {request.headers.get('User-Agent', 'Unknown')}"
    )


@app.after_request
def after_request(response: Response) -> Response:
    """请求后处理 - 设置CORS头"""
    response.headers.add('Access-Control-Allow-Origin', config.cors_origins)
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    response.headers.add('Access-Control-Max-Age', '3600')
    
    # 记录响应信息
    api_service.logger.info(f"响应状态: {response.status_code}")
    return response


@app.errorhandler(400)
def handle_bad_request(e):
    """处理400错误"""
    return APIResponse.error("请求参数错误", 400)


@app.errorhandler(404)
def handle_not_found(e):
    """处理404错误"""
    return APIResponse.error("请求的资源不存在", 404)


@app.errorhandler(500)
def handle_internal_error(e):
    """处理500错误"""
    api_service.logger.error(f"服务器内部错误: {e}")
    return APIResponse.error("服务器内部错误", 500)


@app.route('/')
def index() -> str:
    """首页路由"""
    return render_template('index.html')


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查API"""
    try:
        # 检查Cookie状态
        cookie_status = api_service.cookie_manager.is_cookie_valid()
        
        health_info = {
            'service': 'running',
            'timestamp': int(time.time()) if 'time' in sys.modules else None,
            'cookie_status': 'valid' if cookie_status else 'invalid',
            'downloads_dir': str(api_service.downloads_path.absolute()),
            'version': '2.0.0'
        }
        
        return APIResponse.success(health_info, "API服务运行正常")
        
    except Exception as e:
        api_service.logger.error(f"健康检查失败: {e}")
        return APIResponse.error(f"健康检查失败: {str(e)}", 500)


@app.route('/song', methods=['GET', 'POST'])
@app.route('/Song_V1', methods=['GET', 'POST'])  # 向后兼容
def get_song_info():
    """获取歌曲信息API"""
    try:
        # 获取请求参数
        data = api_service._safe_get_request_data()
        song_ids = data.get('ids') or data.get('id')
        url = data.get('url')
        level = data.get('level', 'lossless')
        info_type = data.get('type', 'url')
        
        # 参数验证
        if not song_ids and not url:
            return APIResponse.error("必须提供 'ids'、'id' 或 'url' 参数")
        
        # 提取音乐ID
        music_id = api_service._extract_music_id(song_ids or url)
        
        # 验证音质参数
        valid_levels = ['standard', 'exhigh', 'lossless', 'hires', 'sky', 'jyeffect', 'jymaster']
        if level not in valid_levels:
            return APIResponse.error(f"无效的音质参数，支持: {', '.join(valid_levels)}")
        
        # 验证类型参数
        valid_types = ['url', 'name', 'lyric', 'json']
        if info_type not in valid_types:
            return APIResponse.error(f"无效的类型参数，支持: {', '.join(valid_types)}")
        
        cookies = api_service._get_cookies()
        
        # 根据类型获取不同信息
        if info_type == 'url':
            result = url_v1(music_id, level, cookies)
            if result and result.get('data') and len(result['data']) > 0:
                song_data = result['data'][0]
                response_data = {
                    'id': song_data.get('id'),
                    'url': song_data.get('url'),
                    'level': song_data.get('level'),
                    'quality_name': api_service._get_quality_display_name(song_data.get('level', level)),
                    'size': song_data.get('size'),
                    'size_formatted': api_service._format_file_size(song_data.get('size', 0)),
                    'type': song_data.get('type'),
                    'bitrate': song_data.get('br')
                }
                return APIResponse.success(response_data, "获取歌曲URL成功")
            else:
                return APIResponse.error("获取音乐URL失败，可能是版权限制或音质不支持", 404)
        
        elif info_type == 'name':
            result = name_v1(music_id)
            return APIResponse.success(result, "获取歌曲信息成功")
        
        elif info_type == 'lyric':
            result = lyric_v1(music_id, cookies)
            return APIResponse.success(result, "获取歌词成功")
        
        elif info_type == 'json':
            # 获取完整的歌曲信息（用于前端解析）
            song_info = name_v1(music_id)
            url_info = url_v1(music_id, level, cookies)
            lyric_info = lyric_v1(music_id, cookies)
            
            if not song_info or 'songs' not in song_info or not song_info['songs']:
                return APIResponse.error("未找到歌曲信息", 404)
            
            song_data = song_info['songs'][0]
            
            # 构建前端期望的响应格式
            response_data = {
                'id': music_id,
                'name': song_data.get('name', ''),
                'ar_name': ', '.join(artist['name'] for artist in song_data.get('ar', [])),
                'al_name': song_data.get('al', {}).get('name', ''),
                'pic': song_data.get('al', {}).get('picUrl', ''),
                'level': level,
                'lyric': lyric_info.get('lrc', {}).get('lyric', '') if lyric_info else '',
                'tlyric': lyric_info.get('tlyric', {}).get('lyric', '') if lyric_info else ''
            }
            
            # 添加URL和大小信息
            if url_info and url_info.get('data') and len(url_info['data']) > 0:
                url_data = url_info['data'][0]
                response_data.update({
                    'url': url_data.get('url', ''),
                    'size': api_service._format_file_size(url_data.get('size', 0)),
                    'level': url_data.get('level', level)
                })
            else:
                response_data.update({
                    'url': '',
                    'size': '获取失败'
                })
            
            return APIResponse.success(response_data, "获取歌曲信息成功")
            
    except APIException as e:
        api_service.logger.error(f"API调用失败: {e}")
        return APIResponse.error(f"API调用失败: {str(e)}", 500)
    except Exception as e:
        api_service.logger.error(f"获取歌曲信息异常: {e}\n{traceback.format_exc()}")
        return APIResponse.error(f"服务器错误: {str(e)}", 500)


@app.route('/search', methods=['GET', 'POST'])
@app.route('/Search', methods=['GET', 'POST'])  # 向后兼容
def search_music_api():
    """搜索音乐API"""
    try:
        # 获取请求参数
        data = api_service._safe_get_request_data()
        keyword = data.get('keyword') or data.get('keywords') or data.get('q')
        limit = int(data.get('limit', 30))
        offset = int(data.get('offset', 0))
        search_type = data.get('type', '1')  # 1-歌曲, 10-专辑, 100-歌手, 1000-歌单
        
        # 参数验证
        validation_error = api_service._validate_request_params({'keyword': keyword})
        if validation_error:
            return validation_error
        
        # 限制搜索数量
        if limit > 100:
            limit = 100
        
        cookies = api_service._get_cookies()
        result = search_music(keyword, cookies, limit, offset)
        
        # search_music返回的是歌曲列表，需要包装成前端期望的格式
        if result:
            for song in result:
                # 添加艺术家字符串（如果需要）
                if 'artists' in song:
                    song['artist_string'] = song['artists']
        
        return APIResponse.success(result, "搜索完成")
        
    except ValueError as e:
        return APIResponse.error(f"参数格式错误: {str(e)}")
    except Exception as e:
        api_service.logger.error(f"搜索音乐异常: {e}\n{traceback.format_exc()}")
        return APIResponse.error(f"搜索失败: {str(e)}", 500)


@app.route('/playlist', methods=['GET', 'POST'])
@app.route('/Playlist', methods=['GET', 'POST'])  # 向后兼容
def get_playlist():
    """获取歌单详情API"""
    try:
        # 获取请求参数
        data = api_service._safe_get_request_data()
        playlist_id = data.get('id')
        
        # 参数验证
        validation_error = api_service._validate_request_params({'playlist_id': playlist_id})
        if validation_error:
            return validation_error
        
        cookies = api_service._get_cookies()
        result = playlist_detail(playlist_id, cookies)
        
        # 适配前端期望的响应格式
        response_data = {
            'status': 'success',
            'playlist': result
        }
        
        return APIResponse.success(response_data, "获取歌单详情成功")
        
    except Exception as e:
        api_service.logger.error(f"获取歌单异常: {e}\n{traceback.format_exc()}")
        return APIResponse.error(f"获取歌单失败: {str(e)}", 500)


@app.route('/album', methods=['GET', 'POST'])
@app.route('/Album', methods=['GET', 'POST'])  # 向后兼容
def get_album():
    """获取专辑详情API"""
    try:
        # 获取请求参数
        data = api_service._safe_get_request_data()
        album_id = data.get('id')
        
        # 参数验证
        validation_error = api_service._validate_request_params({'album_id': album_id})
        if validation_error:
            return validation_error
        
        cookies = api_service._get_cookies()
        result = album_detail(album_id, cookies)
        
        # 适配前端期望的响应格式
        response_data = {
            'status': 200,
            'album': result
        }
        
        return APIResponse.success(response_data, "获取专辑详情成功")
        
    except Exception as e:
        api_service.logger.error(f"获取专辑异常: {e}\n{traceback.format_exc()}")
        return APIResponse.error(f"获取专辑失败: {str(e)}", 500)


@app.route('/download', methods=['GET', 'POST'])
@app.route('/Download', methods=['GET', 'POST'])  # 向后兼容
def download_music_api():
    """下载音乐API"""
    try:
        # 获取请求参数
        data = api_service._safe_get_request_data()
        music_id = data.get('id')
        quality = data.get('quality', 'lossless')
        return_format = data.get('format', 'file')  # file 或 json
        
        # 参数验证
        validation_error = api_service._validate_request_params({'music_id': music_id})
        if validation_error:
            return validation_error
        
        # 验证音质参数
        valid_qualities = ['standard', 'exhigh', 'lossless', 'hires', 'sky', 'jyeffect', 'jymaster']
        if quality not in valid_qualities:
            return APIResponse.error(f"无效的音质参数，支持: {', '.join(valid_qualities)}")
        
        # 验证返回格式
        if return_format not in ['file', 'json']:
            return APIResponse.error("返回格式只支持 'file' 或 'json'")
        
        music_id = api_service._extract_music_id(music_id)
        cookies = api_service._get_cookies()
        
        # 获取音乐基本信息
        song_info = name_v1(music_id)
        if not song_info or 'songs' not in song_info or not song_info['songs']:
            return APIResponse.error("未找到音乐信息", 404)
        
        # 获取音乐下载链接
        url_info = url_v1(music_id, quality, cookies)
        if not url_info or 'data' not in url_info or not url_info['data'] or not url_info['data'][0].get('url'):
            return APIResponse.error("无法获取音乐下载链接，可能是版权限制或音质不支持", 404)
        
        # 构建音乐信息
        song_data = song_info['songs'][0]
        url_data = url_info['data'][0]
        
        music_info = {
            'id': music_id,
            'name': song_data['name'],
            'artist_string': ', '.join(artist['name'] for artist in song_data['ar']),
            'album': song_data['al']['name'],
            'pic_url': song_data['al']['picUrl'],
            'file_type': url_data['type'],
            'file_size': url_data['size'],
            'duration': song_data.get('dt', 0),
            'download_url': url_data['url']
        }
        
        # 生成安全文件名
        safe_name = f"{music_info['name']} [{quality}]"
        safe_name = ''.join(c for c in safe_name if c not in r'<>:"/\|?*')
        filename = f"{safe_name}.{music_info['file_type']}"
        
        file_path = api_service.downloads_path / filename
        
        # 检查文件是否已存在
        if file_path.exists():
            api_service.logger.info(f"文件已存在: {filename}")
        else:
            # 使用优化后的下载器下载
            try:
                download_result = api_service.downloader.download_music_file(
                    music_id, quality
                )
                
                if not download_result.success:
                    return APIResponse.error(f"下载失败: {download_result.error_message}", 500)
                
                file_path = Path(download_result.file_path)
                api_service.logger.info(f"下载完成: {filename}")
                
            except DownloadException as e:
                api_service.logger.error(f"下载异常: {e}")
                return APIResponse.error(f"下载失败: {str(e)}", 500)
        
        # 根据返回格式返回结果
        if return_format == 'json':
            response_data = {
                'music_id': music_id,
                'name': music_info['name'],
                'artist': music_info['artist_string'],
                'album': music_info['album'],
                'quality': quality,
                'quality_name': api_service._get_quality_display_name(quality),
                'file_type': music_info['file_type'],
                'file_size': music_info['file_size'],
                'file_size_formatted': api_service._format_file_size(music_info['file_size']),
                'file_path': str(file_path.absolute()),
                'filename': filename,
                'duration': music_info['duration']
            }
            return APIResponse.success(response_data, "下载完成")
        else:
            # 返回文件下载
            if not file_path.exists():
                return APIResponse.error("文件不存在", 404)
            
            try:
                response = send_file(
                    str(file_path),
                    as_attachment=True,
                    download_name=filename,
                    mimetype=f"audio/{music_info['file_type']}"
                )
                response.headers['X-Download-Message'] = 'Download completed successfully'
                response.headers['X-Download-Filename'] = quote(filename, safe='')
                return response
            except Exception as e:
                api_service.logger.error(f"发送文件失败: {e}")
                return APIResponse.error(f"文件发送失败: {str(e)}", 500)
            
    except Exception as e:
        api_service.logger.error(f"下载音乐异常: {e}\n{traceback.format_exc()}")
        return APIResponse.error(f"下载异常: {str(e)}", 500)


@app.route('/api/info', methods=['GET'])
def api_info():
    """API信息接口"""
    try:
        info = {
            'name': '网易云音乐API服务',
            'version': '2.0.0',
            'description': '提供网易云音乐相关API服务',
            'endpoints': {
                '/health': 'GET - 健康检查',
                '/song': 'GET/POST - 获取歌曲信息',
                '/search': 'GET/POST - 搜索音乐',
                '/playlist': 'GET/POST - 获取歌单详情',
                '/album': 'GET/POST - 获取专辑详情',
                '/download': 'GET/POST - 下载音乐',
                '/api/info': 'GET - API信息'
            },
            'supported_qualities': [
                'standard', 'exhigh', 'lossless', 
                'hires', 'sky', 'jyeffect', 'jymaster'
            ],
            'config': {
                'downloads_dir': str(api_service.downloads_path.absolute()),
                'max_file_size': f"{config.max_file_size // (1024*1024)}MB",
                'request_timeout': f"{config.request_timeout}s"
            }
        }
        
        return APIResponse.success(info, "API信息获取成功")
        
    except Exception as e:
        api_service.logger.error(f"获取API信息异常: {e}")
        return APIResponse.error(f"获取API信息失败: {str(e)}", 500)


def _build_cookie_status(verify: bool = True) -> Dict[str, Any]:
    """构造 cookie/登录状态信息（不含敏感明文）。

    Args:
        verify: 是否向网易云实时校验登录态。为 True 时 logged_in 反映
                “已确认有效”，而非仅本地格式合法，避免把已失效的
                Cookie 长期显示为“已授权”。
    """
    info = api_service.cookie_manager.get_cookie_info()
    cookie_present = bool(info.get('cookie_count'))
    format_ok = bool(info.get('is_valid'))  # 本地格式校验（含 MUSIC_U）

    verified = 'unknown'
    nickname = None
    if cookie_present and format_ok and verify:
        try:
            cookies = api_service._get_cookies()
            verified, profile = api_service.netease_api.get_login_status(cookies)
            if profile:
                nickname = profile.get('nickname')
        except Exception as e:
            api_service.logger.warning(f"校验登录态失败: {e}")
            verified = 'unknown'
    elif not (cookie_present and format_ok):
        verified = 'invalid'

    # 仅当实时校验确认有效时才判为已登录；网络无法校验时不下“未登录”结论
    logged_in = (verified == 'valid')

    return {
        'logged_in': logged_in,
        'verified': verified,
        'cookie_present': cookie_present,
        'format_ok': format_ok,
        'nickname': nickname,
        'important_cookies_present': info.get('important_cookies_present', []),
        'missing_important_cookies': info.get('missing_important_cookies', []),
        'last_modified': info.get('last_modified'),
    }


@app.route('/qrlogin/create', methods=['GET', 'POST'])
def qrlogin_create():
    """创建扫码登录二维码，返回 unikey 与二维码图片(data URI)。"""
    try:
        # 先在锁内预留一个递增序号，再发起网络请求：
        # 只有“最新一次 create”能最终激活自己的 key，避免慢速的旧 create
        # 在新 create 之后才回来改写 active_qr_key，把新二维码误判为已取代
        with api_service._auth_lock:
            api_service.qr_seq += 1
            my_seq = api_service.qr_seq

        unikey = api_service.qr_manager.generate_qr_key()
        if not unikey:
            return APIResponse.error("生成二维码失败，请稍后重试", 502)

        with api_service._auth_lock:
            if my_seq != api_service.qr_seq:
                # 已有更晚的 create 发起，本次作废，让前端用最新的二维码
                return APIResponse.error("二维码已被新的请求取代，请重试", 409)
            api_service.active_qr_key = unikey

        login_url = f'https://music.163.com/login?codekey={unikey}'
        data = {
            'key': unikey,
            'login_url': login_url,
            'qr_image': api_service.build_qr_data_uri(login_url),
            'expires_in': 180,
        }
        return APIResponse.success(data, "二维码创建成功")
    except APIException as e:
        return APIResponse.error(f"生成二维码失败: {str(e)}", 502)
    except Exception as e:
        api_service.logger.error(f"创建二维码异常: {e}\n{traceback.format_exc()}")
        return APIResponse.error(f"创建二维码失败: {str(e)}", 500)


@app.route('/qrlogin/check', methods=['GET', 'POST'])
def qrlogin_check():
    """轮询扫码登录状态。登录成功(803)时写入 cookie。

    状态码含义：801 等待扫码 / 802 已扫码待确认 / 803 登录成功 / 800 二维码过期。
    """
    try:
        data = api_service._safe_get_request_data()
        unikey = data.get('key') or data.get('unikey')
        if not unikey:
            return APIResponse.error("缺少 key 参数", 400)

        code, cookie_dict = api_service.qr_manager.check_qr_login(unikey)

        status_map = {
            800: 'expired',
            801: 'waiting',
            802: 'scanned',
            803: 'success',
        }
        status = status_map.get(code, 'unknown')

        cookie_saved = False
        if code == 803:
            # 「检查活跃 key + 写入」在同一把锁内完成，避免与并发的
            # /qrlogin/create（改写 active_qr_key）或 /cookie/clear 交错
            save_error = ''
            superseded = False
            with api_service._auth_lock:
                if unikey != api_service.active_qr_key:
                    superseded = True
                else:
                    cookie_saved, save_error = api_service.save_login_cookie(cookie_dict)
            if superseded:
                return APIResponse.success(
                    {'code': code, 'status': 'superseded', 'cookie_saved': False},
                    "二维码已被新的扫码会话取代"
                )
            if not cookie_saved:
                return APIResponse.error(save_error or "登录成功但未能保存 Cookie，请重试", 502)

        payload = {
            'code': code,
            'status': status,
            'cookie_saved': cookie_saved,
        }
        if code == 803:
            payload['cookie_status'] = _build_cookie_status()
        return APIResponse.success(payload, "查询成功")
    except APIException as e:
        return APIResponse.error(f"查询登录状态失败: {str(e)}", 502)
    except Exception as e:
        api_service.logger.error(f"查询登录状态异常: {e}\n{traceback.format_exc()}")
        return APIResponse.error(f"查询登录状态失败: {str(e)}", 500)


@app.route('/cookie/status', methods=['GET'])
def cookie_status():
    """查询当前 cookie/登录状态。"""
    try:
        return APIResponse.success(_build_cookie_status(), "获取成功")
    except Exception as e:
        api_service.logger.error(f"获取 cookie 状态异常: {e}")
        return APIResponse.error(f"获取 cookie 状态失败: {str(e)}", 500)


@app.route('/cookie/set', methods=['POST'])
def cookie_set():
    """手动录入 cookie（粘贴方式），写入前自动备份。"""
    try:
        data = api_service._safe_get_request_data()
        cookie_content = str(data.get('cookie') or data.get('content') or '').strip()
        if not cookie_content:
            return APIResponse.error("cookie 内容不能为空", 400)

        if not api_service.cookie_manager.validate_cookie_format(cookie_content):
            return APIResponse.error("cookie 格式无效", 400)

        # 必须包含有效 MUSIC_U，否则会用无效凭证覆盖掉可用登录态
        parsed = api_service.cookie_manager.parse_cookie_string(cookie_content)
        music_u = parsed.get('MUSIC_U', '')
        if not music_u or len(music_u) < 10:
            return APIResponse.error("cookie 缺少有效的 MUSIC_U 字段", 400)

        # 手动录入即视为最新授权：使任何进行中的扫码会话失效，
        # 备份+写入与 key 失效在同一把锁内完成
        with api_service._auth_lock:
            try:
                api_service.backup_existing_cookie()
            except CookieException as e:
                return APIResponse.error(f"备份现有 Cookie 失败，已中止覆盖: {str(e)}", 500)
            api_service.active_qr_key = None
            api_service.cookie_manager.write_cookie(cookie_content)
        return APIResponse.success(_build_cookie_status(), "cookie 已保存")
    except CookieException as e:
        return APIResponse.error(f"保存 cookie 失败: {str(e)}", 400)
    except Exception as e:
        api_service.logger.error(f"保存 cookie 异常: {e}")
        return APIResponse.error(f"保存 cookie 失败: {str(e)}", 500)


@app.route('/cookie/clear', methods=['POST'])
def cookie_clear():
    """清除当前 cookie（登出），清除前自动备份。"""
    try:
        # 失效进行中的扫码会话 + 备份 + 清除，须原子完成，
        # 否则在途的旧扫码 803 可能在登出后又把 Cookie 写回来
        with api_service._auth_lock:
            try:
                api_service.backup_existing_cookie('logout')
            except CookieException as e:
                return APIResponse.error(f"备份现有 Cookie 失败，已中止清除: {str(e)}", 500)
            # 先失效扫码会话（无论清除是否成功都不让旧扫码写回），再清除
            api_service.active_qr_key = None
            cleared = api_service.cookie_manager.clear_cookie()
            if not cleared:
                return APIResponse.error("清除 Cookie 失败，请检查文件权限", 500)
        # 已清除，无需再向网易云校验
        return APIResponse.success(_build_cookie_status(verify=False), "已清除登录")
    except Exception as e:
        api_service.logger.error(f"清除 cookie 异常: {e}")
        return APIResponse.error(f"清除 cookie 失败: {str(e)}", 500)


def start_api_server():
    """启动API服务器"""
    try:
        print("\n" + "="*60)
        print("🚀 网易云音乐API服务启动中...")
        print("="*60)
        print(f"📡 服务地址: http://{config.host}:{config.port}")
        print(f"📁 下载目录: {api_service.downloads_path.absolute()}")
        print(f"📋 日志级别: {config.log_level}")
        print("\n📚 API端点:")
        print(f"  ├─ GET  /health        - 健康检查")
        print(f"  ├─ POST /song          - 获取歌曲信息")
        print(f"  ├─ POST /search        - 搜索音乐")
        print(f"  ├─ POST /playlist      - 获取歌单详情")
        print(f"  ├─ POST /album         - 获取专辑详情")
        print(f"  ├─ POST /download      - 下载音乐")
        print(f"  └─ GET  /api/info      - API信息")
        print("\n🎵 支持的音质:")
        print(f"  standard, exhigh, lossless, hires, sky, jyeffect, jymaster")
        print("="*60)
        print(f"⏰ 启动时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print("🌟 服务已就绪，等待请求...\n")
        
        # 启动Flask应用
        app.run(
            host=config.host,
            port=config.port,
            debug=config.debug,
            threaded=True
        )
        
    except KeyboardInterrupt:
        print("\n\n👋 服务已停止")
    except Exception as e:
        api_service.logger.error(f"启动服务失败: {e}")
        print(f"❌ 启动失败: {e}")
        sys.exit(1)


if __name__ == '__main__':
    start_api_server()

