# The colors of points of an example's window, read from what Windows draws of
# it (PrintWindow, never the screen): the window is found by the pid we
# started, and nothing is sent to it. Unlike window-pixels.ps1 it needs no
# background color to find the content by: the points are in device pixels from
# the window's own top-left corner, so a transparent window can be read (it is
# drawn over black: PrintWindow has no alpha). The result is one line of JSON on
# stdout, one RRGGBB per point; -Save also writes the capture as a PNG.
#
#   powershell -NoProfile -File window-capture.ps1 -ProcessId <pid> `
#     -Points "x,y;x,y" [-Save <path>]
param(
  [Parameter(Mandatory)][int]$ProcessId,
  [Parameter(Mandatory)][string]$Points,
  [string]$Save = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\window-tools.ps1"

$hwnd = [ExampleWin]::Find([uint32]$ProcessId)
if ($hwnd -eq [IntPtr]::Zero) { throw 'no window' }
$bitmap = [ExampleWin]::Capture($hwnd)
try {
  if ($Save -ne '') { $bitmap.Save($Save, [System.Drawing.Imaging.ImageFormat]::Png) }
  $colors = foreach ($point in $Points.Split(';')) {
    $x, $y = $point.Split(',')
    $pixel = $bitmap.GetPixel([int]$x, [int]$y)
    '{0:X2}{1:X2}{2:X2}' -f $pixel.R, $pixel.G, $pixel.B
  }
  ConvertTo-Json -Compress -InputObject @($colors)
} finally {
  $bitmap.Dispose()
}
