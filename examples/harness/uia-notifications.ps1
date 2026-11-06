# Listens for UI Automation notification events (what Narrator hears from
# AutomationPeer.RaiseNotificationEvent) for a while and prints them as one
# line of JSON: [{ "kind", "processing", "text", "activityId" }]. It prints
# the line "ready" once it is subscribed, so a caller can then make the
# example announce. It sends no key and moves no mouse.
#
#   powershell -MTA -NoProfile -File uia-notifications.ps1 -ProcessId <pid> `
#     -ActivityId <id> -Milliseconds <how long to listen>
#
# Only events with the given activity id are kept (the desktop raises others).
# The managed System.Windows.Automation has no notification event, so the
# COM interfaces are declared here: the vtable of IUIAutomation5 is
# IUIAutomation (55 methods), IUIAutomation2 (6), 3 (2), 4 (2) and then
# AddNotificationEventHandler, in UIAutomationClient.h.
param(
  [Parameter(Mandatory)][int]$ProcessId,
  [Parameter(Mandatory)][string]$ActivityId,
  [Parameter(Mandatory)][int]$Milliseconds
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

[ComImport, Guid("C7CB2637-E6C2-4D0C-85DE-4948C02175C7"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IUIAutomationNotificationEventHandler {
  [PreserveSig]
  int HandleNotificationEvent(IntPtr sender, int kind, int processing,
    [MarshalAs(UnmanagedType.BStr)] string text,
    [MarshalAs(UnmanagedType.BStr)] string activityId);
}

[ComImport, Guid("25F700C8-D816-4057-A9DC-3CBDEE77E256"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IUIAutomation5 {
  void Slot01(); void Slot02(); void Slot03();
  [PreserveSig] int ElementFromHandle(IntPtr window, out IntPtr element);
  void Slot05(); void Slot06(); void Slot07(); void Slot08();
  void Slot09(); void Slot10(); void Slot11(); void Slot12(); void Slot13();
  void Slot14(); void Slot15(); void Slot16(); void Slot17(); void Slot18();
  void Slot19(); void Slot20(); void Slot21(); void Slot22(); void Slot23();
  void Slot24(); void Slot25(); void Slot26(); void Slot27(); void Slot28();
  void Slot29(); void Slot30(); void Slot31(); void Slot32(); void Slot33();
  void Slot34(); void Slot35(); void Slot36(); void Slot37(); void Slot38();
  void Slot39(); void Slot40(); void Slot41(); void Slot42(); void Slot43();
  void Slot44(); void Slot45(); void Slot46(); void Slot47(); void Slot48();
  void Slot49(); void Slot50(); void Slot51(); void Slot52(); void Slot53();
  void Slot54(); void Slot55(); void Slot56(); void Slot57(); void Slot58();
  void Slot59(); void Slot60(); void Slot61(); void Slot62(); void Slot63();
  void Slot64(); void Slot65();
  [PreserveSig] int AddNotificationEventHandler(IntPtr element, int scope,
    IntPtr cacheRequest, IUIAutomationNotificationEventHandler handler);
  [PreserveSig] int RemoveNotificationEventHandler(IntPtr element,
    IUIAutomationNotificationEventHandler handler);
}

public class NotificationSink : IUIAutomationNotificationEventHandler {
  public readonly List<string[]> Received = new List<string[]>();
  private readonly string wanted;
  public NotificationSink(string activityId) { wanted = activityId; }
  public int HandleNotificationEvent(IntPtr sender, int kind, int processing,
      string text, string activityId) {
    if (activityId == wanted) {
      lock (Received) {
        Received.Add(new string[] { kind.ToString(), processing.ToString(),
          text, activityId });
      }
    }
    return 0;
  }
}

public static class UiaNotifications {
  private const int SubtreeScope = 7;

  public static string[][] Listen(string activityId, int window, int milliseconds) {
    Type type = Type.GetTypeFromCLSID(
      new Guid("E22AD333-B25F-460C-83D0-0581107395C9"));
    IUIAutomation5 automation = (IUIAutomation5)Activator.CreateInstance(type);
    IntPtr root;
    Check(automation.ElementFromHandle(new IntPtr(window), out root), "ElementFromHandle");
    NotificationSink sink = new NotificationSink(activityId);
    Check(automation.AddNotificationEventHandler(root, SubtreeScope,
      IntPtr.Zero, sink), "AddNotificationEventHandler");
    Console.WriteLine("ready");
    Console.Out.Flush();
    System.Threading.Thread.Sleep(milliseconds);
    automation.RemoveNotificationEventHandler(root, sink);
    lock (sink.Received) { return sink.Received.ToArray(); }
  }

  private static void Check(int result, string call) {
    if (result != 0) { throw new Exception(call + " failed: " + result); }
  }
}
'@

# The desktop root is no place to listen on another desktop, so the listener
# is on the example's own window (found by the pid we started, as uia.ps1 does).
$condition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $ProcessId)
$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$window = $desktop.FindAll('Children', $condition) | Where-Object {
  $_.Current.ClassName -eq 'WinUIDesktopWin32WindowClass' } |
  Select-Object -First 1
if ($null -eq $window) { throw 'the example has no window' }
$received = [UiaNotifications]::Listen(
  $ActivityId, $window.Current.NativeWindowHandle, $Milliseconds)
$events = @($received | ForEach-Object {
  [ordered]@{
    kind = [int]$_[0]
    processing = [int]$_[1]
    text = $_[2]
    activityId = $_[3]
  }
})
ConvertTo-Json -InputObject $events -Compress
