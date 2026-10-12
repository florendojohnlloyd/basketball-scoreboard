# Generates a valid multi-size Windows .ico from a source PNG.
# Uses embedded-PNG ICO entries (supported by Windows Vista+ / Electron).
param(
  [string]$Source = "pictures\white.png",
  [string]$Out = "assets\icon.ico"
)

Add-Type -AssemblyName System.Drawing

$srcPath = (Resolve-Path $Source).Path
$src = [System.Drawing.Image]::FromFile($srcPath)

$sizes = @(16, 32, 48, 64, 128, 256)
$pngBlobs = New-Object System.Collections.ArrayList

foreach ($s in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $ratio = [Math]::Min($s / $src.Width, $s / $src.Height)
  $w = [int]($src.Width * $ratio)
  $h = [int]($src.Height * $ratio)
  $x = [int](($s - $w) / 2)
  $y = [int](($s - $h) / 2)
  $g.DrawImage($src, $x, $y, $w, $h)
  $g.Dispose()

  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  [void]$pngBlobs.Add($ms.ToArray())
  $bmp.Dispose()
  $ms.Dispose()
}
$src.Dispose()

# Build ICO container as a byte list
$bytes = New-Object System.Collections.Generic.List[byte]

function Add-U16([int]$v) {
  $script:bytes.Add([byte]($v -band 0xFF))
  $script:bytes.Add([byte](($v -shr 8) -band 0xFF))
}
function Add-U32([long]$v) {
  $script:bytes.Add([byte]($v -band 0xFF))
  $script:bytes.Add([byte](($v -shr 8) -band 0xFF))
  $script:bytes.Add([byte](($v -shr 16) -band 0xFF))
  $script:bytes.Add([byte](($v -shr 24) -band 0xFF))
}

# ICONDIR header
Add-U16 0            # reserved
Add-U16 1            # type: icon
Add-U16 $sizes.Count

# Directory entries; image data starts after 6 + 16*count
$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]
  $blob = $pngBlobs[$i]
  $dim = if ($s -ge 256) { 0 } else { $s }
  $bytes.Add([byte]$dim)   # width
  $bytes.Add([byte]$dim)   # height
  $bytes.Add([byte]0)      # palette
  $bytes.Add([byte]0)      # reserved
  Add-U16 1                # planes
  Add-U16 32               # bpp
  Add-U32 $blob.Length     # data size
  Add-U32 $offset          # data offset
  $offset += $blob.Length
}
# Image data
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $bytes.AddRange([byte[]]$pngBlobs[$i])
}

$outPath = Join-Path (Get-Location) $Out
[System.IO.File]::WriteAllBytes($outPath, $bytes.ToArray())
Write-Output ("Wrote " + $bytes.Count + " bytes to " + $Out)
