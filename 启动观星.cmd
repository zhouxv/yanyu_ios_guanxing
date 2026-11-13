@echo off
setlocal
cd /d "%~dp0"
set IOSGUANXING_DISABLE_AUTO_UPDATE=1
start "" ".venv\Scripts\pythonw.exe" "desktop_main.py"
