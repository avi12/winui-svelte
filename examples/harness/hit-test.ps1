# Which process owns the top-level window that a click at each point of the
# screen would reach, as Windows hit-tests it (WindowFromPoint, then the root
# of that window): the question is asked of the system, no click is sent and
# no window is touched. Points are device pixels of the virtual screen. The
# result is one line of JSON on stdout: one { "pid", "className" } per point.
#
#   powershell -NoProfile -File hit-test.ps1 -Points "x,y;x,y"
param(
  [Parameter(Mandatory)][string]$Points
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class HitTest {
  const uint GA_ROOT = 2;

  [StructLayout(LayoutKind.Sequential)]
  struct POINT { public int X; public int Y; }

  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetClassNameW(IntPtr window, StringBuilder name, int capacity);

  public static string At(int x, int y) {
    SetProcessDPIAware();
    var hit = WindowFromPoint(new POINT { X = x, Y = y });
    var root = hit == IntPtr.Zero ? IntPtr.Zero : GetAncestor(hit, GA_ROOT);
    uint pid;
    GetWindowThreadProcessId(root, out pid);
    var name = new StringBuilder(256);
    GetClassNameW(root, name, name.Capacity);
    return pid + "|" + name;
  }
}
'@
$answers = foreach ($point in $Points.Split(';')) {
  $px, $py = $point.Split(',')
  $owner, $class = [HitTest]::At([int]$px, [int]$py).Split('|')
  [pscustomobject]@{ pid = [int]$owner; className = $class }
}
ConvertTo-Json -Compress -InputObject @($answers)
