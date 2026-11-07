@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where gh >nul 2>&1
if errorlevel 1 (
    echo GitHub CLI ^(gh^) が見つかりません。インストール後にもう一度実行してください。
    pause
    exit /b 1
)

echo 直近の Release ワークフロー:
gh run list --workflow=release.yml --limit 3
echo.
for /f "tokens=*" %%i in ('gh run list --workflow^=release.yml --limit 1 --json databaseId -q ".[0].databaseId"') do set RUN_ID=%%i
if not defined RUN_ID (
    echo 実行履歴がありません。
    pause
    exit /b 1
)

echo 進行中の実行 ID %RUN_ID% をウォッチします（完了まで表示が更新されます）...
echo GitHub: https://github.com/honi0907/image-swipe/actions
echo.
gh run watch %RUN_ID%
echo.
gh run view %RUN_ID%
pause
