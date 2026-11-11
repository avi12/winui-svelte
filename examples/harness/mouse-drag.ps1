# Presses the left mouse button at a point of the virtual screen, moves it
# along a short line and releases it, with SendInput (the system's real input:
# the cursor moves, and returns to where it was). Points are device pixels.
#
#   powershell -NoProfile -File mouse-drag.ps1 -X 100 -Y 200
param(
  [Parameter(Mandatory)][int]$X,
  [Parameter(Mandatory)][int]$Y
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MouseDrag {
  const uint MOVE = 0x0001, LEFT_DOWN = 0x0002, LEFT_UP = 0x0004;
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X; public int Y; }

  public static void Drag(int x, int y) {
    SetProcessDPIAware();
    POINT origin;
    GetCursorPos(out origin);
    SetCursorPos(x, y);
    System.Threading.Thread.Sleep(150);
    mouse_event(LEFT_DOWN, 0, 0, 0, UIntPtr.Zero);
    for (int i = 1; i <= 20; i++) {
      mouse_event(MOVE, 3, 2, 0, UIntPtr.Zero);
      System.Threading.Thread.Sleep(15);
    }
    mouse_event(LEFT_UP, 0, 0, 0, UIntPtr.Zero);
    System.Threading.Thread.Sleep(150);
    SetCursorPos(origin.X, origin.Y);
  }
}
'@
[MouseDrag]::Drag($X, $Y)
