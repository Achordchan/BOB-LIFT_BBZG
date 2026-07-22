#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-111.228.1.199}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/www/wwwroot/bbzg.baymaxgroup.com}"
DEPLOY_PROJECT="${DEPLOY_PROJECT:-bbzg_app}"
DEPLOY_NODE_VERSION="${DEPLOY_NODE_VERSION:-node20}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-bbzg.baymaxgroup.com}"
DEPLOY_PORT="${DEPLOY_PORT:-3000}"
DEPLOY_HEALTH_PATH="${DEPLOY_HEALTH_PATH:-/api/health}"
MUSIC_API_PATH="${MUSIC_API_PATH:-/www/wwwroot/netease_music_api}"
MUSIC_API_PROJECT="${MUSIC_API_PROJECT:-bbzg_netease_api}"
MUSIC_API_PORT="${MUSIC_API_PORT:-5000}"
MUSIC_API_COOKIE_FILE="${MUSIC_API_COOKIE_FILE:-${MUSIC_API_PATH}/cookie.txt}"
SSH_OPTS="${SSH_OPTS:-}"

NODE_BIN="/www/server/nodejs/${DEPLOY_NODE_VERSION}/bin"
PANEL_PY="/www/server/panel/pyenv/bin/python"

echo "部署到宝塔项目：${DEPLOY_PROJECT}"
echo "目标目录：${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
echo "音乐 API：${DEPLOY_USER}@${DEPLOY_HOST}:${MUSIC_API_PATH}"

echo "本地构建新版后台..."
npm run build:admin

# 环境预检必须在备份/rsync 之前：只认宝塔 Node 项目实际注入的环境变量
# 项目 .env 不会被 Node 自动加载，不能当作有效来源
echo "远端生产环境变量预检（rsync 前）..."
ssh ${SSH_OPTS} "${DEPLOY_USER}@${DEPLOY_HOST}" \
  DEPLOY_PATH="${DEPLOY_PATH}" \
  DEPLOY_PROJECT="${DEPLOY_PROJECT}" \
  PANEL_PY="${PANEL_PY}" \
  'bash -s' <<'REMOTE_ENV_PRECHECK'
set -euo pipefail
PANEL_PY="${PANEL_PY:-/www/server/panel/pyenv/bin/python}"
if [ ! -x "${PANEL_PY}" ]; then
  echo "宝塔 Python 不存在：${PANEL_PY}"
  exit 1
fi
"${PANEL_PY}" - <<'PYENV'
import json
import os
import sys

project_name = os.environ["DEPLOY_PROJECT"]
required_any = ["BBZG_SESSION_SECRET", "SESSION_SECRET"]
required_proxy = ["BBZG_TRUST_PROXY"]
found = {}
found_sources = {}

candidates = [
    f"/www/server/panel/vhost/nodejs/{project_name}.json",
    f"/www/server/nodejs/vhost/configs/{project_name}.json",
    f"/www/server/nodejs/vhost/env/{project_name}.env",
    f"/www/server/panel/vhost/nodejs/env/{project_name}",
]

def load_env_file(path):
    vals = {}
    if not os.path.isfile(path):
        return vals
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and v:
                vals[k] = v
    return vals

def absorb(source, mapping):
    for k, v in (mapping or {}).items():
        if k in set(required_any + required_proxy) and str(v).strip() and k not in found:
            # 存实际值；来源单独记，避免把路径当配置值校验
            found[k] = str(v).strip()
            found_sources[k] = source

# 仅读取宝塔面板/Node 项目管理注入路径，不读取项目 .env
for path in candidates:
    if not os.path.exists(path):
        continue
    if path.endswith(".json"):
        try:
            data = json.load(open(path, "r", encoding="utf-8", errors="ignore"))
        except Exception as e:
            print(f"解析 {path} 失败: {e}")
            continue
        env_map = {}
        if isinstance(data, dict):
            for key in ("env", "project_env", "environment", "run_env", "env_list"):
                val = data.get(key)
                if isinstance(val, dict):
                    env_map.update({str(k): str(v) for k, v in val.items() if v is not None})
                elif isinstance(val, list):
                    for item in val:
                        if not isinstance(item, dict):
                            continue
                        n = item.get("name") or item.get("key") or item.get("k")
                        v = item.get("value") if "value" in item else item.get("val", item.get("v"))
                        if n is not None and v is not None and str(v).strip():
                            env_map[str(n)] = str(v)
            # 部分版本把 env 写成字符串 "A=1\nB=2"
            for key in ("env", "project_env", "run_env"):
                val = data.get(key)
                if isinstance(val, str) and "=" in val:
                    for line in val.splitlines():
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        if k.strip() and v.strip():
                            env_map[k.strip()] = v.strip().strip('"').strip("'")
            for k in set(required_any + required_proxy):
                if data.get(k) is not None and str(data.get(k)).strip():
                    env_map[k] = str(data.get(k))
            # 宝塔 nodejsModel 常见字段 project_config / config
            for nest_key in ("project_config", "config", "project"):
                nest = data.get(nest_key)
                if isinstance(nest, dict):
                    for key in ("env", "project_env", "environment"):
                        val = nest.get(key)
                        if isinstance(val, dict):
                            env_map.update({str(k): str(v) for k, v in val.items() if v is not None})
                        elif isinstance(val, list):
                            for item in val:
                                if isinstance(item, dict):
                                    n = item.get("name") or item.get("key")
                                    v = item.get("value") or item.get("val")
                                    if n and v is not None:
                                        env_map[str(n)] = str(v)
        absorb(path, env_map)
    else:
        absorb(path, load_env_file(path))

# 尝试通过宝塔 API 读项目对象
try:
    sys.path.insert(0, "/www/server/panel/class")
    import public
    from projectModel.nodejsModel import main
    model = main()
    # get_project_find / get_project_info 在不同版本存在
    info = None
    for meth in ("get_project_find", "get_project_info", "get_project_list"):
        if not hasattr(model, meth):
            continue
        try:
            if meth == "get_project_list":
                lst = model.get_project_list(public.dict_obj())
                if isinstance(lst, dict) and isinstance(lst.get("data"), list):
                    for item in lst["data"]:
                        if str(item.get("name") or item.get("project_name") or "") == project_name:
                            info = item
                            break
            else:
                arg = public.dict_obj()
                arg.project_name = project_name
                info = model.__getattribute__(meth)(arg)
            if info:
                break
        except Exception:
            continue
    if isinstance(info, dict):
        env_map = {}
        for key in ("env", "project_env", "environment", "run_env"):
            val = info.get(key)
            if isinstance(val, dict):
                env_map.update({str(k): str(v) for k, v in val.items() if v is not None})
            elif isinstance(val, list):
                for item in val:
                    if isinstance(item, dict):
                        n = item.get("name") or item.get("key")
                        v = item.get("value") or item.get("val")
                        if n and v is not None:
                            env_map[str(n)] = str(v)
        # nested
        for nest_key in ("project_config", "config", "project"):
            nest = info.get(nest_key)
            if isinstance(nest, dict):
                for key in ("env", "project_env", "environment"):
                    val = nest.get(key)
                    if isinstance(val, dict):
                        env_map.update({str(k): str(v) for k, v in val.items() if v is not None})
        absorb("baota-nodejsModel", env_map)
except Exception as e:
    print(f"读取宝塔项目对象失败（继续文件探测）: {e}")

has_secret = bool(found.get("BBZG_SESSION_SECRET") or found.get("SESSION_SECRET"))
has_trust_proxy = bool(str(found.get("BBZG_TRUST_PROXY") or "").strip())
print("宝塔注入环境变量来源（不含项目 .env）:")
if found:
    for k in sorted(found.keys()):
        src = found_sources.get(k, "?")
        # 值只显示是否已配置，避免密钥进日志
        shown = "已配置" if k in ("BBZG_SESSION_SECRET", "SESSION_SECRET") else found[k]
        print(f"  - {k}: {shown} (from {src})")
else:
    print("  （未发现）")

if not has_secret:
    print("错误: 宝塔 Node 项目未配置 BBZG_SESSION_SECRET 或 SESSION_SECRET。")
    print("请在宝塔面板 -> Node 项目 -> 环境变量 中配置后再部署。")
    print("注意: 项目目录 .env 不会被自动加载，不能替代面板环境变量。")
    print("示例: BBZG_SESSION_SECRET=$(openssl rand -hex 32)")
    sys.exit(1)

if not has_trust_proxy:
    print("错误: 生产反代下必须配置 BBZG_TRUST_PROXY=1。")
    print("未配置时 Secure Cookie 无法经 Nginx 正确下发/识别，登录后会立刻 401。")
    print("请在宝塔面板 -> Node 项目 -> 环境变量 中增加 BBZG_TRUST_PROXY=1 后再部署。")
    sys.exit(1)

proxy_val = str(found.get("BBZG_TRUST_PROXY") or "").strip().lower()
# 宝塔单层 Nginx 反代：仅接受 1/true，或 hop 数 >= 1 的正整数；0/false 会导致 Secure Cookie 不生效
proxy_ok = proxy_val in ("1", "true") or (proxy_val.isdigit() and int(proxy_val) >= 1)
if not proxy_ok:
    print(f"错误: BBZG_TRUST_PROXY 当前值无效: {found.get('BBZG_TRUST_PROXY')!r}")
    print("宝塔 Nginx 反代请设为 1（不要设 0/false）。")
    sys.exit(1)

print("rsync 前生产环境变量预检通过。")
PYENV
REMOTE_ENV_PRECHECK

ssh ${SSH_OPTS} "${DEPLOY_USER}@${DEPLOY_HOST}" \
  DEPLOY_PATH="${DEPLOY_PATH}" \
  DEPLOY_PROJECT="${DEPLOY_PROJECT}" \
  MUSIC_API_PATH="${MUSIC_API_PATH}" \
  'bash -s' <<'REMOTE_BACKUP'
set -euo pipefail

if [ ! -d "${DEPLOY_PATH}" ]; then
  echo "目标目录不存在：${DEPLOY_PATH}"
  exit 1
fi

backup_root="/root/${DEPLOY_PROJECT}.github-backups"
backup_file="${backup_root}/${DEPLOY_PROJECT}.before-github-$(date +%Y%m%d%H%M%S).tar.gz"
mkdir -p "${backup_root}"
tar \
  --exclude="node_modules" \
  --exclude=".well-known" \
  --exclude="bbzg_*.tar.gz" \
  --exclude="public/music" \
  --exclude="public/images/users" \
  --exclude="*.bak-*" \
  --exclude=".bbzg-cache" \
  --exclude="music-api" \
  -czf "${backup_file}" \
  -C "$(dirname "${DEPLOY_PATH}")" \
  "$(basename "${DEPLOY_PATH}")"
echo "已创建远端备份：${backup_file}"

if [ -d "${MUSIC_API_PATH}" ]; then
  music_backup_root="/root/bbzg-netease-api.github-backups"
  music_backup_file="${music_backup_root}/netease_music_api.before-github-$(date +%Y%m%d%H%M%S).tar.gz"
  mkdir -p "${music_backup_root}"
  tar \
    --exclude=".venv" \
    --exclude="downloads" \
    --exclude="music_api.log" \
    -czf "${music_backup_file}" \
    -C "$(dirname "${MUSIC_API_PATH}")" \
    "$(basename "${MUSIC_API_PATH}")"
  echo "已创建音乐 API 备份：${music_backup_file}"
fi
REMOTE_BACKUP

ssh ${SSH_OPTS} "${DEPLOY_USER}@${DEPLOY_HOST}" \
  MUSIC_API_PATH="${MUSIC_API_PATH}" \
  'bash -s' <<'REMOTE_MKDIR'
set -euo pipefail
mkdir -p "${MUSIC_API_PATH}"
REMOTE_MKDIR

rsync -az --delete \
  --omit-dir-times \
  --no-perms \
  --no-owner \
  --no-group \
  -e "ssh ${SSH_OPTS}" \
  --exclude ".git/" \
  --exclude ".github/" \
  --exclude ".env" \
  --exclude ".env.*" \
  --exclude ".ssh/" \
  --exclude ".well-known/" \
  --exclude "node_modules/" \
  --exclude "music-api/" \
  --exclude "data.json" \
  --exclude "data.json.bak.*" \
  --exclude "public/music/" \
  --exclude "public/images/" \
  --exclude "public/uploads/" \
  --exclude "uploads/" \
  --exclude "storage/" \
  --exclude "logs/" \
  --exclude "*.log" \
  --exclude "*.bak-*" \
  --exclude "*.tar.gz" \
  --exclude "_deploy/" \
  --exclude ".tmp/" \
  --exclude ".bbzg-cache/" \
  --exclude "bbzg_ikPyS/" \
  --exclude "bbzg_ikPyS.tar.gz" \
  --exclude "bbzg_production_snapshot_*/" \
  --exclude "bbzg_*.tar.gz" \
  ./ "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"

rsync -az --delete \
  --omit-dir-times \
  --no-perms \
  --no-owner \
  --no-group \
  -e "ssh ${SSH_OPTS}" \
  --exclude "cookie.txt" \
  --exclude ".venv/" \
  --exclude "downloads/" \
  --exclude "music_api.log" \
  --exclude "__pycache__/" \
  --exclude "*.pyc" \
  music-api/ "${DEPLOY_USER}@${DEPLOY_HOST}:${MUSIC_API_PATH}/"

ssh ${SSH_OPTS} "${DEPLOY_USER}@${DEPLOY_HOST}" \
  DEPLOY_PATH="${DEPLOY_PATH}" \
  DEPLOY_PROJECT="${DEPLOY_PROJECT}" \
  DEPLOY_NODE_VERSION="${DEPLOY_NODE_VERSION}" \
  DEPLOY_DOMAIN="${DEPLOY_DOMAIN}" \
  DEPLOY_HOST="${DEPLOY_HOST}" \
  DEPLOY_PORT="${DEPLOY_PORT}" \
  DEPLOY_HEALTH_PATH="${DEPLOY_HEALTH_PATH}" \
  MUSIC_API_PATH="${MUSIC_API_PATH}" \
  MUSIC_API_PROJECT="${MUSIC_API_PROJECT}" \
  MUSIC_API_PORT="${MUSIC_API_PORT}" \
  MUSIC_API_COOKIE_FILE="${MUSIC_API_COOKIE_FILE}" \
  NODE_BIN="${NODE_BIN}" \
  PANEL_PY="${PANEL_PY}" \
  'bash -s' <<'REMOTE'
set -euo pipefail

cd "${MUSIC_API_PATH}"

touch "${MUSIC_API_COOKIE_FILE}"
chmod 600 "${MUSIC_API_COOKIE_FILE}"

systemctl disable --now bbzg-netease-api.service >/dev/null 2>&1 || true
systemctl daemon-reload || true

MUSIC_API_PYENV="/www/server/pyporject_evn/${MUSIC_API_PROJECT}"
MUSIC_API_PYTHON="${MUSIC_API_PYENV}/bin/python"
MUSIC_API_PIP="${MUSIC_API_PYENV}/bin/pip"

if [ ! -x "${MUSIC_API_PYTHON}" ] || [ ! -x "${MUSIC_API_PIP}" ]; then
  rm -rf "${MUSIC_API_PYENV}"
  if ! python3.10 -m venv "${MUSIC_API_PYENV}"; then
    echo "python3.10 venv 不可用，安装 python3.10-venv 后重试。"
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y python3.10-venv python3-venv
    rm -rf "${MUSIC_API_PYENV}"
    python3.10 -m venv "${MUSIC_API_PYENV}"
  fi
fi

"${MUSIC_API_PYTHON}" -m pip install --upgrade pip
"${MUSIC_API_PIP}" install -r requirements.txt

"${PANEL_PY}" - <<'PY'
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, "/www/server/panel/class")
sys.path.insert(0, "/www/server/panel")

import public
from mod.project.python.pyenv_tool import EnvironmentManager
from projectModel.pythonModel import main

project_name = os.environ["MUSIC_API_PROJECT"]
project_path = os.environ["MUSIC_API_PATH"]
project_port = os.environ["MUSIC_API_PORT"]
cookie_file = os.environ["MUSIC_API_COOKIE_FILE"]
python_bin = f"/www/server/pyporject_evn/{project_name}/bin/python"

em = EnvironmentManager()
if not any(env.bin_path == "/usr/bin/python3.10" for env in em.all_env):
    em.add_python_env("system", "/usr/bin/python3")
em = EnvironmentManager()
if not any(env.bin_path == python_bin for env in em.all_env):
    em.add_python_env("venv", python_bin)

model = main()
exists = public.M("sites").where(
    "project_type=? AND name=?",
    ("Python", project_name),
).find()

if not exists:
    create_args = public.to_dict_obj({
        "pjname": project_name,
        "port": project_port,
        "stype": "command",
        "path": project_path,
        "user": "root",
        "python_bin": python_bin,
        "requirement_path": f"{project_path}/requirements.txt",
        "project_cmd": "python main.py",
        "framework": "python",
        "auto_run": "true",
        "env_list": [
            {"k": "NETEASE_API_HOST", "v": "127.0.0.1"},
            {"k": "NETEASE_API_PORT", "v": project_port},
            {"k": "NETEASE_COOKIE_FILE", "v": cookie_file},
        ],
    })
    result = model.CreateProject(create_args)
else:
    result = model.RestartProject(public.to_dict_obj({"name": project_name}))

print(json.dumps(result, ensure_ascii=False, default=str))

if not isinstance(result, dict) or not result.get("status"):
    raise SystemExit(1)

for _ in range(30):
    check = subprocess.run(
        ["curl", "-fsS", f"http://127.0.0.1:{project_port}/health"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if check.returncode == 0:
        break
    time.sleep(1)
else:
    raise SystemExit("音乐 API 健康检查失败")
PY

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${MUSIC_API_PORT}/health" >/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:${MUSIC_API_PORT}/health" >/dev/null

echo "音乐 API 已启动：http://127.0.0.1:${MUSIC_API_PORT}"
echo "Cookie 文件：${MUSIC_API_COOKIE_FILE}"

cd "${DEPLOY_PATH}"

if [ ! -f "data.json" ]; then
  echo "缺少服务器运行数据 data.json，停止部署，避免启动后丢数据。"
  exit 1
fi

if [ ! -x "${NODE_BIN}/node" ]; then
  echo "宝塔 Node 不存在：${NODE_BIN}/node"
  exit 1
fi

NPM_CLI="${NODE_BIN}/../lib/node_modules/npm/bin/npm-cli.js"
if [ ! -f "${NPM_CLI}" ]; then
  echo "宝塔 npm CLI 不存在：${NPM_CLI}"
  exit 1
fi

if [ -f "package-lock.json" ]; then
  "${NODE_BIN}/node" "${NPM_CLI}" ci --omit=dev --ignore-scripts --no-audit --no-fund
else
  "${NODE_BIN}/node" "${NPM_CLI}" install --omit=dev --ignore-scripts --no-audit --no-fund
fi

find "${DEPLOY_PATH}" "${MUSIC_API_PATH}" \( -name ".DS_Store" -o -name "._*" \) -type f -print0 | xargs -0 -r rm -f
chown -R www:www "${DEPLOY_PATH}"

"${PANEL_PY}" - <<'PY'
import json
import os
import sys
sys.path.insert(0, "/www/server/panel/class")
import public
from projectModel.nodejsModel import main

project = public.dict_obj()
project.project_name = os.environ["DEPLOY_PROJECT"]
model = main()
print(json.dumps(model.stop_project(project), ensure_ascii=False))
print(json.dumps(model.start_project(project), ensure_ascii=False))
PY

backup_file="$(ls -1t /root/${DEPLOY_PROJECT}.github-backups/${DEPLOY_PROJECT}.before-github-*.tar.gz 2>/dev/null | head -n 1 || true)"
health_ok=0
for _ in $(seq 1 30); do
  body="$(curl -fsS "http://127.0.0.1:${DEPLOY_PORT}${DEPLOY_HEALTH_PATH}" || true)"
  if printf '%s' "${body}" | grep -Eq '"success"[[:space:]]*:[[:space:]]*true|"status"[[:space:]]*:[[:space:]]*"ok"'; then
    health_ok=1
    break
  fi
  sleep 1
done

if [ "${health_ok}" != "1" ]; then
  echo "本机业务健康检查失败：${DEPLOY_PORT}${DEPLOY_HEALTH_PATH}"
  if [ -n "${backup_file}" ] && [ -f "${backup_file}" ]; then
    echo "尝试从备份恢复上一版：${backup_file}"
    tar -xzf "${backup_file}" -C "$(dirname "${DEPLOY_PATH}")"
    "${PANEL_PY}" - <<'PYR'
import json, os, sys
sys.path.insert(0, "/www/server/panel/class")
import public
from projectModel.nodejsModel import main
project = public.dict_obj()
project.project_name = os.environ["DEPLOY_PROJECT"]
model = main()
print(json.dumps(model.stop_project(project), ensure_ascii=False))
print(json.dumps(model.start_project(project), ensure_ascii=False))
PYR
  fi
  exit 1
fi

curl -fsS "http://127.0.0.1:${DEPLOY_PORT}${DEPLOY_HEALTH_PATH}"
if ! curl -fsS -o /dev/null --resolve "${DEPLOY_DOMAIN}:443:${DEPLOY_HOST}" "https://${DEPLOY_DOMAIN}${DEPLOY_HEALTH_PATH}"; then
  echo "公网 HTTPS 健康检查失败（未使用 -k）。请检查证书与反代。"
  exit 1
fi

pid_file="/www/server/nodejs/vhost/pids/${DEPLOY_PROJECT}.pid"
if [ -f "${pid_file}" ]; then
  pid="$(cat "${pid_file}")"
  echo "当前 PID：${pid}"
  ps -fp "${pid}"
  echo "当前 cwd：$(readlink /proc/${pid}/cwd 2>/dev/null || true)"
fi

"${PANEL_PY}" - <<'PY'
import json
import os
import sys
sys.path.insert(0, "/www/server/panel/class")
import public
from projectModel.pythonModel import main

project = os.environ["MUSIC_API_PROJECT"]
data = main().GetProjectList(public.to_dict_obj({"p": 1, "limit": 5, "search": project}))
for row in data.get("data", []):
    if row.get("name") == project:
        print(json.dumps({
            "name": row.get("name"),
            "run": row.get("run"),
            "listen": row.get("listen"),
            "pids": row.get("pids"),
        }, ensure_ascii=False))
PY
echo "健康检查通过：音乐 API、本机端口与公网域名均可访问。"
REMOTE

echo "部署完成。"
