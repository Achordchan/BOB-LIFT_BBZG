#!/bin/bash

set -euo pipefail

script_path="${BASH_SOURCE[0]}"
case "$script_path" in
  */*) script_dir="${script_path%/*}" ;;
  *) script_dir="." ;;
esac
PROJECT_ROOT="$(cd "$script_dir" && pwd)"
cd "$PROJECT_ROOT"

usage() {
  echo "用法: ./start.sh [端口号]" >&2
}

if [ "$#" -gt 1 ]; then
  usage
  exit 2
fi

if [ "$#" -eq 1 ]; then
  port="$1"
else
  port="${PORT:-3000}"
fi
case "$port" in
  ''|*[!0-9]*)
    echo "错误: 端口必须是 1 到 65535 之间的数字，当前值: ${port:-<空>}" >&2
    exit 2
    ;;
esac

if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
  echo "错误: 端口必须在 1 到 65535 之间，当前值: $port" >&2
  exit 2
fi

select_compatible_node() {
  local requested="${NODE_BIN:-}"
  local candidate
  local version
  local major
  local dir
  local seen=":"

  if [ -n "$requested" ]; then
    candidate="$(command -v "$requested" 2>/dev/null || true)"
    if [ -z "$candidate" ] || [ ! -x "$candidate" ]; then
      echo "错误: NODE_BIN 指定的 Node.js 不存在或不可执行: $requested" >&2
      return 1
    fi
    version="$("$candidate" --version 2>/dev/null || true)"
    major="${version#v}"
    major="${major%%.*}"
    case "$major" in
      20|22)
        NODE_BIN="$candidate"
        NODE_VERSION="$version"
        return 0
        ;;
      *)
        echo "错误: NODE_BIN 指向 ${version}，本项目需要 Node.js 20 或 22。" >&2
        return 1
        ;;
    esac
  fi

  local old_ifs="$IFS"
  IFS=:
  for dir in $PATH; do
    [ -n "$dir" ] || dir="."
    candidate="$dir/node"
    case "$seen" in
      *:"$candidate":*) continue ;;
    esac
    seen="${seen}${candidate}:"
    [ -x "$candidate" ] || continue
    version="$("$candidate" --version 2>/dev/null || true)"
    major="${version#v}"
    major="${major%%.*}"
    case "$major" in
      20|22)
        IFS="$old_ifs"
        NODE_BIN="$candidate"
        NODE_VERSION="$version"
        return 0
        ;;
    esac
  done
  IFS="$old_ifs"

  echo "错误: PATH 中未找到兼容的 Node.js 20 或 22。" >&2
  echo "当前默认版本: $(node --version 2>/dev/null || echo 未安装)" >&2
  return 1
}

select_compatible_node

default_node="$(command -v node 2>/dev/null || true)"
if [ "$NODE_BIN" != "$default_node" ]; then
  echo "已自动选择兼容运行时: $NODE_BIN ($NODE_VERSION)"
fi

if [ ! -d node_modules ]; then
  echo "错误: 项目依赖尚未安装，请先在项目目录执行: npm install" >&2
  exit 1
fi

PORT_TO_CHECK="$port" "$NODE_BIN" <<'NODE'
const net = require('net');
const port = Number(process.env.PORT_TO_CHECK);
const server = net.createServer();

server.unref();
server.once('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`错误: 端口 ${port} 已被占用，请更换端口或先停止占用该端口的程序。`);
  } else {
    console.error(`错误: 无法使用端口 ${port}: ${error.message}`);
  }
  process.exit(1);
});
server.listen({ port, exclusive: true }, () => {
  server.close(() => process.exit(0));
});
NODE

echo "启动地址: http://localhost:$port"
echo "停止方式: 按 Ctrl+C"

export PORT="$port"
exec "$NODE_BIN" server.js
