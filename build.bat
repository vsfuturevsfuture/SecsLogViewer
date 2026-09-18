@echo off
setlocal
cd /d "%~dp0"

rem Step 2 of 2 : compile launcher.cpp + secs_log_html.h  ->  SecsLogViewer.exe
rem Works from a "Developer Command Prompt for VS"; if cl.exe is not on PATH it
rem tries to call vcvars64.bat itself (override with the VS_VCVARS variable).

where cl >nul 2>nul
if not errorlevel 1 goto have_cl
if defined VS_VCVARS goto have_vcvars
set VS_VCVARS=D:\zl\vs2026\VC\Auxiliary\Build\vcvars64.bat
:have_vcvars
if exist "%VS_VCVARS%" call "%VS_VCVARS%" >nul
:have_cl

where cl >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] cl.exe not found.
    echo         Open a "Developer Command Prompt for VS", or run this first:
    echo             "D:\zl\vs2026\VC\Auxiliary\Build\vcvars64.bat"
    echo.
    pause
    exit /b 1
)

if not exist build mkdir build

cl /nologo /O2 /MT launcher.cpp /Fo:build\ /link user32.lib shell32.lib /OUT:SecsLogViewer.exe
if %ERRORLEVEL% equ 0 (
    echo.
    echo === Build OK: SecsLogViewer.exe ===
    dir SecsLogViewer.exe
) else (
    echo.
    echo Build FAILED.
)
pause
