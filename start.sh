#!/usr/bin/env bash
# MiMo AI Radio - 一键启动脚本 (Git Bash / WSL / Linux / macOS)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════╗"
echo "║       🎧 MiMo AI Radio 启动器         ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# Check if we're in the right directory
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo -e "${RED}错误：请在 mimo-radio 项目根目录下运行此脚本${NC}"
    exit 1
fi

# Function to cleanup processes on exit
cleanup() {
    echo -e "\n${YELLOW}正在关闭 MiMo 服务...${NC}"
    if [ -n "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ 已退出${NC}"
    exit 0
}

trap cleanup INT TERM EXIT

# Check dependencies
echo -e "${BLUE}🔍 检查依赖...${NC}"

if [ ! -d "backend/node_modules" ]; then
    echo -e "${YELLOW}📦 后端依赖未安装，正在安装...${NC}"
    (cd backend && npm install)
fi

if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}📦 前端依赖未安装，正在安装...${NC}"
    (cd frontend && npm install)
fi

echo -e "${GREEN}✅ 依赖检查完成${NC}\n"

# Start backend
echo -e "${BLUE}🚀 启动后端服务 (localhost:8001)...${NC}"
(cd backend && npm run dev > /tmp/mimo-backend.log 2>&1) &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Check if backend started successfully
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}❌ 后端启动失败，请检查日志：${NC}"
    cat /tmp/mimo-backend.log 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}✅ 后端已启动 (PID: $BACKEND_PID)${NC}\n"

# Start frontend
echo -e "${BLUE}🚀 启动前端服务 (localhost:3001)...${NC}"
(cd frontend && npm run dev > /tmp/mimo-frontend.log 2>&1) &
FRONTEND_PID=$!

# Wait for frontend to start
sleep 5

# Check if frontend started successfully
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${RED}❌ 前端启动失败，请检查日志：${NC}"
    cat /tmp/mimo-frontend.log 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}✅ 前端已启动 (PID: $FRONTEND_PID)${NC}\n"

echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  🎧 MiMo AI Radio 已就绪！${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e ""
echo -e "  ${YELLOW}前端:${NC} ${GREEN}http://localhost:3001${NC}"
echo -e "  ${YELLOW}后端:${NC} ${GREEN}http://localhost:8001${NC}"
echo -e "  ${YELLOW}API :${NC} ${GREEN}http://localhost:8001/api${NC}"
echo -e ""
echo -e "  ${YELLOW}后端日志:${NC} tail -f /tmp/mimo-backend.log"
echo -e "  ${YELLOW}前端日志:${NC} tail -f /tmp/mimo-frontend.log"
echo -e ""
echo -e "  ${RED}按 Ctrl+C 停止所有服务${NC}"
echo -e ""

# Stream both logs with color coding
tail -f /tmp/mimo-backend.log /tmp/mimo-frontend.log 2>/dev/null | while read line; do
    if echo "$line" | grep -q "backend"; then
        echo -e "${BLUE}[后端]${NC} $line"
    elif echo "$line" | grep -q "frontend"; then
        echo -e "${CYAN}[前端]${NC} $line"
    else
        echo "$line"
    fi
done &

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
