# Runs the scheduling experiment in a background window (off screen, never
# activated), clicks its button through UI Automation on that window only
# (found by the pid started here), saves a PrintWindow capture and prints the
# log. Ends only the process it started.
param(
  [string]$Out = "$env:TEMP\scheduling.png",
  [string]$Log = "$env:TEMP\scheduling.log")
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing
. "$PSScriptRoot\..\harness\window-tools.ps1"
Remove-Item $Log -ErrorAction SilentlyContinue
$env:SCHEDULING_LOG = $Log
$node = Start-Process node -WorkingDirectory $packageRoot -WindowStyle Hidden `
  -PassThru -ArgumentList @(
    '--disable-warning=ExperimentalWarning', '--enable-source-maps',
    'examples/scheduling/launch.ts')
try {
  $hwnd = [IntPtr]::Zero
  for ($i = 0; $i -lt 40 -and $hwnd -eq [IntPtr]::Zero; $i++) {
    Start-Sleep -Milliseconds 500
    $hwnd = [ExampleWin]::Find([uint32]$node.Id)
  }
  if ($hwnd -eq [IntPtr]::Zero) { throw 'no window' }
  [ExampleWin]::Hide($hwnd)
  $element = [System.Windows.Automation.AutomationElement]
  $root = $element::FromHandle($hwnd)
  $condition = New-Object System.Windows.Automation.PropertyCondition `
    ($element::NameProperty), 'Click via UIA'
  $button = $root.FindFirst(
    [System.Windows.Automation.TreeScope]::Descendants, $condition)
  # The timer (1 s) and the host message (2.5 s) have fired after this.
  Start-Sleep -Seconds 4
  for ($i = 0; $i -lt 3; $i++) {
    $button.GetCurrentPattern(
      [System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Start-Sleep -Milliseconds 900
  }
  [ExampleWin]::Save($hwnd, $Out)
  $lines = Get-Content $Log
  $lines
  # Svelte's own microtask applied every change: after each trigger the text
  # read in queueMicrotask differs from the one read synchronously.
  $failed = $false
  foreach ($trigger in 'timer', 'host message', 'click') {
    $before = ($lines | Where-Object { $_ -match "$trigger`: sync" } |
      Select-Object -First 1) -replace '.*count=', ''
    $after = ($lines | Where-Object { $_ -match "$trigger`: queueMicrotask" } |
      Select-Object -First 1) -replace '.*count=', ''
    if ($before -eq $after) {
      Write-Output "FAIL $trigger not applied by the microtask"
      $failed = $true
    }
  }
  if ($failed) { exit 1 }
  Write-Output ('OK: Svelte applies state changes in WinUI callbacks with ' +
    'no flushSync')
} finally {
  Stop-Process -Id $node.Id -Force -ErrorAction SilentlyContinue
}
