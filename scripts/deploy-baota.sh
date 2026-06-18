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
MUSIC_API_PORT="${MUSIC_API_PORT:-5000}"
MUSIC_API_COOKIE_FILE="${MUSIC_API_COOKIE_FILE:-${MUSIC_API_PATH}/cookie.txt}"
SSH_OPTS="${SSH_OPTS:-}"

NODE_BIN="/www/server/nodejs/${DEPLOY_NODE_VERSION}/bin"
PANEL_PY="/www/server/panel/pyenv/bin/python"

echo "部署到宝塔项目：${DEPLOY_PROJECT}"
echo "目标目录：${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
echo "音乐 API：${DEPLOY_USER}@${DEPLOY_HOST}:${MUSIC_API_PATH}"

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
  'mkdir -p "${MUSIC_API_PATH}"'

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
  --exclude "public/images/users/" \
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
  MUSIC_API_PORT="${MUSIC_API_PORT}" \
  MUSIC_API_COOKIE_FILE="${MUSIC_API_COOKIE_FILE}" \
  NODE_BIN="${NODE_BIN}" \
  PANEL_PY="${PANEL_PY}" \
  'bash -s' <<'REMOTE'
set -euo pipefail

cd "${MUSIC_API_PATH}"

touch "${MUSIC_API_COOKIE_FILE}"
chmod 600 "${MUSIC_API_COOKIE_FILE}"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

"${MUSIC_API_PATH}/.venv/bin/python" -m pip install --upgrade pip
"${MUSIC_API_PATH}/.venv/bin/pip" install -r requirements.txt

cat > /etc/systemd/system/bbzg-netease-api.service <<SERVICE
[Unit]
Description=BBZG Netease Music API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${MUSIC_API_PATH}
Environment=NETEASE_API_HOST=127.0.0.1
Environment=NETEASE_API_PORT=${MUSIC_API_PORT}
Environment=NETEASE_COOKIE_FILE=${MUSIC_API_COOKIE_FILE}
ExecStart=${MUSIC_API_PATH}/.venv/bin/python ${MUSIC_API_PATH}/main.py
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable --now bbzg-netease-api.service
systemctl restart bbzg-netease-api.service

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

systemctl --no-pager --full status bbzg-netease-api.service | sed -n '1,20p'
echo "健康检查通过：音乐 API、本机端口与公网域名均可访问。"
REMOTE

echo "部署完成。"
