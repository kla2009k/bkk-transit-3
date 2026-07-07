$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$port = 8321
$ipLine = ipconfig | Select-String -Pattern "IPv4 Address" | Select-Object -First 1
$ip = if ($ipLine) { (($ipLine -split ":")[-1]).Trim() } else { "YOUR_WIFI_IP" }

Write-Host ""
Write-Host "Bangkok Transit 3D mobile server" -ForegroundColor Yellow
Write-Host "Project: $root"
Write-Host ""
Write-Host "Open on this computer:" -ForegroundColor Green
Write-Host "  http://127.0.0.1:$port/"
Write-Host ""
Write-Host "Open on your phone on the same Wi-Fi:" -ForegroundColor Green
Write-Host "  http://$ip`:$port/"
Write-Host ""
Write-Host "Keep this window open while testing on the phone." -ForegroundColor Cyan
Write-Host ""

python -m http.server $port --bind 0.0.0.0
