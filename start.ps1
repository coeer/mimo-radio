# MiMo AI Radio - 一键启动脚本 (PowerShell)

$RED = "`e[31m"
$GREEN = "`e[32m"
$YELLOW = "`e[33m"
$BLUE = "`e[34m"
$CYAN = "`e[36m"
$NC = "`e[0m"

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       🎧 MiMo AI Radio 启动器         ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "backend") -or -not (Test-Path "frontend")) {
    Write-Host "[错误] 请在 mimo-radio 项目根目录下运行此脚本" -ForegroundColor Red
    exit 1
}

# Check dependencies
Write-Host "[检查] 正在检查依赖..." -ForegroundColor Blue

if (-not (Test-Path "backend/node_modules")) {
    Write-Host "[安装] 后端依赖未安装，正在安装..." -ForegroundColor Yellow
    Set-Location backend
    npm install
    Set-Location ..
}

if (-not (Test-Path "frontend/node_modules")) {
    Write-Host "[安装] 前端依赖未安装，正在安装..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
}

Write-Host "[完成] 依赖检查完成" -ForegroundColor Green
Write-Host ""

# Start backend
Write-Host "[启动] 正在启动后端服务 (localhost:8001)..." -ForegroundColor Blue
$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD\backend
    npm run dev
}

Start-Sleep -Seconds 3

# Check if backend started
if ($backendJob.State -eq "Failed") {
    Write-Host "[错误] 后端启动失败" -ForegroundColor Red
    Receive-Job $backendJob
    exit 1
}

Write-Host "[完成] 后端已启动" -ForegroundColor Green
Write-Host ""

# Start frontend
Write-Host "[启动] 正在启动前端服务 (localhost:3000)..." -ForegroundColor Blue
$frontendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD\frontend
    npm run dev
}

Start-Sleep -Seconds 5

if ($frontendJob.State -eq "Failed") {
    Write-Host "[错误] 前端启动失败" -ForegroundColor Red
    Receive-Job $frontendJob
    exit 1
}

Write-Host "[完成] 前端已启动" -ForegroundColor Green
Write-Host ""

Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🎧 MiMo AI Radio 已就绪！" -ForegroundColor Green
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  前端: http://localhost:3000" -ForegroundColor Yellow
Write-Host "  后端: http://localhost:8001" -ForegroundColor Yellow
Write-Host "  API : http://localhost:8001/api" -ForegroundColor Yellow
Write-Host ""
Write-Host "  后端日志: Get-Job | Where-Object { `$_.Name -like '*backend*' } | Receive-Job"
Write-Host "  前端日志: Get-Job | Where-Object { `$_.Name -like '*frontend*' } | Receive-Job"
Write-Host ""
Write-Host "  按 Ctrl+C 停止所有服务" -ForegroundColor Red
Write-Host ""

# Stream logs
try {
    while ($true) {
        $backendOutput = Receive-Job $backendJob -Keep -ErrorAction SilentlyContinue
        $frontendOutput = Receive-Job $frontendJob -Keep -ErrorAction SilentlyContinue

        if ($backendOutput) {
            $backendOutput | ForEach-Object { Write-Host "[后端] $_" -ForegroundColor Blue }
        }
        if ($frontendOutput) {
            $frontendOutput | ForEach-Object { Write-Host "[前端] $_" -ForegroundColor Cyan }
        }

        Start-Sleep -Milliseconds 500
    }
} finally {
    Write-Host ""
    Write-Host "[关闭] 正在停止服务..." -ForegroundColor Yellow
    Stop-Job $backendJob -ErrorAction SilentlyContinue
    Stop-Job $frontendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job $frontendJob -ErrorAction SilentlyContinue
    Write-Host "[完成] 已退出" -ForegroundColor Green
}
