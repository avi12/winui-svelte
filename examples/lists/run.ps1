# Runs the lists example in a background window (off screen, never activated):
# reads how many rows exist against how many items UI Automation sees realized,
# scrolls, saves a PrintWindow capture, and tries the keyboard reorder with a
# posted Alt+Down. Ends only the process it started.
param([string]$Out = "$env:TEMP\lists.png")
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
. "$PSScriptRoot\..\harness\window-tools.ps1"

function Count-Realized($hwnd) {
  $element = [System.Windows.Automation.AutomationElement]
  $root = $element::FromHandle($hwnd)
  $condition = New-Object System.Windows.Automation.PropertyCondition `
    ($element::ControlTypeProperty),
    ([System.Windows.Automation.ControlType]::ListItem)
  $root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants, $condition).Count
}

$example = Start-Example 'examples/lists/main.ts'
try {
  $hwnd = Wait-Window $example
  $null = Ask $example @{ cmd = 'stats' } 'stats'
  Start-Sleep -Seconds 2
  $opened = Ask $example @{ cmd = 'stats' } 'stats'
  "opened:  $($opened.rows) rows, $($opened.live) row components live, " +
    "$(Count-Realized $hwnd) list items visible to UI Automation"
  [ExampleWin]::Save($hwnd, $Out)
  $null = Ask $example @{ cmd = 'scroll'; key = 'row-900' } 'scrolled'
  Start-Sleep -Seconds 2
  $scrolled = Ask $example @{ cmd = 'stats' } 'stats'
  "scrolled: $($scrolled.created) created, $($scrolled.destroyed) ended, " +
    "$($scrolled.live) live"
} finally {
  Stop-Example $example
}
