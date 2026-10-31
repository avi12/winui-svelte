import assert from "node:assert/strict";
import { test } from "node:test";

// The web Notification over a stand-in for the Windows App SDK: permission
// transitions, event order, tag replacement, close, and one WinUI extra of each
// kind (an option, an event field and a method). Real toasts are for
// test/web-apis.test.ts.

const { installNotification, Notification, NotificationClickEvent } = await import("./notification.ts");
const { installPermissions, Permissions } = await import("./permissions.ts");
const { installWebApis } = await import("./install.ts");

type Backend = NonNullable<Parameters<typeof installNotification>[0]>["backend"];

function fakeBackend({ isEnabled = true, isSupported = true, isRegisterFailing = false } = {}) {
  const calls: string[] = [];
  const shown: Array<{
    id: number;
    spec: Parameters<NonNullable<Backend>["show"]>[0];
  }> = [];
  const updates: unknown[] = [];
  let invoked: ((invocation: Parameters<Parameters<NonNullable<Backend>["onInvoked"]>[0]>[0]) => void) | undefined;
  const backend = {
    isSupported: () => isSupported,
    isEnabled: () => isEnabled,
    register() {
      calls.push("register");

      if (isRegisterFailing) {
        throw new Error("no package identity");
      }
    },
    show(spec) {
      shown.push({
        id: shown.length + 1,
        spec
      });
      calls.push(`show ${spec.title}`);
      return shown.length;
    },
    remove(id) {
      calls.push(`remove ${id}`);
      return Promise.resolve();
    },
    updateProgress(update) {
      updates.push(update);
      return Promise.resolve(true);
    },
    onInvoked(callback) {
      invoked = callback;
      return () => undefined;
    }
  } satisfies NonNullable<Backend>;
  return {
    backend,
    calls,
    shown,
    updates,
    click({ token, action, input = {} }: {
      token: string;
      action?: string;
      input?: Record<string, string>;
    }) {
      const pairs = new Map([["webNotification", token]]);
      const hasAction = action !== undefined;
      if (hasAction) {
        pairs.set("action", encodeURIComponent(action));
      }

      invoked?.({
        argument: "",
        arguments: pairs,
        readInput: id => input[id]
      });
    }
  };
}

function withNotification({ fake, run }: {
  fake: ReturnType<typeof fakeBackend>;
  run: () => Promise<void>;
}) {
  const uninstall = installNotification({
    backend: fake.backend,
    state: {
      isRegistered: false
    }
  });
  return run().finally(uninstall);
}

function tick() {
  return new Promise<void>(resolve => {
    setImmediate(resolve);
  });
}

test("the permission is default, then granted once registration works", async () => {
  const fake = fakeBackend();
  await withNotification({
    fake,
    async run() {
      assert.equal(Notification.permission, "default");
      assert.equal(await Notification.requestPermission(), "granted");
      assert.equal(Notification.permission, "granted");
      assert.deepEqual(fake.calls, ["register"]);
    }
  });
});

test("the permission is denied when Windows refuses, and stays denied", async () => {
  for (const options of [{ isRegisterFailing: true }, { isEnabled: false }, { isSupported: false }]) {
    const fake = fakeBackend(options);
    await withNotification({
      fake,
      async run() {
        assert.equal(await Notification.requestPermission(), "denied");
        assert.equal(await Notification.requestPermission(), "denied");
        assert.equal(Notification.permission, "denied");
      }
    });
  }
});

test("the Permissions API follows and announces the change", async () => {
  const fake = fakeBackend();
  const uninstallPermissions = installPermissions();
  await withNotification({
    fake,
    async run() {
      const status = await navigator.permissions.query({ name: "notifications" });
      assert.equal(status.state, "prompt");
      const changes: string[] = [];
      status.addEventListener("change", () => changes.push(status.state));
      await Notification.requestPermission();
      assert.deepEqual(changes, ["granted"]);
      await assert.rejects(new Permissions().query({ name: "nothing" }), TypeError);
    }
  });
  uninstallPermissions();
  assert.equal("permissions" in navigator && Object.hasOwn(navigator, "permissions"), false);
});

test("a notification before permission fires error and shows nothing", async () => {
  const fake = fakeBackend();
  await withNotification({
    fake,
    async run() {
      const events: string[] = [];
      const notification = new Notification("hello");
      notification.onerror = () => events.push("error");
      notification.onshow = () => events.push("show");
      await tick();
      assert.deepEqual(events, ["error"]);
      assert.deepEqual(fake.shown, []);
    }
  });
});

test("show fires after construction, close() removes and fires close", async () => {
  const fake = fakeBackend();
  await withNotification({
    fake,
    async run() {
      await Notification.requestPermission();
      const events: string[] = [];
      const notification = new Notification("Saved", {
        body: "note.txt",
        tag: "save"
      });
      for (const type of ["show", "click", "close", "error"]) {
        notification.addEventListener(type, () => events.push(type));
      }

      assert.deepEqual(events, []);
      await tick();
      assert.deepEqual(events, ["show"]);
      assert.equal(fake.shown[0]?.spec.body, "note.txt");
      assert.equal(fake.shown[0]?.spec.tag, "save");
      notification.close();
      notification.close();
      await tick();
      assert.deepEqual(events, ["show", "close"]);
      assert.deepEqual(fake.calls, ["register", "show Saved", "remove 1"]);
    }
  });
});

test("a second notification with the same tag closes the first", async () => {
  const fake = fakeBackend();
  await withNotification({
    fake,
    async run() {
      await Notification.requestPermission();
      const first = new Notification("one", { tag: "t" });
      const events: string[] = [];
      first.onclose = () => events.push("first closed");
      await tick();
      const second = new Notification("two", { tag: "t" });
      second.onclose = () => events.push("second closed");
      await tick();
      assert.deepEqual(events, ["first closed"]);
      assert.equal(fake.shown.length, 2);
      assert.throws(() => new Notification("x", { renotify: true }), TypeError);
    }
  });
});

test("click reaches the notification that was shown, and the others stay quiet", async () => {
  const fake = fakeBackend();
  await withNotification({
    fake,
    async run() {
      await Notification.requestPermission();
      const first = new Notification("one");
      const second = new Notification("two");
      await tick();
      const clicks: string[] = [];
      first.onclick = () => clicks.push("first");
      second.onclick = () => clicks.push("second");
      fake.click({ token: fake.shown[1]?.spec.arguments.get("webNotification") ?? "" });
      assert.deepEqual(clicks, ["second"]);
    }
  });
});

test("extra option: the WinUI members reach the backend, the standard ones are unchanged", async () => {
  const fake = fakeBackend();
  await withNotification({
    fake,
    async run() {
      await Notification.requestPermission();
      const plain = new Notification("plain", { requireInteraction: true });
      const rich = new Notification("rich", {
        scenario: "alarm",
        audio: "alarm3",
        attribution: "via Notes",
        hero: "https://example.com/hero.png",
        group: "mail",
        expiration: 5000,
        buttons: [{
          type: "text-input",
          id: "reply",
          placeholder: "Type"
        }, {
          action: "send",
          title: "Send",
          style: "success",
          inputId: "reply"
        }]
      });
      await tick();
      assert.equal(plain.scenario, "reminder");
      const [plainShown, richShown] = fake.shown;
      assert.equal(plainShown?.spec.scenario, "reminder");
      assert.equal(plainShown?.spec.group, "web");
      assert.equal(richShown?.spec.scenario, "alarm");
      assert.equal(richShown?.spec.sound, "alarm3");
      assert.equal(richShown?.spec.heroUri, "https://example.com/hero.png");
      assert.equal(richShown?.spec.group, "mail");
      assert.equal(richShown?.spec.expiration, 5000);
      assert.deepEqual(richShown?.spec.controls?.map(control => control.kind), ["text-input", "button"]);
      assert.equal(rich.silent, null);
    }
  });
});

test("extra event field: click carries the action and what the user typed", async () => {
  const fake = fakeBackend();
  await withNotification({
    fake,
    async run() {
      await Notification.requestPermission();
      const notification = new Notification("Message", {
        actions: [{
          action: "open it",
          title: "Open"
        }],
        buttons: [{
          type: "text-input",
          id: "reply"
        }]
      });
      await tick();
      const heard: Array<InstanceType<typeof NotificationClickEvent>> = [];
      notification.addEventListener("click", event => {
        const isClick = event instanceof NotificationClickEvent;
        if (isClick) {
          heard.push(event);
        }
      });
      fake.click({
        token: fake.shown[0]?.spec.arguments.get("webNotification") ?? "",
        action: "open it",
        input: {
          reply: "on my way"
        }
      });
      assert.equal(heard[0]?.action, "open it");
      assert.deepEqual(heard[0]?.userInput, { reply: "on my way" });
      assert.equal(heard[0]?.notification, notification);
    }
  });
});

test("extra method: update changes the progress bar in place", async () => {
  const fake = fakeBackend();
  await withNotification({
    fake,
    async run() {
      await Notification.requestPermission();
      const notification = new Notification("Copying", {
        tag: "copy",
        progress: {
          title: "files",
          value: 0
        }
      });
      await tick();
      await notification.update({
        progress: {
          value: 0.5
        }
      });
      assert.deepEqual(fake.updates, [{
        tag: "copy",
        group: "web",
        sequence: 2,
        progress: {
          title: "files",
          value: 0.5
        }
      }]);
      assert.equal(notification.progress?.value, 0.5);
      const bare = new Notification("No bar");
      await assert.rejects(
        bare.update({
          progress: {
            value: 1
          }
        }), { name: "InvalidStateError" }
      );
    }
  });
});

test("installWebApis installs what it is given and uninstalls in reverse", () => {
  const log: string[] = [];
  const uninstall = installWebApis({
    apis: [
      () => {
        log.push("a up");
        return () => log.push("a down");
      },
      () => {
        log.push("b up");
        return () => log.push("b down");
      }
    ]
  });
  uninstall();
  assert.deepEqual(log, ["a up", "b up", "b down", "a down"]);
});

test("the global exists only while installed", () => {
  const isPresent = "Notification" in globalThis;
  const uninstall = installNotification({ backend: fakeBackend().backend });
  assert.equal(globalThis.Notification, Notification);
  uninstall();
  assert.equal("Notification" in globalThis, isPresent);
});
