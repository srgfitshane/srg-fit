@echo off
REM ============================================================
REM verify.cmd - run before claiming a fix is "ready to ship"
REM ============================================================
REM Runs in this order, fails fast:
REM   1. Encoding check (mojibake / emoji-loss)
REM   2. Next.js build (catches Turbopack parse errors + tsc)
REM
REM Used by: .git-hooks/pre-commit AND interactive sessions.
REM Pass --no-build to skip the next build step (encoding only).
REM ============================================================

setlocal
cd /d "%~dp0\.."

echo.
echo === [1/2] Encoding check ===
py scripts\check-encoding.py
if errorlevel 1 (
    echo.
    echo VERIFY FAILED: encoding check
    exit /b 1
)
echo OK

if "%1"=="--no-build" (
    echo.
    echo Skipping next build step ^(--no-build^)
    echo VERIFY OK
    exit /b 0
)

echo.
echo === [2/2] Next.js build (this takes 30-90 seconds) ===
call npx next build > .verify-build.log 2>&1
if errorlevel 1 (
    echo.
    echo VERIFY FAILED: next build
    echo.
    echo --- last 60 lines of .verify-build.log ---
    powershell -NoProfile -Command "Get-Content -LiteralPath .verify-build.log -Tail 60"
    echo --- end of build log ---
    echo.
    echo Full log: .verify-build.log
    exit /b 1
)
del .verify-build.log 2>nul
echo OK

echo.
echo ========================================
echo  VERIFY OK - ready to commit
echo ========================================
exit /b 0