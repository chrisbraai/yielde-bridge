$host.UI.RawUI.WindowTitle = "Yielde Bridge"
Set-Location "C:\Users\chris\yielde-bridge"

Write-Host "Starting Yielde Bridge on http://localhost:3030..." -ForegroundColor Cyan

Start-Job -ScriptBlock {
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:3030"
} | Out-Null

npm run dev
