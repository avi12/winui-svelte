import { roInitialize } from "@microsoft/dynwinrt";
import { installNotification } from "#src/web-apis/notification.js";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The web Notification over the real Windows App SDK, without showing a toast:
// registering the process with the platform is the app's decision (it needs
// an identity and changes the user's notification settings), so this installs
// the API, reads the permission, and constructs and closes a notification in
// the same turn, before anything is shown. Where a toast really appears is
// for a person to look at (test/app.test.ts).

initWindowsAppSdk();
roInitialize();

test("the real backend installs, starts as default, and a closed notification never shows", async context => {
  const uninstall = installNotification();
  try {
    assert.equal(Notification.permission, "default");
    const events: string[] = [];
    const notification = new Notification("winui-svelte test", { body: "closed before it shows" });
    notification.onshow = () => events.push("show");
    notification.onerror = () => events.push("error");
    notification.onclose = () => events.push("close");
    notification.close();
    await new Promise(resolve => {
      setImmediate(resolve);
    });
    assert.deepEqual(events, ["close"]);
    context.diagnostic("Notification installed over AppNotificationManager; no toast shown");
  } finally {
    uninstall();
  }
});
