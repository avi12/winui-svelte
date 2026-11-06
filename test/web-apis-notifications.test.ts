import { roInitialize } from "@microsoft/dynwinrt";
import { windowsNotificationSource } from "#src/app/notification-source.js";
import { installBadging } from "#src/web-apis/badging.js";
import { installLaunch } from "#src/web-apis/launch.js";
import { installPermissions } from "#src/web-apis/permissions.js";
import { installPush } from "#src/web-apis/push.js";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// Badging, Push and the launch queue over the real WinRT classes, without
// subscribing, showing or changing anything the user sees: construct, detect,
// read the permission state, clear a badge that was never set.

initWindowsAppSdk();
roInitialize();

test("push reports its support through the permission, badging clears, launch installs", async context => {
  const uninstalls = [
    installPermissions(),
    installPush(),
    installBadging(),
    installLaunch({ initialArguments: [] })
  ];
  try {
    const status = await navigator.permissions.query({ name: "push" });
    assert.ok(["granted", "denied"].includes(status.state));
    assert.equal(await navigator.pushManager.permissionState(), status.state);
    assert.equal(await navigator.pushManager.getSubscription(), null);
    await navigator.clearAppBadge().catch((error: unknown) => {
      assert.equal(error instanceof DOMException && error.name, "NotSupportedError");
    });
    assert.equal(typeof launchQueue.setConsumer, "function");
    context.diagnostic(`push permission: ${status.state}`);
  } finally {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  }
});

test("an unpackaged process cannot schedule, and listing what Windows holds is reported", async context => {
  const source = windowsNotificationSource();
  assert.equal(source.canSchedule(), false, "node.exe has no package identity");
  const outcome = await source.list().then(
    held => `${held.length} held`,
    (error: unknown) => `refused: ${String(error)}`
  );
  context.diagnostic(`list: ${outcome}`);
});
