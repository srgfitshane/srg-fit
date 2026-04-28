@echo off
REM ============================================================
REM install-hooks.cmd - point git at .git-hooks/
REM ============================================================
REM Run this once per machine after cloning the repo.
REM Configures git hooksPath so the committed .git-hooks/ dir
REM is used instead of the local .git/hooks/ (which isn't
REM under version control).
REM ============================================================

setlocal
cd /d "%~dp0\.."

git config core.hooksPath .git-hooks
if errorlevel 1 (
    echo Failed to configure hooksPath. Are you in a git repo?
    exit /b 1
)

echo.
echo Hooks installed. core.hooksPath = .git-hooks
echo.
git config --get core.hooksPath
echo.
echo Pre-commit hook will now run scripts\verify.cmd on every commit.
echo Bypass with: git commit --no-verify
exit /b 0