@echo off
echo ========================================
echo   Pushing to GitHub - mosadddyfu/panda
echo ========================================
echo.

cd "%~dp0"

echo [1/2] Checking Git status...
git status

echo.
echo [2/2] Pushing to GitHub...
git push -u origin main

echo.
if %errorlevel% equ 0 (
    echo ========================================
    echo   SUCCESS! Updates pushed to GitHub
    echo ========================================
    echo.
    echo View your repo at:
    echo https://github.com/mosadddyfu/panda
) else (
    echo ========================================
    echo   ERROR! Push failed
    echo ========================================
    echo.
    echo Common solutions:
    echo 1. Create repository on GitHub first
    echo 2. Check your GitHub credentials
    echo 3. Use: git push -u origin main --force
)

echo.
pause
