@echo off
setlocal
cd /d "%~dp0"

rem Step 1 of 2 : index.html  ->  secs_log_html.h
rem Same as running this in Git Bash:
rem     xxd -i -n secs_log_html index.html > secs_log_html.h
rem (-n keeps the symbol names fixed to secs_log_html / secs_log_html_len,
rem  which is what launcher.cpp includes.)

set XXD=
for %%P in (
    "D:\Program Files\Git\usr\bin\xxd.exe"
    "C:\Program Files\Git\usr\bin\xxd.exe"
    "C:\Program Files (x86)\Git\usr\bin\xxd.exe"
    "D:\Program Files (x86)\Git\usr\bin\xxd.exe"
) do if not defined XXD if exist %%P set XXD=%%~P

if not defined XXD for /f "delims=" %%P in ('where xxd 2^>nul') do if not defined XXD set XXD=%%P

if not defined XXD (
    echo.
    echo [ERROR] xxd.exe not found ^(it ships with Git for Windows^).
    echo         Run this in Git Bash instead:
    echo             cd /e/s26042/tools/SecsLogViewer
    echo             xxd -i -n secs_log_html index.html ^> secs_log_html.h
    echo.
    pause
    exit /b 1
)

echo Using xxd: %XXD%
"%XXD%" -i -n secs_log_html index.html > secs_log_html.h
if %ERRORLEVEL% neq 0 (
    echo.
    echo Header generation FAILED.
    pause
    exit /b 1
)
echo.
echo === Header OK: secs_log_html.h ===
dir secs_log_html.h
pause
