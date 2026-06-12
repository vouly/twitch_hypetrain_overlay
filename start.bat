@echo off
chcp 65001 >nul
title Hype Train Overlay

echo.
echo  ==========================================
echo   Twitch Hype Train Overlay
echo  ==========================================
echo.

:: Node.js pruefen
node --version >/dev/null 2>nul
if %errorlevel% neq 0 (
    echo  [!] Node.js ist nicht installiert.
    echo.
    echo      Bitte installiere Node.js von:
    echo      https://nodejs.org  - LTS-Version empfohlen
    echo.
    echo      Starte diese Datei danach erneut.
    echo.
    start https://nodejs.org
    pause
    exit /b 1
)

:: Abhaengigkeiten einmalig installieren
if not exist "node_modules" (
    echo  Installiere Abhaengigkeiten - nur beim ersten Start...
    echo.
    npm install --silent
    if %errorlevel% neq 0 (
        echo  [!] Installation fehlgeschlagen.
        pause
        exit /b 1
    )
    echo  Installation abgeschlossen.
    echo.
)

echo  Server startet...
echo  Das Programm oeffnet sich automatisch im Browser.
echo.
echo  Zum Beenden dieses Fenster schliessen.
echo  ==========================================
echo.

npm start
pause
