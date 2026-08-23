@echo off
setlocal EnableDelayedExpansion
rem build.bat - takes a fresh checkout with nothing installed to a runnable agent-whip app.
rem
rem Contract: touchless, idempotent, silent-capable (/s, --silent, or SILENT=1 env), pre-elevates
rem on interactive runs only, never weakens the machine's persistent execution policy, refreshes
rem PATH after installing anything so the very next command in this same script can find it, and
rem asks whether to launch the app only as its very last step.

set "SILENT=0"
if /I "%~1"=="/s" set "SILENT=1"
if /I "%~1"=="--silent" set "SILENT=1"
if /I "%SILENT%"=="1" set "SILENT=1"

set "REPO=%~dp0"
pushd "%REPO%" || exit /b 1

rem --- Pre-elevate up front (interactive runs only) --------------------------------------------
rem Checked first so a real permission requirement fails at second zero, not six minutes in. This
rem is never required for anything build.bat actually installs (Node/npm are user- or
rem machine-scoped installs that already work without it, and everything else here is
rem project-local) -- it exists purely so a genuinely-needed elevation prompt shows up early.
if /I "%SILENT%"=="0" (
  net session >nul 2>nul
  if errorlevel 1 (
    echo [build] relaunching elevated for the one-time dependency check...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait" 
    if errorlevel 1 (
      echo [build] elevation was declined or failed; continuing without it - every dependency here is user-scoped.
    ) else (
      exit /b 0
    )
  )
)

echo [build] phase: fetching dependencies
call "%REPO%download-dependencies.bat" /s
if errorlevel 1 (
  echo [build] FAILED: download-dependencies.bat reported a real failure. See its output above for the exact dependency, source, and error.
  popd
  exit /b 1
)

rem Refresh PATH from the registry for this process, in case download-dependencies.bat's own
rem install steps changed a machine or user PATH that this already-running cmd.exe has cached.
for /f "tokens=2,*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%B"
for /f "tokens=2,*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
if defined SYS_PATH if defined USER_PATH set "PATH=%SYS_PATH%;%USER_PATH%;%PATH%"

echo [build] phase: building the real application
set "T0=%time%"
call npm run build
if errorlevel 1 (
  echo [build] FAILED: "npm run build" reported a real failure. See its output above.
  popd
  exit /b 1
)
echo [build]   build finished ^(started %T0%, now %time%^)

if not exist "%REPO%dist\main\index.js" (
  echo [build] FAILED: expected dist\main\index.js was not produced.
  popd
  exit /b 1
)
echo [build] verified: dist\main\index.js exists.

echo [build] done. The app can be launched with:  npx electron .

if /I "%SILENT%"=="1" (
  popd
  exit /b 0
)

echo.
set /p RUNIT="[build] Run agent-whip now? [y/N] "
if /I "%RUNIT%"=="y" (
  call npx electron .
)

popd
exit /b 0
