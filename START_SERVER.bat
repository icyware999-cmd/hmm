@echo off
title avoidkxrried Engine Console
color 0c
echo ========================================================
echo               avoidkxrried - SECURE EMAIL GATEWAY
echo ========================================================
echo.
echo  [SYSTEM] Starting Node.js Web and SMTP Email engine...
echo  [PORT] Web server listening on: http://localhost:3000
echo  [PORT] SMTP Server listening on: Port 2525
echo.
echo  (Note: Run this batch file as Administrator if you want 
echo   to map external port 25 directly in your system)
echo ========================================================
echo.
node server.js
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Node.js execution failed! 
    echo  Please ensure Node.js is installed from https://nodejs.org/
    echo.
    pause
)
