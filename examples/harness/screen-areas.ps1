# The work area of every display, in device pixels of the virtual screen, as
# one line of JSON on stdout: [{ "x", "y", "width", "height" }]. A test uses
# them to look for a place on the screen that nothing covers.
#
#   powershell -NoProfile -File screen-areas.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class AreasDpi {
  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();
}
'@
[void][AreasDpi]::SetProcessDPIAware()

$areas = foreach ($screen in [Windows.Forms.Screen]::AllScreens) {
  $area = $screen.WorkingArea
  [pscustomobject]@{ x = $area.X; y = $area.Y; width = $area.Width; height = $area.Height }
}
ConvertTo-Json -Compress -InputObject @($areas)
