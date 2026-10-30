import assert from "node:assert/strict";
import { test } from "node:test";
import type { Activation } from "./single-instance.ts";

// The single-instance and notification logic on stand-ins for the platform:
// who is primary, what a redirect carries, when the app registers, and what
// the notification holds. A real second process and a real toast are for
// test/app.test.ts in a desktop session.

const { claimInstance } = await import("./single-instance.ts");
const { argumentsOf, showNotification } = await import("./notify.ts");

function immediately(work: () => void) {
  work();
}

class FakeInstance {
  redirects = 0;
  private callback: ((activation: Activation) => void) | undefined;

  readonly isCurrent: boolean;

  constructor(isCurrent: boolean) {
    this.isCurrent = isCurrent;
  }

  get isListening() {
    return this.callback !== undefined;
  }

  redirectOwnActivation() {
    this.redirects += 1;
    return Promise.resolve();
  }

  onActivated(callback: (activation: Activation) => void) {
    this.callback = callback;
    return () => {
      this.callback = undefined;
    };
  }

  raise(activation: Activation) {
    this.callback?.(activation);
  }
}

test("the first copy is primary and hears the redirected activations until it releases", async () => {
  const instance = new FakeInstance(true);
  const heard: string[] = [];
  const single = await claimInstance({
    key: "app.test",
    source: {
      register: () => instance
    },
    runOnUiThread: immediately,
    onRedirect(activation) {
      heard.push(activation.commandLine ?? "");
    }
  });
  assert.equal(single.isPrimary, true);
  assert.equal(instance.redirects, 0, "the primary redirects nothing");
  instance.raise({
    kind: "Launch",
    commandLine: "open a.txt",
    data: null
  });
  assert.deepEqual(heard, ["open a.txt"]);
  single.release();
  assert.equal(instance.isListening, false);
});

test("a later copy hands its activation over and is not primary", async () => {
  const instance = new FakeInstance(false);
  const single = await claimInstance({
    key: "app.test",
    source: {
      register: () => instance
    },
    runOnUiThread: immediately,
    onRedirect() {
      assert.fail("a copy that redirects hears nothing");
    }
  });
  assert.equal(single.isPrimary, false);
  assert.equal(instance.redirects, 1);
  assert.equal(instance.isListening, false);
});

test("an empty key is refused before the platform is asked", async () => {
  await assert.rejects(
    claimInstance({
      key: "",
      source: {
        register() {
          assert.fail("not reached");
        }
      },
      runOnUiThread: immediately,
      onRedirect: () => undefined
    }), /non-empty key/u
  );
});

function recordingSource() {
  const calls: string[] = [];
  const shown: Array<{
    title: string;
    body?: string;
    tag?: string;
    arguments: ReadonlyMap<string, string>;
  }> = [];
  return {
    calls,
    shown,
    source: {
      register(identity: {
        displayName: string;
        iconPath: string;
      } | undefined) {
        calls.push(`register ${identity?.displayName ?? "-"}`);
      },
      show(spec: {
        title: string;
        body?: string;
        tag?: string;
        arguments: ReadonlyMap<string, string>;
      }) {
        shown.push(spec);
        return shown.length;
      },
      onInvoked() {
        calls.push("listen");
        return () => undefined;
      }
    }
  };
}

test("the first notification registers and listens, the next only shows", () => {
  const { calls, shown, source } = recordingSource();
  const state = { isRegistered: false };
  const first = showNotification({
    source,
    state,
    notification: {
      title: "Saved",
      body: "note.txt",
      tag: "save",
      arguments: {
        file: "note.txt"
      },
      displayName: "Notes",
      iconPath: "C:\\notes\\icon.png",
      onInvoked: () => undefined
    }
  });
  const second = showNotification({
    source,
    state,
    notification: {
      title: "Again"
    }
  });
  assert.deepEqual(calls, ["listen", "register Notes"]);
  assert.deepEqual([first, second], [1, 2]);
  assert.equal(shown[0]?.body, "note.txt");
  assert.equal(shown[0]?.tag, "save");
  assert.equal(shown[0]?.arguments.get("file"), "note.txt");
  assert.equal(shown[1]?.body, undefined);
  assert.equal(shown[1]?.arguments.size, 0);
});

test("a display name without an icon, or the reverse, is refused", () => {
  const { calls, source } = recordingSource();
  assert.throws(() => showNotification({
    source,
    state: {
      isRegistered: false
    },
    notification: {
      title: "x",
      displayName: "Notes"
    }
  }), /together or neither/u);
  assert.deepEqual(calls, []);
});

test("the argument string of a click reads back into the pairs it was built from", () => {
  assert.deepEqual([...argumentsOf("file=note.txt;action=open")], [["file", "note.txt"], ["action", "open"]]);
  assert.deepEqual([...argumentsOf("flag;a=b=c")], [["flag", ""], ["a", "b=c"]]);
  assert.equal(argumentsOf("").size, 0);
});
