@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "EXE=%~dp0src-tauri\target\release\swipe.exe"
if not exist "%EXE%" (
    echo ビルド済み exe がありません。
    echo 先に「ビルド.bat」を実行するか、npm run tauri build を実行してください。
    pause
    exit /b 1
)

start "" "%EXE%"
