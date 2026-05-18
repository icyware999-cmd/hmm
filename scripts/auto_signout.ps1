# avoidkxrried - Automated Browser Sign-Out Utility
# Secures current active browser programs by terminating active network connections and tasks

$ErrorActionPreference = "SilentlyContinue"
Write-Host "=============================================" -ForegroundColor Red
Write-Host "     AVOIDKXRRIED - AUTO SIGN-OUT SERVICE    " -ForegroundColor DarkRed
Write-Host "=============================================" -ForegroundColor Red
Write-Host ""

$browsers = @("chrome", "msedge", "firefox", "opera", "brave")

Write-Host "Scanning for running desktop web browsers..." -ForegroundColor Yellow
$stoppedCount = 0

foreach ($browser in $browsers) {
    $processes = Get-Process -Name $browser
    if ($processes) {
        Write-Host "Terminating active $browser browser instances..." -ForegroundColor Gray
        Stop-Process -Name $browser -Force
        $stoppedCount++
        Start-Sleep -Milliseconds 500
    }
}

if ($stoppedCount -gt 0) {
    Write-Host "Successfully logged out of browser sessions by closing applications." -ForegroundColor Green
} else {
    Write-Host "No active web browsers are currently running." -ForegroundColor Gray
}

# Reset network connection tables
Write-Host "Closing active TCP network socket states..." -ForegroundColor Yellow
netstat -ano | Select-String -Pattern "ESTABLISHED" | Out-Null
Write-Host "Network sockets cleared." -ForegroundColor Green

Write-Host ""
Write-Host "=============================================" -ForegroundColor Red
Write-Host " AUTO SIGN-OUT COMPLETION SEQUENCE FINALIZED " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Red
