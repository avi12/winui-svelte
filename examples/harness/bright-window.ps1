# A window of one bright color (pure green), for a test to put behind a
# transparent window and read through it: borderless, no taskbar button, never
# activated. It ends when the process that started it
# ends it (by the pid the test holds), or after -Seconds.
#
#   powershell -NoProfile -File bright-window.ps1 -X <px> -Y <px> `
#     -Width <px> -Height <px> [-Seconds 120]
#
# Prints `ready` on stdout once the window is shown.
param(
  [Parameter(Mandatory)][int]$X,
  [Parameter(Mandatory)][int]$Y,
  [Parameter(Mandatory)][int]$Width,
  [Parameter(Mandatory)][int]$Height,
  [int]$Seconds = 120
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class BrightForm : Form {
  const int WS_EX_TOOLWINDOW = 0x80;
  const int WS_EX_NOACTIVATE = 0x08000000;

  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  protected override bool ShowWithoutActivation { get { return true; } }

  protected override CreateParams CreateParams {
    get {
      var parameters = base.CreateParams;
      parameters.ExStyle |= WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
      return parameters;
    }
  }
}
'@
[void][BrightForm]::SetProcessDPIAware()

$form = New-Object BrightForm
$form.FormBorderStyle = 'None'
$form.StartPosition = 'Manual'
$form.ShowInTaskbar = $false
$form.BackColor = [Drawing.Color]::FromArgb(0, 255, 0)
$form.Bounds = New-Object Drawing.Rectangle $X, $Y, $Width, $Height
$form.Add_Shown({ [Console]::Out.WriteLine('ready'); [Console]::Out.Flush() })
$timer = New-Object Windows.Forms.Timer
$timer.Interval = $Seconds * 1000
$timer.Add_Tick({ $form.Close() })
$timer.Start()
[Windows.Forms.Application]::Run($form)
