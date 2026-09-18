@echo off
setlocal
cd /d "%~dp0.."

rem Build launcher.cpp with SECSLOG_SELFTEST (writes the html, does not open a browser)
rem and run it. Used by dev\test-exe.mjs.

where cl >nul 2>nul
if not errorlevel 1 goto have_cl
if defined VS_VCVARS goto have_vcvars
set VS_VCVARS=D:\zl\vs2026\VC\Auxiliary\Build\vcvars64.bat
:have_vcvars
if exist "%VS_VCVARS%" call "%VS_VCVARS%" >nul
:have_cl

where cl >nul 2>nul
if errorlevel 1 (
    echo [ERROR] cl.exe not found. Open a Developer Command Prompt for VS first.
    exit /b 1
)

if not exist build mkdir build
cl /nologo /O2 /MT /DSECSLOG_SELFTEST launcher.cpp /Fo:build\st_ /link user32.lib shell32.lib /OUT:build\selftest.exe
if errorlevel 1 exit /b 1

build\selftest.exe
if errorlevel 1 exit /b 1
exit /b 0
