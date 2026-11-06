import { LivePriority, liveSettingNameOf } from "./live-priority.ts";
import { raiseAnnouncement } from "./notification.ts";
import assert from "node:assert/strict";
import { describe, test } from "node:test";

class FakePeer {
  readonly raised: unknown[][] = [];

  raiseNotificationEvent(...values: unknown[]) {
    this.raised.push(values);
  }
}

describe("raiseAnnouncement", () => {
  test("a polite message waits behind speech and a newer one replaces it", () => {
    const peer = new FakePeer();
    raiseAnnouncement({
      peer,
      message: "Saved",
      priority: LivePriority.POLITE
    });
    assert.equal(peer.raised.length, 1);
    const [kind, processing, text] = peer.raised[0] ?? [];
    assert.deepEqual([kind, processing, text], [4, 3, "Saved"]);
  });

  test("an assertive message is important, so it interrupts", () => {
    const peer = new FakePeer();
    raiseAnnouncement({
      peer,
      message: "Connection lost",
      priority: LivePriority.ASSERTIVE
    });
    assert.equal(peer.raised[0]?.[1], 1);
  });

  test("an off priority and an empty message raise nothing", () => {
    const peer = new FakePeer();
    raiseAnnouncement({
      peer,
      message: "Saved",
      priority: LivePriority.OFF
    });
    raiseAnnouncement({
      peer,
      message: "",
      priority: LivePriority.POLITE
    });
    assert.equal(peer.raised.length, 0);
  });
});

describe("liveSettingNameOf", () => {
  test("each priority is the AutomationLiveSetting of the same name", () => {
    assert.deepEqual(Object.values(LivePriority).map(liveSettingNameOf), ["Off", "Polite", "Assertive"]);
  });
});
