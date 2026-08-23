@echo off
setlocal EnableDelayedExpansion
rem download-dependencies.bat - fetches every dependency agent-whip needs to build, run and test.
rem
rem Contract: idempotent, silent-capable (/s, --silent, or SILENT=1), exits non-zero on the first
rem real failure, never touches secrets/signing, and never requires administrator rights (every
rem dependency here resolves to a user-scoped or project-local location).
rem
rem Versions are pinned by the committed package-lock.json, whose "integrity" field records a
rem verified SRI digest for every npm package this script installs -- see DEPENDENCIES.md beside
rem this script for the manifest of what that covers and what it does not (native binaries that
rem ship outside npm's own postinstall, namely the Electron runtime itself).

set "SILENT=0"
if /I "%~1"=="/s" set "SILENT=1"
if /I "%~1"=="--silent" set "SILENT=1"
if /I "%SILENT%"=="1" set "SILENT=1" & set "SILENT_FROM_ENV=1"

set "REPO=%~dp0"
pushd "%REPO%" || exit /b 1

echo [download-dependencies] phase: checking for Node.js and npm
where node >nul 2>nul
if errorlevel 1 (
  echo [download-dependencies] FAILED: node not found on PATH.
  echo [download-dependencies]   dependency: Node.js ^>= 20
  echo [download-dependencies]   source tried: PATH lookup ^(where node^)
  echo [download-dependencies]   fix: install Node.js 20+ from https://nodejs.org/ ^(winget: winget install OpenJS.NodeJS.LTS^), then re-run this script.
  popd
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODE_VERSION=%%v"
echo [download-dependencies]   found node %NODE_VERSION%

where npm >nul 2>nul
if errorlevel 1 (
  echo [download-dependencies] FAILED: npm not found on PATH ^(expected alongside node^).
  popd
  exit /b 1
)
for /f "delims=" %%v in ('npm -v') do set "NPM_VERSION=%%v"
echo [download-dependencies]   found npm %NPM_VERSION%

echo [download-dependencies] phase: installing npm packages pinned by package-lock.json
set "T0=%time%"
call npm ci --no-audit --no-fund
if errorlevel 1 (
  echo [download-dependencies] "npm ci" failed ^(a lockfile/tree mismatch^) - falling back to "npm install"
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [download-dependencies] FAILED: npm could not install dependencies.
    echo [download-dependencies]   dependency: packages declared in package.json / package-lock.json
    echo [download-dependencies]   source tried: npm registry ^(registry.npmjs.org, the ecosystem's canonical upstream^)
    popd
    exit /b 1
  )
)
echo [download-dependencies]   npm packages installed ^(pinned + verified by package-lock.json integrity hashes^)

rem npm's install-script gate ("allow-scripts") can leave a package's own postinstall un-run even
rem after "npm ci" reports success. Approve the specific packages this project actually needs
rem native/binary output from, then verify the one that matters most (Electron's own binary).
echo [download-dependencies] phase: approving and verifying native install scripts
call npm approve-scripts electron electron-winstaller esbuild >nul 2>nul

if not exist "node_modules\electron\dist\electron.exe" (
  echo [download-dependencies]   node_modules\electron\dist\electron.exe missing - running electron's own install step
  call node node_modules\electron\install.js
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo [download-dependencies] FAILED: Electron runtime binary did not materialize.
  echo [download-dependencies]   dependency: electron ^(declared in devDependencies, pinned in package-lock.json^)
  echo [download-dependencies]   source tried: @electron/get cache, then node_modules\electron\install.js
  echo [download-dependencies]   expected file: node_modules\electron\dist\electron.exe
  popd
  exit /b 1
)
for %%f in ("node_modules\electron\dist\electron.exe") do echo [download-dependencies]   verified node_modules\electron\dist\electron.exe ^(%%~zf bytes^)

echo [download-dependencies] phase: generating project icon assets ^(no network, no third-party image library^)
call node scripts\generate-icon.mjs
if errorlevel 1 (
  echo [download-dependencies] FAILED: icon generation failed.
  popd
  exit /b 1
)

echo [download-dependencies] all dependencies present and verified.
popd
exit /b 0
