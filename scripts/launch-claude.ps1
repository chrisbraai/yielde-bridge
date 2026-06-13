# launch-claude.ps1
# Opens N Claude Code instances with --dangerously-skip-permissions in small windows.
# Usage: .\launch-claude.ps1 [count]
# Example: .\launch-claude.ps1 3

param(
    [Parameter(Position = 0)]
    [int]$Count = 1
)

$winW   = 850  # window width (pixels)
$winH   = 480  # window height (pixels)
$startX = 60   # first window X offset from screen edge
$startY = 60   # first window Y offset from screen edge
$stepX  = 36   # horizontal cascade step per window
$stepY  = 36   # vertical cascade step per window
$cwd    = (Get-Location).Path

for ($i = 0; $i -lt $Count; $i++) {
    $x = $startX + ($i * $stepX)
    $y = $startY + ($i * $stepY)

    # Write inner script to a temp file to avoid quoting issues
    $tmpScript = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', '.ps1'

    $scriptLines = @(
        'Add-Type -TypeDefinition @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        'public class WinPos {',
        '    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r);',
        '    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();',
        '}',
        '"@',
        'Start-Sleep -Milliseconds 500',
        "[WinPos]::MoveWindow([WinPos]::GetConsoleWindow(), $x, $y, $winW, $winH, `$true) | Out-Null",
        "`$host.UI.RawUI.WindowTitle = 'Claude $($i + 1)'",
        'claude --dangerously-skip-permissions',
        "Remove-Item -LiteralPath '$tmpScript' -ErrorAction SilentlyContinue"
    )

    $scriptLines | Out-File -FilePath $tmpScript -Encoding UTF8

    Start-Process powershell -ArgumentList "-NoExit", "-File", $tmpScript -WorkingDirectory $cwd
    Start-Sleep -Milliseconds 200
}

Write-Host "Launched $Count Claude Code instance(s)." -ForegroundColor Green
