Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI2 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT2 lpRect);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool repaint);
}
[StructLayout(LayoutKind.Sequential)]
public struct RECT2 { public int Left; public int Top; public int Right; public int Bottom; }
"@

$outDir = "c:\Users\flore\OneDrive\Desktop\System\abe system\Scoreboard App\Scoreboard App\scripts\screenshots"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Take-Screenshot($handle, $filename) {
    [WinAPI2]::ShowWindow($handle, 9) | Out-Null
    [WinAPI2]::SetForegroundWindow($handle) | Out-Null
    Start-Sleep -Milliseconds 800

    $rect = New-Object RECT2
    [WinAPI2]::GetWindowRect($handle, [ref]$rect) | Out-Null
    $w = $rect.Right - $rect.Left
    $h = $rect.Bottom - $rect.Top

    if ($w -lt 10 -or $h -lt 10) {
        Write-Host "Skipped $filename - window too small (${w}x${h})"
        return
    }

    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, [System.Drawing.Size]::new($w, $h))
    $bmp.Save("$outDir\$filename")
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Saved: $filename (${w}x${h})"
}

# Find the main window
$procs = Get-Process "Basketball Scoreboard" -ErrorAction SilentlyContinue
$mainProc = $procs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1

if (-not $mainProc) {
    Write-Host "No app window found!"
    exit 1
}

$hwnd = $mainProc.MainWindowHandle
Write-Host "Found window: $($mainProc.MainWindowTitle) (Handle: $hwnd)"

# Maximize for clean screenshots
[WinAPI2]::ShowWindow($hwnd, 3) | Out-Null  # SW_MAXIMIZE
Start-Sleep -Milliseconds 1200

# Screenshot 1: Current screen (should be login or sport selector)
Take-Screenshot $hwnd "01_launch.png"

Write-Host "Done! Screenshots saved to: $outDir"
