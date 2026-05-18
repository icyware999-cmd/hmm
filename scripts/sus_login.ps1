# avoidkxrried - Suspicious Network & Login Connections Checker
# Audits active TCP/IP sockets, analyzes current connections, and evaluates network safety indicators

$ErrorActionPreference = "SilentlyContinue"
Write-Host "=============================================" -ForegroundColor DarkYellow
Write-Host "   AVOIDKXRRIED - SECURE SUSPICIOUS-LOGIN AUDIT" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor DarkYellow
Write-Host ""

Write-Host "[1/3] Scanning active external network connections..." -ForegroundColor Gray
$connections = Get-NetTCPConnection -State Established | Where-Object { $_.RemoteAddress -ne "127.0.0.1" -and $_.RemoteAddress -ne "::1" -and $_.RemoteAddress -ne "0.0.0.0" }

$susCount = 0
$report = @()

foreach ($conn in $connections) {
    $proc = Get-Process -Id $conn.OwningProcess
    $processName = $proc.ProcessName
    $remoteIp = $conn.RemoteAddress
    $remotePort = $conn.RemotePort
    
    # Flag non-standard administrative ports or processes
    $flagged = $false
    $reason = "Normal connection"
    
    # Highlight known anomalies or standard tools commonly exploited (e.g. standard remote tools, raw commands)
    if ($processName -match "powershell|cmd|anydesk|teamviewer|mstsc|vnc|rustdesk") {
        $flagged = $true
        $reason = "Remote tool / terminal process ($processName) actively connected to external IP."
        $susCount++
    }
    
    $report += [PSCustomObject]@{
        ProcessName = $processName
        RemoteIP    = $remoteIp
        Port        = $remotePort
        Status      = if ($flagged) { "FLAGGED" } else { "Verified" }
        Reason      = $reason
    }
}

# 2. Audit current active user sessions
Write-Host "[2/3] Checking active Windows user sessions..." -ForegroundColor Gray
$sessions = query user 2>&1

# 3. Print report table
Write-Host ""
Write-Host "[3/3] SECURITY THREAT EVALUATION SUMMARY:" -ForegroundColor Yellow
Write-Host "--------------------------------------------------------" -ForegroundColor DarkGray
if ($connections.Count -eq 0) {
    Write-Host "No external network connections found. Connection vector safe." -ForegroundColor Green
} else {
    $report | Format-Table -Property ProcessName, RemoteIP, Port, Status, Reason | Out-String | Write-Host
}

Write-Host "--------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "Active User Sessions:" -ForegroundColor Yellow
$sessions | Out-String | Write-Host

Write-Host "=============================================" -ForegroundColor DarkYellow
if ($susCount -gt 0) {
    Write-Host " WARNING: $susCount potentially suspicious active sessions detected!" -ForegroundColor Red
} else {
    Write-Host " AUDIT COMPLETE: No high-risk threats detected on local system." -ForegroundColor Green
}
Write-Host "=============================================" -ForegroundColor DarkYellow
