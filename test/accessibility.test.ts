import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import { listenForNotifications } from "./uia.ts";
import { LivePriority } from "#src/accessibility/live-priority.js";
import { ANNOUNCE_ACTIVITY_ID } from "#src/accessibility/notification.js";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

// The accessibility example (examples/accessibility) in a real WinUI window,
// off screen: the audit reads the visual tree through UI Automation's peers,
// and the notification `announce` raises is heard through a UI Automation
// event handler, as a screen reader hears it. No key and no mouse is sent.
// Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const SETTLE_MILLISECONDS = 1500;
const LISTEN_MILLISECONDS = 4000;
const KIND_OTHER = 4;
const PROCESSING_MOST_RECENT = 3;
const PROCESSING_IMPORTANT_MOST_RECENT = 1;

const ANNOUNCEMENTS = [
  {
    message: "Saved",
    priority: LivePriority.POLITE
  },
  {
    message: "Connection lost",
    priority: LivePriority.ASSERTIVE
  }
];

describe("accessibility", { skip: !IS_WINDOWS_APP_SDK_RESTORED }, () => {
  let example: ExampleProcess;

  before(async () => {
    example = ExampleProcess.start({ entry: "examples/accessibility/main.ts" });
    await new Promise(resolve => setTimeout(resolve, SETTLE_MILLISECONDS));
  }, { timeout: TIMEOUT_MILLISECONDS });

  after(() => {
    example.kill();
  });

  test("the audit finds the nameless icon-only button and not the named one", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const report = await example.ask({
      command: {
        cmd: "audit"
      },
      kind: "audit"
    });
    assert.deepEqual(report["failing"], ["unlabeled-input", "unnamed-button", "low-contrast-text"]);
    assert.deepEqual(report["fixed"], []);
  });

  test("announce is heard through UI Automation, polite and assertive", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const listener = listenForNotifications({
      pid: example.pid,
      activityId: ANNOUNCE_ACTIVITY_ID,
      milliseconds: LISTEN_MILLISECONDS
    });
    await listener.ready;
    for (const { message, priority } of ANNOUNCEMENTS) {
      await example.ask({
        command: {
          cmd: "announce",
          message,
          priority
        },
        kind: "announced"
      });
    }

    const heard = await listener.notifications;
    assert.deepEqual(
      heard.map(({ text, kind, processing }) => ({
        text,
        kind,
        processing
      })), [
        {
          text: "Saved",
          kind: KIND_OTHER,
          processing: PROCESSING_MOST_RECENT
        },
        {
          text: "Connection lost",
          kind: KIND_OTHER,
          processing: PROCESSING_IMPORTANT_MOST_RECENT
        }
      ]
    );
  });
});
