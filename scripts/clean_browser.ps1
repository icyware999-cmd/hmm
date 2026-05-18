# avoidkxrried - Browser Cleaner Utility
# Closes running browser processes and deletes local histories, profiles caches, and user cookies

$ErrorActionPreference = "SilentlyContinue"
Write-Host "=============================================" -ForegroundColor Red
Write-Host "     AVOIDKXRRIED - SECURE BROWSER CLEANER   " -ForegroundColor DarkRed
Write-Host "=============================================" -ForegroundColor Red
Write-Host ""

$browsers = @("chrome", "msedge", "firefox", "opera", "brave")

# 1. Terminate browser processes
Write-Host "Stopping running browser instances..." -ForegroundColor Yellow
foreach ($browser in $browsers) {
    $proc = Get-Process -Name $browser
    if ($proc) {
        Write-Host "Stopping $browser process..." -ForegroundColor Gray
        Stop-Process -Name $browser -Force
        Start-Sleep -Seconds 1
    }
}
Write-Host "All active browser sessions stopped." -ForegroundColor Green
Write-Host ""

# 2. Define target cleanup paths
$appdata = $env:LOCALAPPDATA
$roaming = $env:APPDATA
$targets = @(
    # Google Chrome caches
    "$appdata\Google\Chrome\User Data\Default\Cache\*",
    "$appdata\Google\Chrome\User Data\Default\Code Cache\*",
    "$appdata\Google\Chrome\User Data\Default\Cookies",
    "$appdata\Google\Chrome\User Data\Default\Cookies-journal",
    "$appdata\Google\Chrome\User Data\Default\History",
    "$appdata\Google\Chrome\User Data\Default\History-journal",
    "$appdata\Google\Chrome\User Data\Default\Login Data",
    
    # Microsoft Edge caches
    "$appdata\Microsoft\Edge\User Data\Default\Cache\*",
    "$appdata\Microsoft\Edge\User Data\Default\Code Cache\*",
    "$appdata\Microsoft\Edge\User Data\Default\Cookies",
    "$appdata\Microsoft\Edge\User Data\Default\Cookies-journal",
    "$appdata\Microsoft\Edge\User Data\Default\History",
    "$appdata\Microsoft\Edge\User Data\Default\History-journal",
    
    # Mozilla Firefox caches
    "$roaming\Mozilla\Firefox\Profiles\*\cache2\*",
    "$roaming\Mozilla\Firefox\Profiles\*\cookies.sqlite",
    "$roaming\Mozilla\Firefox\Profiles\*\places.sqlite"
)

Write-Host "Purging local browser histories, cookies, and database cache records..." -ForegroundColor Yellow
$cleanedCount = 0

foreach ($target in $targets) {
    if (Test-Path $target) {
        Remove-Item -Path $target -Force -Recurse -Confirm:$false
        Write-Host "Wiped trace: $(Split-Path $target -Leaf)" -ForegroundColor Gray
        $cleanedCount++
    }
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Red
Write-Host " SUCCESS: Closed all browsers and wiped $cleanedCount session caches." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Red
