# Runs the hello example in a background window (off screen, never activated),
# flips its ToggleSwitch through UI Automation on that window only (found by
# the pid started here), reads the texts back, saves a PrintWindow capture and
# checks them. Ends only the process it started.
#
#   pwsh run.ps1 [-Out hello.png] [-Edit]
#
# -Edit also rewrites app.svelte while the window runs, to check that the open
# window follows the saved file (hot reload), and puts the file back.
param([string]$Out = "$env:TEMP\hello.png", [switch]$Edit)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing
. "$PSScriptRoot\..\harness\window-tools.ps1"
$source = Join-Path $PSScriptRoot 'App.svelte'
$original = [IO.File]::ReadAllText($source)
$env:WINUI_SVELTE_BACKGROUND = '1'
$log = Join-Path $env:TEMP 'winui-svelte-hello.log'
$node = Start-Process node -WorkingDirectory $packageRoot -WindowStyle Hidden `
  -PassThru -RedirectStandardError $log -ArgumentList @(
    '--disable-warning=ExperimentalWarning', '--enable-source-maps',
    'examples/hello/main.ts')
$automation = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]::Descendants
function Texts($root) {
  $condition = New-Object System.Windows.Automation.PropertyCondition `
    ($automation::ControlTypeProperty),
    ([System.Windows.Automation.ControlType]::Text)
  ($root.FindAll($scope, $condition) | ForEach-Object { $_.Current.Name }) `
    -join ' | '
}
function Toggle($root) {
  $condition = New-Object System.Windows.Automation.PropertyCondition `
    ($automation::ClassNameProperty), 'ToggleSwitch'
  $root.FindFirst($scope, $condition).GetCurrentPattern(
    [System.Windows.Automation.TogglePattern]::Pattern).Toggle()
  Start-Sleep -Milliseconds 500
}
try {
  $hwnd = [IntPtr]::Zero
  for ($i = 0; $i -lt 60 -and $hwnd -eq [IntPtr]::Zero; $i++) {
    Start-Sleep -Milliseconds 500
    $hwnd = [ExampleWin]::Find([uint32]$node.Id)
  }
  if ($hwnd -eq [IntPtr]::Zero) { throw 'no window' }
  [ExampleWin]::Hide($hwnd)
  $root = $automation::FromHandle($hwnd)
  Start-Sleep -Seconds 1
  $steps = [ordered]@{}
  $steps['start'] = Texts $root
  Toggle $root
  $steps['after a toggle'] = Texts $root
  [ExampleWin]::Save($hwnd, $Out)
  if ($Edit) {
    [IO.File]::WriteAllText(
      $source, $original.Replace('Hello from WinUI', 'Hot reloaded'))
    Start-Sleep -Seconds 3
    $steps['after a saved edit'] = Texts $root
  }
  $steps.GetEnumerator() | ForEach-Object {
    "{0,-20} {1}" -f $_.Key, $_.Value
  }
  $expected = [ordered]@{
    'start' = 'The lights are on'
    'after a toggle' = 'The lights are off'
  }
  if ($Edit) { $expected['after a saved edit'] = 'Hot reloaded' }
  $failed = $false
  foreach ($key in $expected.Keys) {
    if (-not $steps[$key].Contains($expected[$key])) {
      "FAIL $key : expected '$($expected[$key])'"
      $failed = $true
    }
  }
  if ($failed) {
    "--- the window's stderr ($log)"
    Get-Content $log
    exit 1
  }
  'OK: the controls render, the binding flows back, and the window follows ' +
    'the file'
} finally {
  [IO.File]::WriteAllText($source, $original)
  Stop-Process -Id $node.Id -Force -ErrorAction SilentlyContinue
}
