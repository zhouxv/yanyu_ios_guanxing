@echo off
setlocal
cd /d "%~dp0" || exit /b 1
if not exist ".venv\Scripts\python.exe" (
    echo Project Python is missing: .venv\Scripts\python.exe
    goto :failed
)

rem Keep unrelated Qt, ICU and OpenSSL DLLs out of the executable.
set "BUILD_PYTHON_ROOT="
for /f "delims=" %%P in ('.venv\Scripts\python.exe -c "import sys; print(sys.base_prefix)"') do set "BUILD_PYTHON_ROOT=%%P"
if not defined BUILD_PYTHON_ROOT goto :failed
set "PATH=%CD%\.venv\Scripts;%BUILD_PYTHON_ROOT%;%BUILD_PYTHON_ROOT%\DLLs;%SystemRoot%\System32;%SystemRoot%"
".venv\Scripts\python.exe" -m PyInstaller --noconfirm --workpath build\packaged-windows iosGuanxing.spec
if errorlevel 1 goto :failed
echo Built "%CD%\dist\iosGuanxing.exe"
exit /b 0

:failed
echo Build failed.
pause
exit /b 1
