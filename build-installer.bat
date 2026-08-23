@echo off
setlocal EnableDelayedExpansion
rem build-installer.bat - produces the same unsigned Squirrel.Windows installer CI publishes,
rem through the same electron-builder.yml config, on the same version.
rem
rem Contract: touchless, idempotent, silent-capable (/s, --silent, or SILENT=1 env), pre-elevates
rem on interactive runs only, never signs anything (code signing is permanently prohibited on
rem this project), and verifies the artifact it produced before claiming success.

set "SILENT=0"
if /I "%~1"=="/s" set "SILENT=1"
if /I "%~1"=="--silent" set "SILENT=1"
if /I "%SILENT%"=="1" set "SILENT=1"

set "REPO=%~dp0"
pushd "%REPO%" || exit /b 1

if /I "%SILENT%"=="0" (
  net session >nul 2>nul
  if errorlevel 1 (
    echo [build-installer] relaunching elevated for the one-time dependency check...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait"
    if not errorlevel 1 (
      exit /b 0
    )
    echo [build-installer] elevation was declined or failed; continuing without it - every dependency here is user-scoped.
  )
)

echo [build-installer] phase: fetching dependencies
call "%REPO%download-dependencies.bat" /s
if errorlevel 1 (
  echo [build-installer] FAILED: download-dependencies.bat reported a real failure.
  popd
  exit /b 1
)

echo [build-installer] phase: building the application
call npm run build
if errorlevel 1 (
  echo [build-installer] FAILED: "npm run build" reported a real failure.
  popd
  exit /b 1
)

echo [build-installer] phase: packaging the unsigned Squirrel.Windows installer
set "T0=%time%"
call npx electron-builder --win squirrel --config electron-builder.yml
set "BUILDER_EXIT=%ERRORLEVEL%"
if not "%BUILDER_EXIT%"=="0" (
  echo [build-installer] FAILED: electron-builder exited %BUILDER_EXIT%. See its output above for the exact packaging error.
  popd
  exit /b 1
)
echo [build-installer]   packaging finished ^(started %T0%, now %time%^)

echo [build-installer] phase: verifying the produced artifact
set "SETUP_DIR=%REPO%dist\installer\squirrel-windows"
set "SETUP_EXE="
if exist "%SETUP_DIR%" (
  for %%f in ("%SETUP_DIR%\*Setup*.exe") do set "SETUP_EXE=%%~ff"
)
if not defined SETUP_EXE (
  echo [build-installer] FAILED: no Setup*.exe found under %SETUP_DIR%.
  echo [build-installer]   electron-builder --win squirrel writes output under dist\installer\squirrel-windows, not the dist root - checked there.
  popd
  exit /b 1
)

for %%f in ("%SETUP_EXE%") do set "SETUP_SIZE=%%~zf"
if %SETUP_SIZE% LSS 1000000 (
  echo [build-installer] FAILED: %SETUP_EXE% is only %SETUP_SIZE% bytes - too small to be a real Electron installer.
  popd
  exit /b 1
)

for /f "delims=" %%h in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 '%SETUP_EXE%').Hash"') do set "SETUP_SHA256=%%h"

for /f "delims=" %%s in ('powershell -NoProfile -Command "(Get-AuthenticodeSignature '%SETUP_EXE%').Status"') do set "SIGN_STATUS=%%s"

for /f "delims=" %%c in ('git rev-parse HEAD 2^>nul') do set "COMMIT=%%c"
if not defined COMMIT set "COMMIT=unknown (not a git checkout)"

echo.
echo [build-installer] ================= RELEASE ARTIFACT =================
echo [build-installer] path      : %SETUP_EXE%
echo [build-installer] size      : %SETUP_SIZE% bytes
echo [build-installer] sha256    : %SETUP_SHA256%
echo [build-installer] commit    : %COMMIT%
echo [build-installer] signature : %SIGN_STATUS%  ^(expected NotSigned - code signing is permanently prohibited on this project^)
echo [build-installer] =======================================================
echo.
echo [build-installer] This installer is UNSIGNED. Windows SmartScreen will show an
echo [build-installer] "unknown publisher" warning on first run. This is expected and will
echo [build-installer] not be fixed by obtaining a certificate - signing is permanently out
echo [build-installer] of scope for this project.
echo.
echo [build-installer] This script does not publish, tag, or create a release. It only builds
echo [build-installer] and verifies the local artifact above.

popd
exit /b 0
