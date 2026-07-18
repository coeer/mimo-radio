@echo off
chcp 65001 >nul 2>&1
REM MiMo AI Radio - 一键启动脚本 (Windows CMD / PowerShell)

echo.
echo ╔══════════════════════════════════════════╗
echo ║       🎧 MiMo AI Radio 启动器         ║
echo ╚══════════════════════════════════════════╝
echo.

REM Check if we're in the right directory
if not exist "backend" (
    echo [错误] 请在 mimo-radio 项目根目录下运行此脚本
    exit /b 1
)
if not exist "frontend" (
    echo [错误] 请在 mimo-radio 项目根目录下运行此脚本
    exit /b 1
)

REM Check dependencies
echo [检查] 正在检查依赖...

if not exist "backend\node_modules" (
    echo [安装] 后端依赖未安装，正在安装...
    cd backend
    call npm install
    cd ..
)

if not exist "frontend\node_modules" (
    echo [安装] 前端依赖未安装，正在安装...
    cd frontend
    call npm install
    cd ..
)

echo [完成] 依赖检查完成
echo.

REM Start backend in new window
echo [启动] 正在启动后端服务 (localhost:8001)...
start "MiMo Backend" cmd /k "cd /d %~dp0backend && echo [后端] 启动中... && npm run dev"

timeout /t 3 /nobreak >nul

echo [完成] 后端已启动
echo.

REM Start frontend in new window
echo [启动] 正在启动前端服务 (localhost:3000)...
start "MiMo Frontend" cmd /k "cd /d %~dp0frontend && echo [前端] 启动中... && npm run dev"

timeout /t 5 /nobreak >nul

echo [完成] 前端已启动
echo.

echo ══════════════════════════════════════════
echo   🎧 MiMo AI Radio 已就绪！
echo ══════════════════════════════════════════
echo.
echo   前端: http://localhost:3000
echo   后端: http://localhost:8001
echo   API : http://localhost:8001/api
echo.
echo   关闭 Backend 窗口停止后端服务
echo   关闭 Frontend 窗口停止前端服务
echo.

pause
