#!/bin/bash
# TapNow Clone - macOS / Linux 一键启动脚本

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_DIR="$SCRIPT_DIR/.venv"

echo "启动 TapNow Clone..."

if ! command -v python3 >/dev/null 2>&1; then
    echo "[ERROR] 未找到 python3，请先安装 Python 3.10+。"
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] 未找到 Node.js，请先安装 Node.js 18+。"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "[ERROR] 未找到 npm，请先安装 Node.js。"
    exit 1
fi

echo "准备 Python 虚拟环境..."
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

echo "安装后端依赖..."
python -m pip install --upgrade pip >/dev/null
python -m pip install -r "$BACKEND_DIR/requirements.txt"

echo "安装前端依赖..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    npm install
fi

echo "构建前端..."
npm run build

echo "启动后端 (http://localhost:8000)..."
cd "$BACKEND_DIR"
exec python main.py
