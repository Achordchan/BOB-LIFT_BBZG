#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-111.228.1.199}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/www/wwwroot/bbzg.baymaxgroup.com}"
DEPLOY_PROJECT="${DEPLOY_PROJECT:-bbzg_app}"
DEPLOY_NODE_VERSION="${DEPLOY_NODE_VERSION:-node20}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-bbzg.baymaxgroup.com}"
DEPLOY_PORT="${DEPLOY_PORT:-3000}"
DEPLOY_HEALTH_PATH="${DEPLOY_HEALTH_PATH:-/health-check}"
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

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${DEPLOY_PORT}${DEPLOY_HEALTH_PATH}" >/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS -o /dev/null "http://127.0.0.1:${DEPLOY_PORT}${DEPLOY_HEALTH_PATH}"
curl -k -fsS -o /dev/null --resolve "${DEPLOY_DOMAIN}:443:${DEPLOY_HOST}" "https://${DEPLOY_DOMAIN}${DEPLOY_HEALTH_PATH}"

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
