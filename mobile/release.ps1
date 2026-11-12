# Builds the signed Reskon release APK and (unless -NoSend) copies it to the Linux machine.
#   .\mobile\release.ps1             build, sign, check the signature, send to /home/aakash/apks/
#   .\mobile\release.ps1 -NoSend     build and sign only
#   .\mobile\release.ps1 -SkipCore   reuse mobile\build\jbcore.aar instead of rebuilding the Go core
# The key and its passphrase stay in X:\Personal\Keys, never in the repo. This script reads the passphrase into an
# environment variable for the build only; it is never printed.
param(
    [switch]$NoSend,
    [switch]$SkipCore,
    [string]$Keys = 'X:\Personal\Keys',
    [string]$Server = '192.168.0.8',
    [string]$RemoteDir = '/home/aakash/apks'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$android = Join-Path $PSScriptRoot 'android'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }

$jks = Join-Path $Keys 'reskon-release.jks'
$passFile = Join-Path $Keys 'reskon-passphrase.txt'
if (-not (Test-Path $jks) -or -not (Test-Path $passFile)) { throw "Missing key files in $Keys" }
$env:RESKON_KEYSTORE = $jks
$env:RESKON_KEY_PASS = (Get-Content $passFile -Raw).Trim()

try {
    if (-not $SkipCore) { & (Join-Path $PSScriptRoot 'build.ps1'); if ($LASTEXITCODE -ne 0) { throw 'core build failed' } }

    Push-Location $android
    try {
        .\gradlew.bat --console=plain -q assembleRelease
        if ($LASTEXITCODE -ne 0) { throw 'gradle assembleRelease failed' }
    } finally { Pop-Location }

    $built = Join-Path $android 'app\build\outputs\apk\release\app-release.apk'
    if (-not (Test-Path $built)) { throw "No signed APK at $built (unsigned builds are named app-release-unsigned.apk)" }

    # Prove it is signed with the Reskon key, not just signed.
    $apksigner = (Get-ChildItem "$env:ANDROID_HOME\build-tools" | Sort-Object Name | Select-Object -Last 1).FullName + '\apksigner.bat'
    $certs = & $apksigner verify --print-certs $built
    if ($LASTEXITCODE -ne 0) { throw 'apksigner verify failed' }
    $want = ((& "$env:JAVA_HOME\bin\keytool.exe" -list -keystore $jks -storepass:env RESKON_KEY_PASS) -join "`n")
    $wantSha = ([regex]::Match($want, 'SHA-256\):\s*([0-9A-F:]+)').Groups[1].Value -replace ':', '').ToLower()
    $gotSha = ([regex]::Match(($certs -join "`n"), 'SHA-256 digest:\s*([0-9a-f]+)').Groups[1].Value).ToLower()
    if (-not $wantSha -or $wantSha -ne $gotSha) { throw "APK certificate $gotSha is not the Reskon key $wantSha" }
    Write-Host "signed with the Reskon key (SHA-256 $gotSha)"

    $version = (Get-Content (Join-Path $repo 'VERSION') -Raw).Trim()
    $outDir = Join-Path $PSScriptRoot 'build'
    New-Item -ItemType Directory -Force $outDir | Out-Null
    $apk = Join-Path $outDir "Reskon-$version.apk"
    Copy-Item $built $apk -Force
    Write-Host "built $apk"

    if (-not $NoSend) {
        # send.py drops the file in the receiver's folder under its own name, then the command moves it.
        python (Join-Path $repo 'tools\ship\send.py') $Server $apk --run "mkdir -p $RemoteDir && mv -f Reskon-$version.apk $RemoteDir/ && ls -l $RemoteDir/Reskon-$version.apk && sha256sum $RemoteDir/Reskon-$version.apk"
        if ($LASTEXITCODE -ne 0) { throw 'sending the APK failed' }
        Write-Host "local sha256: $((Get-FileHash $apk -Algorithm SHA256).Hash.ToLower())"
    }
} finally {
    Remove-Item Env:RESKON_KEY_PASS -ErrorAction SilentlyContinue
    Remove-Item Env:RESKON_KEYSTORE -ErrorAction SilentlyContinue
}
