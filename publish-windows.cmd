@echo off
setlocal

rem ------------------------------
rem Publish .NET Web App for Windows
rem ------------------------------

rem Configuration
set "PROJECT_FILE=src\Bergdahl.ActiveDirectory.Web\Bergdahl.ActiveDirectory.Web.csproj"
set "OUTPUT_DIR=.\publish"
rem Windows 64-bit; use win-arm64 for ARM servers
set "RUNTIME=win-x64"
rem Release builds use the real Active Directory services, not the mocks
set "CONFIGURATION=Release"

rem Run from the folder this script is in
cd /d "%~dp0"

echo Publishing %PROJECT_FILE% for Windows (%RUNTIME%)...

rem Clean previous build
dotnet clean "%PROJECT_FILE%" -c %CONFIGURATION%
if errorlevel 1 goto :failed

rem Publish (framework-dependent: the server needs the ASP.NET Core 10.0 Hosting Bundle)
dotnet publish "%PROJECT_FILE%" -c %CONFIGURATION% -r %RUNTIME% --self-contained false -o "%OUTPUT_DIR%"
if errorlevel 1 goto :failed

echo.
echo Publish complete!
echo Output folder: %OUTPUT_DIR%
echo Copy the folder to the IIS site's physical path (see README), or run it directly:
echo    Bergdahl.ActiveDirectory.Web.exe
exit /b 0

:failed
echo.
echo Publish failed.
exit /b 1
