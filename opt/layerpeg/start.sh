#!/usr/bin/env bash
set -euo pipefail

# start.sh - 单机/边缘节点离线启动脚本（依据文档部署流程）

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

PROJECT_ID="${1:-GXX_2024_XXX}"
export PROJECT_ID
export OFFLINE_MODE=true

echo "LayerPeg 启动中..."
echo "PROJECT_ID=${PROJECT_ID}"
echo "OFFLINE_MODE=${OFFLINE_MODE}"

mkdir -p "$ROOT_DIR/data/pgdata"
mkdir -p "$ROOT_DIR/nl2gate/logs"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "未找到 docker compose / docker-compose"
  exit 1
fi

# 1) 启动 PostgreSQL + gate-engine
$COMPOSE_CMD up -d postgres gate-engine

# 2) 启动 NL2Gate (8081) - 文档方案为本机 Python uvicorn
if [ ! -d "$ROOT_DIR/.venv-nl2gate" ]; then
  python3 -m venv "$ROOT_DIR/.venv-nl2gate"
fi

# shellcheck disable=SC1091
source "$ROOT_DIR/.venv-nl2gate/bin/activate"
python -m pip install --upgrade pip >/dev/null

if [ -s "$ROOT_DIR/nl2gate/requirements.txt" ]; then
  pip install -r "$ROOT_DIR/nl2gate/requirements.txt"
else
  # MINIMAL_COMPLETION: requirements.txt 当前为空，按现有代码安装最小依赖。
  pip install fastapi uvicorn requests pydantic
fi

if pgrep -f "uvicorn main:app --host 0.0.0.0 --port 8081" >/dev/null 2>&1; then
  echo "NL2Gate 已在 8081 运行"
else
  nohup bash -lc "cd '$ROOT_DIR/nl2gate' && uvicorn main:app --host 0.0.0.0 --port 8081" \
    >"$ROOT_DIR/nl2gate/logs/nl2gate.out.log" 2>"$ROOT_DIR/nl2gate/logs/nl2gate.err.log" &
  echo "NL2Gate 启动在 http://localhost:8081"
fi

echo "启动完成。"
echo "Gate API:    http://localhost:8080/v1/gate/validate"
echo "NL2Gate API: http://localhost:8081/chat"
