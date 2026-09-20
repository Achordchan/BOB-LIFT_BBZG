#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bili.py —— Shared core library for the Bilibili Audio tool.

Used by both the web server (server.py) and the CLI (cli.py).

Copyright constraints (hard design rules of this library):
  - Only the *audio* stream is ever requested from Bilibili: from the DASH
    playurl response only `dash.audio` is read. `dash.video` is never read,
    proxied, or written to disk.
  - Audio can be streamed and downloaded; there is no code path for video.
"""

import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# ---------------- Cookie jar (persisted; QR login survives restarts) ----------------
COOKIE_FILE = os.path.join(ROOT, ".bili-cookies.json")
LOGIN_COOKIE_KEYS = ("SESSDATA", "bili_jct", "DedeUserID", "DedeUserID__ckMd5")
COOKIES = {}
try:
    if os.path.exists(COOKIE_FILE):
        with open(COOKIE_FILE, "r", encoding="utf-8") as f:
            COOKIES.update(json.load(f))
except Exception:
    pass
if os.environ.get("BILI_SESSDATA"):
    COOKIES["SESSDATA"] = os.environ["BILI_SESSDATA"]


def save_cookies():
    try:
        with open(COOKIE_FILE, "w", encoding="utf-8") as f:
            json.dump(COOKIES, f, ensure_ascii=False)
        os.chmod(COOKIE_FILE, 0o600)  # holds login credentials; owner-only
    except Exception:
        pass


# ---------------- MP3 transcoding capability ----------------
FFMPEG = shutil.which("ffmpeg")
MP3_OK = False
if FFMPEG:
    try:
        enc = subprocess.run(
            [FFMPEG, "-hide_banner", "-encoders"],
            capture_output=True, text=True, timeout=10,
        ).stdout
        MP3_OK = "libmp3lame" in enc
    except Exception:
        pass


def cookie_string():
    return "; ".join(f"{k}={v}" for k, v in COOKIES.items())


def absorb(res):
    for line in res.headers.get_all("Set-Cookie") or []:
        first = line.split(";", 1)[0]
        if "=" in first:
            k, v = first.split("=", 1)
            COOKIES[k.strip()] = v.strip()


def http_req(url, referer=None, method="GET", timeout=15, extra_headers=None):
    """Return a file-like response (HTTPError is returned as-is so error JSON is readable)."""
    headers = {
        "User-Agent": UA,
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Cookie": cookie_string(),
        "Referer": referer or "https://www.bilibili.com/",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, method=method, headers=headers)
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        return e


def api_json(url, referer=None, method="GET"):
    try:
        with http_req(url, referer, method) as res:
            return json.loads(res.read().decode("utf-8", "replace"))
    except Exception:
        return None


# ---------------- Wbi signature ----------------
MIXIN_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
]
_wbi = {"mixin": "", "at": 0.0}


def ensure_wbi(force=False):
    if not force and _wbi["mixin"] and time.time() - _wbi["at"] < 1800:
        return
    j = api_json("https://api.bilibili.com/x/web-interface/nav")
    img = (j or {}).get("data", {}).get("wbi_img")
    if not img or not img.get("img_url"):
        raise RuntimeError("failed to get Wbi keys (no response from Bilibili API)")
    img_key = img["img_url"].rsplit("/", 1)[-1].split(".")[0]
    sub_key = img["sub_url"].rsplit("/", 1)[-1].split(".")[0]
    raw = img_key + sub_key
    _wbi["mixin"] = "".join(raw[i] for i in MIXIN_TAB if i < len(raw))[:32]
    _wbi["at"] = time.time()


_WBI_STRIP = re.compile(r"[!'()*]")


def wbi_sign(params):
    p = {k: str(v) for k, v in params.items()}
    p["wts"] = str(int(time.time()))
    query = "&".join(
        f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(_WBI_STRIP.sub('', v), safe='')}"
        for k, v in sorted(p.items())
    )
    p["w_rid"] = hashlib.md5((query + _wbi["mixin"]).encode()).hexdigest()
    return urllib.parse.urlencode(p)


# ---------------- Session bootstrap (guest cookies + bili_ticket) ----------------
def init_session():
    try:
        with http_req("https://www.bilibili.com/") as res:
            absorb(res)
    except Exception:
        pass
    try:
        spi = api_json("https://api.bilibili.com/x/frontend/finger/spi")
        if spi and spi.get("data", {}).get("b_3"):
            COOKIES["buvid3"] = spi["data"]["b_3"]
            COOKIES["buvid4"] = spi["data"].get("b_4", "")
            COOKIES["b_nut"] = str(int(time.time()))
    except Exception:
        pass
    try:
        ensure_wbi(force=True)
    except Exception as e:
        print("[warn]", e)
    try:
        ts = int(time.time())
        hexsign = hmac.new(b"XgwSnGZ1p", f"ts{ts}".encode(), hashlib.sha256).hexdigest()
        t = api_json(
            "https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket"
            f"?key_id=2&hexsign={hexsign}&context%5Btitle%5D=&content%5Bmessage%5D=&ts={ts}&csrf=",
            method="POST",
        )
        if t and t.get("data", {}).get("ticket"):
            COOKIES["bili_ticket"] = t["data"]["ticket"]
    except Exception:
        pass


def call_api(build_url, referer=None):
    """Call a Bilibili JSON API; on risk control (-412/-352/-799) refresh the session once and retry."""
    j = api_json(build_url(), referer)
    if j and j.get("code") in (-412, -352, -799):
        init_session()
        ensure_wbi(force=True)
        j = api_json(build_url(), referer)
    if not j:
        raise RuntimeError("Bilibili API gave no response (possibly rate limited, try again later)")
    if j.get("code") != 0:
        raise RuntimeError(f"Bilibili API error {j.get('code')}: {j.get('message') or 'unknown error'}")
    return j


# ---------------- CDN allowlist ----------------
MEDIA_HOST_SUFFIXES = ("bilibili.com", "bilivideo.com", "bilivideo.cn", "akamaized.net")
IMG_HOST_SUFFIXES = ("hdslb.com",)


def host_allowed(host, suffixes):
    host = (host or "").lower()
    return any(host == s or host.endswith("." + s) for s in suffixes)


# ---------------- Business: search / audio resolution ----------------
_cid_cache = {}


def search_videos(kw, page=1):
    """Search Bilibili; returns metadata items only (no stream URLs of any kind)."""
    ensure_wbi()
    j = None
    for attempt in range(3):
        j = call_api(
            lambda: "https://api.bilibili.com/x/web-interface/wbi/search/type?"
            + wbi_sign({"keyword": kw, "search_type": "video", "page": page}),
            referer="https://search.bilibili.com/",
        )
        arr = (j.get("data") or {}).get("result") or []
        if arr:
            break
        # Bilibili silently returns empty results for the first searches made
        # with a fresh buvid3: visit the main site to activate the cookie, retry.
        try:
            with http_req("https://www.bilibili.com/") as res:
                absorb(res)
        except Exception:
            pass
        time.sleep(0.8)
    arr = (j.get("data") or {}).get("result") or []
    items = []
    for r in arr:
        if not r.get("bvid"):
            continue
        cover = r.get("pic") or r.get("cover") or ""
        if cover.startswith("//"):
            cover = "https:" + cover
        items.append(
            {
                "bvid": r["bvid"],
                "title": re.sub(r"<[^>]+>", "", str(r.get("title") or "")),
                "author": r.get("author") or "",
                "cover": cover,
                "duration": r.get("duration") or "",
                "play": r.get("play") if isinstance(r.get("play"), int) else None,
                "description": str(r.get("description") or "")[:100],
            }
        )
    return items


def _video_pages(bvid):
    j = call_api(lambda: f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}")
    data = j.get("data") or {}
    cid = str(data.get("cid"))
    pages = [
        {
            "cid": str(p.get("cid")),
            "page": p.get("page"),
            "part": p.get("part") or f"P{p.get('page')}",
            "duration": p.get("duration") or 0,
        }
        for p in (data.get("pages") or [])
    ]
    _cid_cache[bvid] = cid
    return cid, pages


def resolve_audio(bvid, cid=None):
    """Resolve the audio stream URL. Only `dash.audio` is read; `dash.video` is never touched."""
    if not re.fullmatch(r"BV[0-9A-Za-z]{8,12}", bvid or ""):
        raise RuntimeError("invalid bvid")
    pages = None
    if not cid:
        cid = _cid_cache.get(bvid)
        if not cid:
            cid, pages = _video_pages(bvid)
    ensure_wbi()
    j = call_api(
        lambda: "https://api.bilibili.com/x/player/wbi/playurl?"
        + wbi_sign(
            {
                "bvid": bvid,
                "cid": str(cid),
                "qn": 64,
                "fnval": 16,  # DASH
                "fnver": 0,
                "fourk": 1,
            }
        )
    )
    dash = (j.get("data") or {}).get("dash") or {}
    audios = dash.get("audio") or []
    if not audios:
        raise RuntimeError("no audio stream available (this content may not support audio-only playback)")
    best = max(audios, key=lambda a: a.get("bandwidth") or 0)
    url = best.get("base_url") or ((best.get("backup_url") or [None])[0])
    return {
        "bvid": bvid,
        "cid": str(cid),
        "pages": pages,
        "audio": {
            "url": url,
            "id": best.get("id"),
            "codecs": best.get("codecs") or "",
            "bandwidth": best.get("bandwidth") or 0,
        },
    }


def open_media_stream(url, extra_headers=None, timeout=30, suffixes=MEDIA_HOST_SUFFIXES):
    """Open a Bilibili CDN stream (with UA/Referer); returns a file-like response."""
    if not host_allowed(urllib.parse.urlparse(url).hostname, suffixes):
        raise RuntimeError("only Bilibili CDN hosts are allowed")
    return http_req(url, timeout=timeout, extra_headers=extra_headers or {})


# ---------------- Account / login ----------------
def nav_info():
    j = api_json("https://api.bilibili.com/x/web-interface/nav")
    d = (j or {}).get("data") or {}
    return {
        "logged_in": bool(d.get("isLogin")),
        "uname": d.get("uname") or "",
        "face": d.get("face") or "",
        "level": (d.get("level_info") or {}).get("current_level") or 0,
        "vip": d.get("vipStatus") == 1,
    }


def qr_generate():
    """Request a login QR code; returns {key, url}. Rendering is up to the caller."""
    j = api_json(
        "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
        referer="https://passport.bilibili.com/",
    )
    if not j or j.get("code") != 0:
        raise RuntimeError("failed to get QR code")
    key = (j.get("data") or {}).get("qrcode_key") or ""
    url = (j.get("data") or {}).get("url") or ""
    if not key or not url:
        raise RuntimeError("malformed QR code data")
    return {"key": key, "url": url}


def qr_poll(key):
    """Poll QR login status: waiting / scanned / expired / confirmed.

    On success the login cookies are absorbed and persisted, and account info
    (nav fields) is returned alongside state='confirmed'.
    """
    if not re.fullmatch(r"[A-Za-z0-9]{20,64}", key or ""):
        raise RuntimeError("invalid key")
    url = (
        "https://passport.bilibili.com/x/passport-login/web/qrcode/poll"
        f"?qrcode_key={urllib.parse.quote(key)}"
    )
    try:
        with http_req(url, referer="https://passport.bilibili.com/") as res:
            j = json.loads(res.read().decode("utf-8", "replace"))
            absorb(res)  # on success SESSDATA etc. arrive via Set-Cookie here
    except Exception:
        raise RuntimeError("polling failed")
    d = (j or {}).get("data") or {}
    code = d.get("code")
    state = {86101: "waiting", 86090: "scanned", 86038: "expired"}.get(code, "waiting")
    if code == 0:
        # Belt and braces: merge credentials from the redirect URL too
        try:
            qs = urllib.parse.parse_qs(urllib.parse.urlsplit(d.get("url") or "").query)
            for k in LOGIN_COOKIE_KEYS:
                if qs.get(k):
                    COOKIES[k] = qs[k][0]
        except Exception:
            pass
        save_cookies()
        info = nav_info()
        info["state"] = "confirmed"
        return info
    return {"state": state}


def manual_login(raw):
    """Login by pasting a cookie string; returns account info or raises on failure."""
    found = dict(re.findall(r"(SESSDATA|bili_jct|DedeUserID)\s*=\s*([^;,\s]+)", raw or ""))
    if not found.get("SESSDATA"):
        raise RuntimeError("no SESSDATA found in input")
    COOKIES.update(found)
    save_cookies()
    info = nav_info()
    if not info["logged_in"]:
        for k in found:  # invalid credentials, roll back
            COOKIES.pop(k, None)
        save_cookies()
        raise RuntimeError("SESSDATA invalid or expired")
    return info


def logout():
    if COOKIES.get("bili_jct"):
        api_json(
            "https://passport.bilibili.com/x/passport-login/web/cookie/revoke?csrf="
            + urllib.parse.quote(COOKIES["bili_jct"]),
            referer="https://passport.bilibili.com/",
            method="POST",
        )
    for k in LOGIN_COOKIE_KEYS:
        COOKIES.pop(k, None)
    save_cookies()
