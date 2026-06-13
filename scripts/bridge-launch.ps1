# Yielde Bridge launcher - zero-LLM, called by operator cron runtime
$ErrorActionPreference = "Stop"

$uri = "http://localhost:3030"

# Check if something is listening on 3030
$listening = netstat -ano | Select-String "0\.0\.0\.0:3030\s.*LISTENING|\[::\]:3030\s.*LISTENING"

if ($listening) {
    # Test if it actually responds
    $responds = $false
    try {
        Invoke-WebRequest -Uri $uri -TimeoutSec 4 -UseBasicParsing | Out-Null
        $responds = $true
    } catch {}

    if ($responds) {
        Write-Output "Bridge already running - $uri"
        cmd /c start $uri
        exit 0
    } else {
        # Hung process - kill it
        $pidStr = (netstat -ano | Select-String ":3030\s.*LISTENING" | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1)
        if ($pidStr) {
            Stop-Process -Id ([int]$pidStr) -Force
            Start-Sleep -Seconds 1
            Write-Output "Killed hung process $pidStr on :3030, restarting..."
        }
        $listening = $null
    }
}

if (-not $listening) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Users\chris\yielde-bridge; npm run dev" -WindowStyle Normal
    Write-Output "Bridge starting - waiting for ready..."
    $ready = $false
    for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Seconds 3
        try {
            Invoke-WebRequest -Uri $uri -TimeoutSec 3 -UseBasicParsing | Out-Null
            $ready = $true
            break
        } catch {}
    }
    if ($ready) {
        Write-Output "Bridge ready - $uri"
    } else {
        Write-Output "Bridge slow to start - check the dev server window"
        exit 1
    }
}

cmd /c start $uri
