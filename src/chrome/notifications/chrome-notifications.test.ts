import assert from "node:assert/strict";
import { test } from "node:test";

// chrome.notifications over the web Notification, which runs on a stand-in
// for the Windows App SDK: nothing here shows a real toast.

const { ChromeNotifications } = await import("./chrome-notifications.ts");
const { installNotification } = await import("#src/web-apis/notification.js");

type Backend = NonNullable<Parameters<typeof installNotification>[0]>["backend"];
type Spec = Parameters<NonNullable<Backend>["show"]>[0];
type Invocation = Parameters<Parameters<NonNullable<Backend>["onInvoked"]>[0]>[0];

function fakeBackend({ isEnabled = true } = {}) {
  const shown: Spec[] = [];
  const removed: number[] = [];
  const updates: { progress: unknown }[] = [];
  const state = { isFound: true };
  let invoked: ((invocation: Invocation) => void) | undefined;
  const backend = {
    isSupported: () => true,
    isEnabled: () => isEnabled,
    register: () => undefined,
    show(spec) {
      shown.push(spec);
      return shown.length;
    },
    remove(id) {
      removed.push(id);
      return Promise.resolve();
    },
    list: () => Promise.resolve([]),
    removeAll: () => Promise.resolve(),
    canSchedule: () => false,
    schedule: () => ({ cancel: () => undefined }),
    updateProgress(update) {
      updates.push({ progress: update.progress });
      return Promise.resolve(state.isFound);
    },
    onInvoked(callback) {
      invoked = callback;
      return () => undefined;
    }
  } satisfies NonNullable<Backend>;
  return {
    backend,
    removed,
    shown,
    state,
    updates,
    click({ index, action }: {
      index: number;
      action?: string;
    }) {
      const pairs = new Map(shown[index]?.arguments);
      const hasAction = action !== undefined;
      if (hasAction) {
        pairs.set("action", encodeURIComponent(action));
      }

      invoked?.({
        argument: "",
        arguments: pairs,
        readInput: () => undefined
      });
    }
  };
}

async function withChrome({ fake, run }: {
  fake: ReturnType<typeof fakeBackend>;
  run: (notifications: InstanceType<typeof ChromeNotifications>) => Promise<void>;
}) {
  const uninstall = installNotification({
    backend: fake.backend,
    state: {
      isRegistered: false
    }
  });
  try {
    await run(new ChromeNotifications());
  } finally {
    uninstall();
  }
}

function tick() {
  return new Promise<void>(resolve => {
    setImmediate(resolve);
  });
}

test("create asks for the permission, shows a basic notification and returns the id", async () => {
  const fake = fakeBackend();
  await withChrome({
    fake,
    async run(notifications) {
      assert.equal(await notifications.getPermissionLevel(), "denied");
      const id = await notifications.create("one", {
        type: "basic",
        title: "Hello",
        message: "World",
        contextMessage: "from the app",
        silent: true
      });
      await tick();
      assert.equal(id, "one");
      assert.equal(await notifications.getPermissionLevel(), "granted");
      assert.equal(fake.shown.length, 1);
      assert.equal(fake.shown[0]?.title, "Hello");
      assert.equal(fake.shown[0]?.body, "World");
      assert.equal(fake.shown[0]?.tag, "one");
      assert.equal(fake.shown[0]?.attribution, "from the app");
      assert.equal(fake.shown[0]?.isSilent, true);
      assert.deepEqual(await notifications.getAll(), { one: true });
    }
  });
});

test("an id that is missing or empty is made up", async () => {
  await withChrome({
    fake: fakeBackend(),
    async run(notifications) {
      const first = await notifications.create(undefined, {
        type: "basic",
        title: "a",
        message: "b"
      });
      const second = await notifications.create("", {
        type: "basic",
        title: "a",
        message: "b"
      });
      assert.notEqual(first, "");
      assert.notEqual(first, second);
    }
  });
});

test("templates: image, list and progress map to the body, picture and bar", async () => {
  const fake = fakeBackend();
  await withChrome({
    fake,
    async run(notifications) {
      await notifications.create("image", {
        type: "image",
        title: "i",
        message: "m",
        imageUrl: "https://example.com/p.png"
      });
      await notifications.create("list", {
        type: "list",
        title: "l",
        message: "head",
        items: [{
          title: "a",
          message: "1"
        }, {
          title: "b",
          message: "2"
        }]
      });
      await notifications.create("bar", {
        type: "progress",
        title: "p",
        message: "m",
        progress: 40
      });
      await tick();
      assert.equal(fake.shown[0]?.imageUri, "https://example.com/p.png");
      assert.equal(fake.shown[1]?.body, "head\na: 1\nb: 2");
      assert.deepEqual(fake.shown[2]?.progress, { value: 0.4 });
    }
  });
});

test("priority, requireInteraction and silent set the scenario and the sound", async () => {
  const fake = fakeBackend();
  await withChrome({
    fake,
    async run(notifications) {
      await notifications.create("low", {
        type: "basic",
        title: "t",
        message: "m",
        priority: -1
      });
      await notifications.create("high", {
        type: "basic",
        title: "t",
        message: "m",
        priority: 2
      });
      await notifications.create("loud", {
        type: "basic",
        title: "t",
        message: "m",
        priority: -2,
        silent: false
      });
      await tick();
      assert.equal(fake.shown[0]?.isSilent, true);
      assert.equal(fake.shown[1]?.scenario, "reminder");
      assert.equal(fake.shown[2]?.isSilent, undefined);
    }
  });
});

test("create rejects options that fail the check", async () => {
  await withChrome({
    fake: fakeBackend(),
    async run(notifications) {
      const bad = [
        {
          title: "t",
          message: "m"
        },
        {
          type: "list",
          title: "t",
          message: "m"
        },
        {
          type: "progress",
          title: "t",
          message: "m",
          progress: 101
        },
        {
          type: "basic",
          title: "t",
          message: "m",
          priority: 3
        },
        {
          type: "basic",
          title: "t",
          message: "m",
          buttons: [{ title: "1" }, { title: "2" }, { title: "3" }]
        }
      ];
      for (const options of bad) {
        await assert.rejects(notifications.create("x", options as never), Error);
      }
    }
  });
});

test("create rejects when notifications are not allowed", async () => {
  await withChrome({
    fake: fakeBackend({ isEnabled: false }),
    async run(notifications) {
      await assert.rejects(
        notifications.create("x", {
          type: "basic",
          title: "t",
          message: "m"
        }),
        /not allowed/u
      );
      assert.equal(await notifications.getPermissionLevel(), "denied");
    }
  });
});

test("a click fires onClicked then onClosed with byUser, and a button fires onButtonClicked", async () => {
  const fake = fakeBackend();
  await withChrome({
    fake,
    async run(notifications) {
      const heard: string[] = [];
      notifications.onClicked.addListener(id => heard.push(`click ${id}`));
      notifications.onButtonClicked.addListener((id, index) => heard.push(`button ${id} ${index}`));
      notifications.onClosed.addListener((id, isByUser) => heard.push(`closed ${id} ${isByUser}`));
      const options = {
        type: "basic",
        title: "t",
        message: "m",
        buttons: [{ title: "Yes" }, { title: "No" }]
      } as const;
      await notifications.create("a", options);
      await notifications.create("b", options);
      await tick();
      fake.click({ index: 0 });
      fake.click({
        index: 1,
        action: "1"
      });
      assert.deepEqual(heard, ["click a", "closed a true", "button b 1", "closed b true"]);
      assert.deepEqual(await notifications.getAll(), {});
    }
  });
});

test("isClickable false hides the body click but not the buttons", async () => {
  const fake = fakeBackend();
  await withChrome({
    fake,
    async run(notifications) {
      const heard: string[] = [];
      notifications.onClicked.addListener(id => heard.push(`click ${id}`));
      notifications.onClosed.addListener(id => heard.push(`closed ${id}`));
      await notifications.create("a", {
        type: "basic",
        title: "t",
        message: "m",
        isClickable: false
      });
      await tick();
      fake.click({ index: 0 });
      assert.deepEqual(heard, ["closed a"]);
    }
  });
});

test("clear removes the notification once and fires onClosed with byUser false", async () => {
  const fake = fakeBackend();
  await withChrome({
    fake,
    async run(notifications) {
      const heard: string[] = [];
      notifications.onClosed.addListener((id, isByUser) => heard.push(`closed ${id} ${isByUser}`));
      await notifications.create("a", {
        type: "basic",
        title: "t",
        message: "m"
      });
      await tick();
      assert.equal(await notifications.clear("a"), true);
      assert.equal(await notifications.clear("a"), false);
      await tick();
      assert.deepEqual(heard, ["closed a false"]);
      assert.deepEqual(fake.removed, [1]);
      assert.deepEqual(await notifications.getAll(), {});
    }
  });
});

test("creating the same id again replaces it without an onClosed", async () => {
  const fake = fakeBackend();
  await withChrome({
    fake,
    async run(notifications) {
      const heard: string[] = [];
      notifications.onClosed.addListener(id => heard.push(id));
      await notifications.create("a", {
        type: "basic",
        title: "first",
        message: "m"
      });
      await tick();
      await notifications.create("a", {
        type: "basic",
        title: "second",
        message: "m"
      });
      await tick();
      assert.deepEqual(heard, []);
      assert.deepEqual(fake.shown.map(spec => spec.title), ["first", "second"]);
      assert.deepEqual(await notifications.getAll(), { a: true });
    }
  });
});

test("update merges and shows again, and a progress change moves the bar in place", async () => {
  const fake = fakeBackend();
  await withChrome({
    fake,
    async run(notifications) {
      assert.equal(await notifications.update("none", { title: "x" }), false);
      await notifications.create("bar", {
        type: "progress",
        title: "p",
        message: "m",
        progress: 10
      });
      await tick();
      assert.equal(await notifications.update("bar", { progress: 60 }), true);
      assert.deepEqual(fake.updates, [{
        progress: {
          value: 0.6
        }
      }]);
      assert.equal(fake.shown.length, 1);
      assert.equal(await notifications.update("bar", { title: "renamed" }), true);
      await tick();
      assert.equal(fake.shown.length, 2);
      assert.equal(fake.shown[1]?.title, "renamed");
      assert.deepEqual(fake.shown[1]?.progress, { value: 0.6 });
      await assert.rejects(notifications.update("bar", { progress: 200 }), Error);
    }
  });
});

test("update answers false when Windows lost the bar", async () => {
  const fake = fakeBackend();
  await withChrome({
    fake,
    async run(notifications) {
      await notifications.create("bar", {
        type: "progress",
        title: "p",
        message: "m",
        progress: 10
      });
      await tick();
      fake.state.isFound = false;
      assert.equal(await notifications.update("bar", { progress: 20 }), false);
      assert.deepEqual(await notifications.getAll(), {});
    }
  });
});
