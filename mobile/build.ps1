# Builds the Go core (jbcore) as an Android library for the app.
#   .\build.ps1                        -> mobile\build\jbcore.aar
#   .\build.ps1 -Out X:\app\libs\jbcore.aar
# Needs Go, gomobile (go install golang.org/x/mobile/cmd/gomobile@latest and
# .../gobind@latest) and the Android SDK with an NDK.
param([string]$Out = "$PSScriptRoot\build\jbcore.aar")
$ErrorActionPreference = 'Stop'
$env:Path = "C:\Program Files\Go\bin;$env:USERPROFILE\go\bin;$env:Path"
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
if (-not $env:ANDROID_NDK_HOME) {
    $env:ANDROID_NDK_HOME = (Get-ChildItem "$env:ANDROID_HOME\ndk" | Sort-Object Name | Select-Object -Last 1).FullName
}
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
Push-Location $PSScriptRoot
try {
    gomobile bind -target android/arm64 -androidapi 26 -trimpath -ldflags "-s -w -extldflags=-Wl,-z,max-page-size=16384" -o $Out ./jbcore
    if ($LASTEXITCODE -ne 0) { throw "gomobile bind failed" }
    Write-Host "built $Out"
} finally { Pop-Location }
