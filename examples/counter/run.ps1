# Runs the counter example in a background window (off screen, never
# activated), clicks its buttons through UI Automation on that window only
# (found by the pid started here), reads the texts back through UI Automation,
# saves a PrintWindow capture and checks them. Ends only the process it started.
param([string]$Out = "$env:TEMP\counter.png")
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing
. "$PSScriptRoot\..\harness\window-tools.ps1"
$node = Start-Process node -WorkingDirectory $packageRoot -WindowStyle Hidden `
  -PassThru -ArgumentList @(
    '--disable-warning=ExperimentalWarning', '--enable-source-maps',
    'examples/counter/launch.ts')
$automation = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]::Descendants
function Texts($root) {
  $condition = New-Object System.Windows.Automation.PropertyCondition `
    ($automation::ControlTypeProperty),
    ([System.Windows.Automation.ControlType]::Text)
  ($root.FindAll($scope, $condition) | ForEach-Object { $_.Current.Name }) `
    -join ' | '
}
function Press($root, $name) {
  $condition = New-Object System.Windows.Automation.PropertyCondition `
    ($automation::NameProperty), $name
  $root.FindFirst($scope, $condition).GetCurrentPattern(
    [System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  Start-Sleep -Milliseconds 400
}
try {
  $hwnd = [IntPtr]::Zero
  for ($i = 0; $i -lt 40 -and $hwnd -eq [IntPtr]::Zero; $i++) {
    Start-Sleep -Milliseconds 500
    $hwnd = [ExampleWin]::Find([uint32]$node.Id)
  }
  if ($hwnd -eq [IntPtr]::Zero) { throw 'no window' }
  [ExampleWin]::Hide($hwnd)
  $root = $automation::FromHandle($hwnd)
  Start-Sleep -Seconds 1
  $steps = [ordered]@{}
  $steps['start'] = Texts $root
  Press $root 'Host +1'; Press $root 'Host +1'
  $steps['after two host clicks'] = Texts $root
  Press $root 'Local +1'
  $steps['after a local click'] = Texts $root
  Press $root 'Host fails'
  $steps['after a refused action'] = Texts $root
  $steps.GetEnumerator() | ForEach-Object {
    "{0,-24} {1}" -f $_.Key, $_.Value
  }
  [ExampleWin]::Save($hwnd, $Out)
  $expected = @{
    'start' = 'host count: 0'
    'after two host clicks' = 'host count: 2 | host history length: 2'
    'after a local click' = 'local count: 1 (doubled 2) | buttons used: local'
    'after a refused action' = 'outcome: fail: the host does not do that'
  }
  $failed = $false
  foreach ($key in $expected.Keys) {
    if (-not $steps[$key].Contains($expected[$key])) {
      "FAIL $key : expected '$($expected[$key])'"
      $failed = $true
    }
  }
  if ($failed) { exit 1 }
  'OK: host state, local state, context and rejected actions all update ' +
    'the controls'
} finally {
  Stop-Process -Id $node.Id -Force -ErrorAction SilentlyContinue
}
