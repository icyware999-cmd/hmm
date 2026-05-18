# avoidkxrried - Temp & Network Cache Cleaner
# Clear Windows user temporary files, system directories, and flush DNS resolver state

$ErrorActionPreference = "SilentlyContinue"
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "     AVOIDKXRRIED - TEMP-FILE OPTIMIZER      " -ForegroundColor DarkCyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$freedBytes = 0

function Clean-Directory ($path) {
    if (Test-Path $path) {
        Write-Host "Scanning path: $path" -ForegroundColor Gray
        $items = Get-ChildItem -Path $path -Recurse -Force
        foreach ($item in $items) {
            try {
                if ($item.PSIsContainer) {
                    # Skip directory object itself, files inside will be deleted
                    continue
                }
                $size = $item.Length
                Remove-Item $item.FullName -Force -Confirm:$false
                if (!(Test-Path $item.FullName)) {
                    $global:freedBytes += $size
                }
            } catch {
                # Lock/in-use file bypassed silently
            }
        }
        # Attempt to clean empty directories
        Get-ChildItem -Path $path -Recurse -Force | Where-Object { $_.PSIsContainer -and (Get-ChildItem -Path $_.FullName -Force).Count -eq 0 } | Remove-Item -Recurse -Force
    }
}

# 1. Clear User Temp Directory
Write-Host "[1/4] Cleaning User Temporary Directory..." -ForegroundColor Yellow
Clean-Directory "$env:TEMP\*"

# 2. Clear System Temp Directory
Write-Host "[2/4] Cleaning System Temp Directory..." -ForegroundColor Yellow
Clean-Directory "C:\Windows\Temp\*"

# 3. Clear Prefetch Directory (requires elevated privileges, fails safely if user lacks permission)
Write-Host "[3/4] Cleaning Prefetch Directory..." -ForegroundColor Yellow
Clean-Directory "C:\Windows\Prefetch\*"

# 4. Flush Resolver DNS cache
Write-Host "[4/4] Flushing DNS Resolver Cache..." -ForegroundColor Yellow
Clear-DnsClientCache
ipconfig /flushdns | Out-Null
Write-Host "DNS Resolver Cache flushed successfully." -ForegroundColor Green

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
$freedMB = [Math]::Round($freedBytes / 1MB, 2)
Write-Host " CLEANUP COMPLETED: Wiped $freedMB MB of cached files." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
