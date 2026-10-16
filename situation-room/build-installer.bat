@echo off
rem Builds the installer on a Windows PC that has Node.js. Output: dist\Situation-Room-Setup-<version>.exe
cd /d "%~dp0"
call npm install || goto fail
call npm test || goto fail
call npm run dist || goto fail
echo.
echo Done. The installer is in the dist folder.
pause
exit /b 0
:fail
echo Build failed. Read the messages above.
pause
exit /b 1
