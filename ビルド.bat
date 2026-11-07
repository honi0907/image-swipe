@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

if not exist "node_modules\" (
    call npm install
    if errorlevel 1 (
        pause
        exit /b 1
    )
)

echo リリースビルドを実行します ^(数分かかります^)...
call npm run tauri build
if errorlevel 1 pause
else echo 完了: src-tauri\target\release\swipe.exe
