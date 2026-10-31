# Posts window messages to the content of an example's window, the way the
# message queue receives them from the keyboard: the window is found by the pid
# we started (never by its title), and only that process's own windows are
# written to. Nothing is sent to the system's input (no SendInput, no
# keybd_event, no SetCursorPos), so the foreground and the desktop of whoever
# runs it stay untouched. The result is one line of JSON on stdout.
#
#   powershell -NoProfile -File post-messages.ps1 -ProcessId <pid> `
#     -Steps 'key:Tab;type:ab;hold:Ctrl;key:S;release:Ctrl'
#
# Steps, separated by ';':
#   key:<Name>      a key down and up (Tab, Enter, Escape, Back, Delete, Left,
#                   Right, Up, Down, Home, End, Space, A-Z, 0-9)
#   syskey:<Name>   the same as WM_SYSKEYDOWN / WM_SYSKEYUP (an Alt chord)
#   down:<Name>     a key down only; up:<Name> a key up only
#   type:<text>     WM_CHAR for every UTF-16 unit of the text
#   hold:<Name>     Ctrl, Shift or Alt: sets that key's state in the input
#                   state the window's thread reads (GetKeyState), which
#                   posted messages do not update; release:<Name> clears it
#   raw:<message>,<wParam>,<lParam>   any message, numbers in decimal or 0x
#   sleep:<ms>      waits
#   list            writes the window tree (class names) into the result
param(
  [Parameter(Mandatory)][int]$ProcessId,
  [Parameter(Mandatory)][string]$Steps,
  [string]$TargetClass = 'InputSite'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class PostTarget {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h, EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetClassName(IntPtr h, StringBuilder name, int count);
  [DllImport("user32.dll", EntryPoint = "PostMessageW")]
  static extern bool Post(IntPtr h, uint m, UIntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("user32.dll")] static extern bool GetKeyboardState(byte[] state);
  [DllImport("user32.dll")] static extern bool SetKeyboardState(byte[] state);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern uint MapVirtualKeyW(uint code, uint type);

  public static uint ThreadOf(IntPtr h) { uint pid; return GetWindowThreadProcessId(h, out pid); }
  static string ClassOf(IntPtr h) {
    var b = new StringBuilder(256); GetClassName(h, b, 256); return b.ToString();
  }
  public static IntPtr Top(uint owner) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == owner && IsWindowVisible(h) && ClassOf(h).StartsWith("WinUIDesktop")) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static List<string> Tree(IntPtr top) {
    var all = new List<string>();
    all.Add(top.ToInt64() + " " + ClassOf(top));
    EnumChildWindows(top, (h, l) => { all.Add(h.ToInt64() + " " + ClassOf(h)); return true; }, IntPtr.Zero);
    return all;
  }
  public static IntPtr Child(IntPtr top, string classPart) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(top, (h, l) => {
      if (ClassOf(h).Contains(classPart)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static bool PostTo(IntPtr h, uint m, long w, long l) {
    return Post(h, m, new UIntPtr(unchecked((ulong)w)), new IntPtr(l));
  }
  public static uint ScanOf(uint vk) { return MapVirtualKeyW(vk, 0); }
  static bool attached;
  static uint attachedTo;
  static readonly HashSet<uint> held = new HashSet<uint>();
  static void Attach(uint windowThread) {
    if (attached) { return; }
    attached = AttachThreadInput(GetCurrentThreadId(), windowThread, true);
    attachedTo = windowThread;
  }
  static readonly uint[] modifierKeys = { 0x10, 0x11, 0x12, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5 };
  // Every script starts and ends with no modifier down in the window thread's
  // key state, whatever an earlier script left there.
  public static void Begin(uint windowThread) { Attach(windowThread); Apply(); }
  public static void Hold(uint vk) { held.Add(vk); Apply(); }
  public static void Release(uint vk) { held.Remove(vk); Apply(); }
  // The thread's key state is refreshed from the real keyboard whenever focus
  // changes, so the held keys are set again all the time they matter.
  public static void Apply() {
    var state = new byte[256];
    GetKeyboardState(state);
    foreach (var vk in modifierKeys) { state[vk] = 0; }
    foreach (var vk in held) {
      state[vk] = 0x80;
      if (vk == 0x10) { state[0xA0] = 0x80; }
      if (vk == 0x11) { state[0xA2] = 0x80; }
      if (vk == 0x12) { state[0xA4] = 0x80; }
    }
    SetKeyboardState(state);
  }
  public static void Detach() {
    held.Clear();
    if (attached) { Apply(); System.Threading.Thread.Sleep(100); Apply(); }
    if (attached) { AttachThreadInput(GetCurrentThreadId(), attachedTo, false); attached = false; }
  }
}
'@

$messages = @{
  WM_KEYDOWN = 0x100; WM_KEYUP = 0x101; WM_CHAR = 0x102
  WM_SYSKEYDOWN = 0x104; WM_SYSKEYUP = 0x105; WM_SYSCHAR = 0x106
  WM_IME_STARTCOMPOSITION = 0x10D; WM_IME_ENDCOMPOSITION = 0x10E
  WM_IME_COMPOSITION = 0x10F; WM_IME_CHAR = 0x286
}
$keys = @{
  Tab = 0x09; Enter = 0x0D; Escape = 0x1B; Back = 0x08; Delete = 0x2E
  Left = 0x25; Up = 0x26; Right = 0x27; Down = 0x28; Home = 0x24; End = 0x23
  Space = 0x20; Shift = 0x10; Ctrl = 0x11; Alt = 0x12
}
$extended = @(0x25, 0x26, 0x27, 0x28, 0x24, 0x23, 0x2E)
$modifiers = @{ Shift = 0x10; Ctrl = 0x11; Alt = 0x12 }

$top = [PostTarget]::Top([uint32]$ProcessId)
if ($top -eq [IntPtr]::Zero) { throw 'the example has no window' }
$thread = [PostTarget]::ThreadOf($top)
$target = [PostTarget]::Child($top, $TargetClass)
if ($target -eq [IntPtr]::Zero) { $target = $top }
$listed = $null
[PostTarget]::Begin($thread)

function Wait-Held([int]$Milliseconds) {
  $end = [DateTime]::UtcNow.AddMilliseconds($Milliseconds)
  while ([DateTime]::UtcNow -lt $end) {
    [PostTarget]::Apply()
    Start-Sleep -Milliseconds 2
  }
}

function Get-KeyCode([string]$Name) {
  if ($keys.ContainsKey($Name)) { return [int]$keys[$Name] }
  if ($Name.Length -eq 1) { return [int][char]$Name.ToUpper() }
  throw "unknown key '$Name'"
}

function Get-KeyParameter([int]$Code, [bool]$IsUp, [bool]$IsSystem) {
  $scan = [PostTarget]::ScanOf([uint32]$Code)
  $value = 1 -bor ($scan -shl 16)
  if ($extended -contains $Code) { $value = $value -bor 0x1000000 }
  if ($IsSystem) { $value = $value -bor 0x20000000 }
  if ($IsUp) { $value = $value -bor 0xC0000000 }
  [long]$value
}

function Send-Key([int]$Code, [bool]$IsUp, [bool]$IsSystem) {
  $message = if ($IsSystem) { if ($IsUp) { 0x105 } else { 0x104 } } else { if ($IsUp) { 0x101 } else { 0x100 } }
  [PostTarget]::PostTo($target, [uint32]$message, $Code, (Get-KeyParameter $Code $IsUp $IsSystem)) | Out-Null
}

foreach ($step in $Steps.Split(';')) {
  $name, $argument = $step.Split(':', 2)
  switch ($name) {
    'key' { $c = Get-KeyCode $argument; Send-Key $c $false $false; Send-Key $c $true $false }
    'syskey' { $c = Get-KeyCode $argument; Send-Key $c $false $true; Send-Key $c $true $true }
    'down' { Send-Key (Get-KeyCode $argument) $false $false }
    'up' { Send-Key (Get-KeyCode $argument) $true $false }
    'type' {
      foreach ($unit in $argument.ToCharArray()) {
        [PostTarget]::PostTo($target, 0x102, [int]$unit, 1) | Out-Null
      }
    }
    'hold' { [PostTarget]::Hold([uint32]$modifiers[$argument]) }
    'release' { Wait-Held 300; [PostTarget]::Release([uint32]$modifiers[$argument]) }
    'raw' {
      $m, $w, $l = $argument.Split(',')
      $id = if ($messages.ContainsKey($m)) { [long]$messages[$m] } else { [long]$m }
      [PostTarget]::PostTo($target, [uint32]$id, [long]$w, [long]$l) | Out-Null
    }
    'sleep' { Wait-Held ([int]$argument) }
    'list' { $listed = [PostTarget]::Tree($top) }
    default { throw "unknown step '$name'" }
  }
}

[PostTarget]::Detach()
[ordered]@{ target = $target.ToInt64(); tree = $listed } | ConvertTo-Json -Compress
