#!/bin/bash
# TapNow Clone - 一键启动脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo "🚀 启动 TapNow Clone..."

# 安装后端依赖
echo "📦 安装后端依赖..."
pip install -q -r "$BACKEND_DIR/requirements.txt" 2>/dev/null || pip install -q --break-system-packages -r "$BACKEND_DIR/requirements.txt"

# 构建前端
echo "🎨 构建前端..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    npm install
fi
if [ ! -d "dist" ]; then
    npm run build
fi

# 启动后端（同时托管前端）
echo "🔧 启动后端 (port 8000)..."
cd "$BACKEND_DIR"
python3 main.py
