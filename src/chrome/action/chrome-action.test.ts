import assert from "node:assert/strict";
import { test } from "node:test";

// chrome.action over a fake tray: no icon is put in the real notification area.

const { ChromeAction } = await import("./chrome-action.ts");
const { createChromeAction } = await import("./create-chrome-action.ts");
const { TrayGesture } = await import("#src/tray/click-detector.js");

interface Change {
  readonly icon?: unknown;
  readonly tooltip?: string | undefined;
}

function fakeTray() {
  const changes: Change[] = [];
  return {
    changes,
    update(change: Change) {
      changes.push(change);
    }
  };
}

test("the title is the tooltip and the badge a suffix", async () => {
  const tray = fakeTray();
  const action = new ChromeAction({
    title: "Inbox",
    tray
  });
  assert.deepEqual(tray.changes.at(-1), { tooltip: "Inbox" });
  await action.setBadgeText({ text: "3" });
  assert.deepEqual(tray.changes.at(-1), { tooltip: "Inbox (3)" });
  await action.setTitle({
    title: "Mail",
    tabId: 7
  });
  assert.deepEqual(tray.changes.at(-1), { tooltip: "Mail (3)" });
  assert.equal(await action.getTitle(), "Mail");
  assert.equal(await action.getBadgeText({}), "3");
  await action.setBadgeText({ text: "" });
  assert.deepEqual(tray.changes.at(-1), { tooltip: "Mail" });
  await action.setBadgeText({});
  assert.equal(await action.getBadgeText(), "");
});

test("a long tooltip is cut to what the shell holds", async () => {
  const tray = fakeTray();
  const action = new ChromeAction({ tray });
  await action.setTitle({ title: "x".repeat(300) });
  assert.equal(tray.changes.at(-1)?.tooltip?.length, 127);
});

test("setIcon swaps the icon, for one path or a theme pair", async () => {
  const tray = fakeTray();
  const action = new ChromeAction({ tray });
  await action.setIcon({ path: "a.ico" });
  assert.deepEqual(tray.changes.at(-1), { icon: "a.ico" });
  const pair = {
    forLightTaskbar: "l.ico",
    forDarkTaskbar: "d.ico"
  };
  await action.setIcon({ path: pair });
  assert.deepEqual(tray.changes.at(-1), { icon: pair });
  const imageData: unknown = {
    imageData: {}
  };
  await assert.rejects(action.setIcon(imageData as never));
});

test("badge color takes channels or hex, with Chrome's red as the default", async () => {
  const action = new ChromeAction();
  assert.deepEqual(await action.getBadgeBackgroundColor(), [217, 0, 0, 255]);
  await action.setBadgeBackgroundColor({ color: [1, 2, 3, 4] });
  assert.deepEqual(await action.getBadgeBackgroundColor(), [1, 2, 3, 4]);
  await action.setBadgeBackgroundColor({ color: "#0af" });
  assert.deepEqual(await action.getBadgeBackgroundColor(), [0, 170, 255, 255]);
  await action.setBadgeBackgroundColor({ color: "#00112280" });
  assert.deepEqual(await action.getBadgeBackgroundColor(), [0, 17, 34, 128]);
  await assert.rejects(action.setBadgeBackgroundColor({ color: "red" }), /not a hex color/u);
  await assert.rejects(action.setBadgeBackgroundColor({ color: [1, 2, 3, 300] }));
});

test("a click fires onClicked unless the action is disabled", async () => {
  const action = new ChromeAction();
  let clicks = 0;
  action.onClicked.addListener(() => {
    clicks += 1;
  });
  action.click();
  await action.disable();
  assert.equal(await action.isEnabled(), false);
  action.click();
  await action.enable();
  assert.equal(await action.isEnabled(), true);
  action.click();
  assert.equal(clicks, 2);
});

test("createChromeAction wires the tray's click to onClicked", async () => {
  const tray = fakeTray();
  let onclick: (() => void) | undefined;
  const made = createChromeAction({
    icon: "app.ico",
    title: "App",
    createTray(options) {
      onclick = () => options.onclick?.({
        gesture: TrayGesture.click,
        x: 0,
        y: 0
      });
      return {
        ...tray,
        isRegistered: true,
        notify: () => undefined,
        remove: () => undefined,
        bounds: () => null
      };
    }
  });
  let clicks = 0;
  made.action.onClicked.addListener(() => {
    clicks += 1;
  });
  onclick?.();
  assert.equal(clicks, 1);
  assert.equal(await made.action.getTitle(), "App");
  assert.deepEqual(tray.changes.at(-1), { tooltip: "App" });
});
