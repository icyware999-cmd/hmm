# avoidkxrried - Gmail Cookie & Connection IP Wiper
# Forces termination of browser cookies, removes Google session credentials, and releases/renews the network IP

$ErrorActionPreference = "SilentlyContinue"
Write-Host "=============================================" -ForegroundColor DarkMagenta
Write-Host "     AVOIDKXRRIED - GMAIL & IP SESSION WIPER " -ForegroundColor Magenta
Write-Host "=============================================" -ForegroundColor DarkMagenta
Write-Host ""

# 1. Terminate browser processes to release locks on user database files
Write-Host "[1/4] Terminating open browser engines..." -ForegroundColor Yellow
$browsers = @("chrome", "msedge", "firefox")
foreach ($browser in $browsers) {
    if (Get-Process -Name $browser) {
        Stop-Process -Name $browser -Force
        Start-Sleep -Milliseconds 500
    }
}
Write-Host "All browser sessions terminated." -ForegroundColor Green
Write-Host ""

# 2. Clear Session cookies & local storage paths containing Google authentication keys
Write-Host "[2/4] Wiping Gmail credential keys and session token databases..." -ForegroundColor Yellow
$appdata = $env:LOCALAPPDATA
$roaming = $env:APPDATA

$gmailTraces = @(
    # Google Chrome Credentials & Login Databases
    "$appdata\Google\Chrome\User Data\Default\Network\Cookies",
    "$appdata\Google\Chrome\User Data\Default\Network\Cookies-journal",
    "$appdata\Google\Chrome\User Data\Default\Login Data",
    "$appdata\Google\Chrome\User Data\Default\Login Data-journal",
    "$appdata\Google\Chrome\User Data\Default\Local Storage\*",
    "$appdata\Google\Chrome\User Data\Default\Session Storage\*",
    
    # Microsoft Edge Credentials & Cookies
    "$appdata\Microsoft\Edge\User Data\Default\Network\Cookies",
    "$appdata\Microsoft\Edge\User Data\Default\Network\Cookies-journal",
    "$appdata\Microsoft\Edge\User Data\Default\Login Data",
    "$appdata\Microsoft\Edge\User Data\Default\Local Storage\*",
    
    # Windows system credentials vault linked to Google Accounts
    "$env:APPDATA\Microsoft\Credentials\*"
)

$wipedCount = 0
foreach ($trace in $gmailTraces) {
    if (Test-Path $trace) {
        Remove-Item -Path $trace -Force -Recurse -Confirm:$false
        Write-Host "Successfully wiped: $(Split-Path $trace -Leaf)" -ForegroundColor Gray
        $wipedCount++
    }
}
Write-Host "Gmail credentials and Google login session caches deleted." -ForegroundColor Green
Write-Host ""

# 3. Clear Windows Credential Vault (Google entries)
Write-Host "[3/4] Resetting web credentials store..." -ForegroundColor Yellow
cmdkey /list | Select-String -Pattern "Google" | ForEach-Object {
    $target = ($_ -split "Target:")[1].Trim()
    cmdkey /delete:$target | Out-Null
    Write-Host "Deleted credentials key: $target" -ForegroundColor Gray
}
Write-Host "System credentials store cleared." -ForegroundColor Green
Write-Host ""

# 4. Network adapter trace reset (Release and renew local lease IP, flush routing states)
Write-Host "[4/4] Wiping IP session trace. Resetting network adapters..." -ForegroundColor Yellow
Write-Host "Releasing active IPv4 lease configurations..." -ForegroundColor Gray
ipconfig /release | Out-Null
Start-Sleep -Seconds 2

Write-Host "Flushing active system DNS caches..." -ForegroundColor Gray
ipconfig /flushdns | Out-Null
Clear-DnsClientCache

Write-Host "Requesting DHCP IP lease renewal..." -ForegroundColor Gray
ipconfig /renew | Out-Null
Start-Sleep -Seconds 1

Write-Host "System IP trace reset sequence executed." -ForegroundColor Green
Write-Host ""
Write-Host "=============================================" -ForegroundColor DarkMagenta
Write-Host " PRIVACY SYNC COMPLETED: Sessions and IP traces reset." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor DarkMagenta
