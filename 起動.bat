@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

where npm >nul 2>&1
if errorlevel 1 (
    echo npm が見つかりません。Node.js をインストールしてください。
    pause
    exit /b 1
)

where cargo >nul 2>&1
if errorlevel 1 (
    echo Rust ^(cargo^) が見つかりません。rustup をインストールしてください。
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo 初回: npm install を実行します...
    call npm install
    if errorlevel 1 (
        pause
        exit /b 1
    )
)

echo 画像スワイプを起動しています... ^(終了はこのウィンドウで Ctrl+C^)
call npm run tauri dev
if errorlevel 1 pause
