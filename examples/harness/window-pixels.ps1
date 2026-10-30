# The colors of points of an example's window, read from what Windows draws of
# it (PrintWindow, never the screen): the window is found by the pid we started,
# and nothing is sent to it. The points are in device-independent pixels from the
# top left of the content, which is found as the first pixel of a color the
# example draws there; the result is one line of JSON on stdout, one RRGGBB each.
#
#   powershell -NoProfile -File window-pixels.ps1 -ProcessId <pid> `
#     -Scale <rasterization scale> -Origin <RRGGBB> -Points "x,y;x,y"
param(
  [Parameter(Mandatory)][int]$ProcessId,
  [Parameter(Mandatory)][double]$Scale,
  [Parameter(Mandatory)][string]$Origin,
  [Parameter(Mandatory)][string]$Points
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\window-tools.ps1"

function Format-Color([System.Drawing.Color]$Color) {
  '{0:X2}{1:X2}{2:X2}' -f $Color.R, $Color.G, $Color.B
}

$hwnd = [ExampleWin]::Find([uint32]$ProcessId)
if ($hwnd -eq [IntPtr]::Zero) { throw 'no window' }
$bitmap = [ExampleWin]::Capture($hwnd)
try {
  # The content starts where the example's background color first shows,
  # looking down and across the middle of the capture.
  $x0 = 0
  $y0 = 0
  while ($x0 -lt $bitmap.Width -and (Format-Color $bitmap.GetPixel($x0, [int]($bitmap.Height / 2))) -ne $Origin) { $x0++ }
  while ($y0 -lt $bitmap.Height -and (Format-Color $bitmap.GetPixel([int]($bitmap.Width / 4), $y0)) -ne $Origin) { $y0++ }
  $colors = foreach ($point in $Points.Split(';')) {
    $x, $y = $point.Split(',')
    Format-Color $bitmap.GetPixel($x0 + [int]([double]$x * $Scale), $y0 + [int]([double]$y * $Scale))
  }
  ConvertTo-Json -Compress -InputObject @($colors)
} finally {
  $bitmap.Dispose()
}
