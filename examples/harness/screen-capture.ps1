# The colors of points of the screen, as Windows composes it (CopyFromScreen:
# every window above the point counts, and a window with per-pixel alpha is
# blended over what is behind it, which PrintWindow cannot show). It reads
# pixels and sends nothing to any window. The rectangle and the points are in
# device pixels; the points are from the rectangle's top left. The result is
# one line of JSON on stdout, one RRGGBB per point; -Save also writes the
# rectangle as a PNG.
#
#   powershell -NoProfile -File screen-capture.ps1 -X <px> -Y <px> `
#     -Width <px> -Height <px> -Points "x,y;x,y" [-Save <path>]
param(
  [Parameter(Mandatory)][int]$X,
  [Parameter(Mandatory)][int]$Y,
  [Parameter(Mandatory)][int]$Width,
  [Parameter(Mandatory)][int]$Height,
  [Parameter(Mandatory)][string]$Points,
  [string]$Save = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class ScreenDpi {
  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();
}
'@
[void][ScreenDpi]::SetProcessDPIAware()

$bitmap = New-Object Drawing.Bitmap $Width, $Height
try {
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($X, $Y, 0, 0, $bitmap.Size)
  } finally {
    $graphics.Dispose()
  }
  if ($Save -ne '') { $bitmap.Save($Save, [Drawing.Imaging.ImageFormat]::Png) }
  $colors = foreach ($point in $Points.Split(';')) {
    $px, $py = $point.Split(',')
    $pixel = $bitmap.GetPixel([int]$px, [int]$py)
    '{0:X2}{1:X2}{2:X2}' -f $pixel.R, $pixel.G, $pixel.B
  }
  ConvertTo-Json -Compress -InputObject @($colors)
} finally {
  $bitmap.Dispose()
}
