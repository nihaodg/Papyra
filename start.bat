@echo off
chcp 65001 >nul
title PDF知识库

echo ========================================
echo   PDF知识库 - 启动中...
echo ========================================
echo.

:: 检查 node_modules 是否存在
if not exist "node_modules\" (
    echo [1/2] 首次运行，正在安装依赖...
    call npm install --registry=https://registry.npmmirror.com
    echo.
)

echo [2/2] 启动应用...
echo.
echo 提示：
echo   - Vite开发服务器将在后台启动
echo   - 请等待Electron窗口自动弹出
echo   - 关闭此窗口将同时退出程序
echo.

:: 启动 Vite 开发服务器 + Electron
:: 使用 concurrently 管理两个进程
npx concurrently --kill-others "npx vite" "npx wait-on http://localhost:5173 && npx electron ."

echo.
echo 程序已退出。
pause
