import type { Json } from "#src/messaging/json.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { receiveMessageOnPort } from "node:worker_threads";

// The single-instance and notification logic: who is primary, what a redirect
// carries and what is refused, the pipe name, a real pipe between two openers,
// when the app registers, and what the notification holds. A real second
// process and a real toast are for test/app.test.ts.

const { claimInstance } = await import("./single-instance.ts");
const { argumentsOf, showNotification } = await import("./notify.ts");
const { decodeRedirect, encodeRedirect, MAX_REDIRECT_BYTES } = await import("./redirect.ts");
const { openPipe, pipeNameFor } = await import("./instance-pipe.ts");
const { MemoryEnd } = await import("#src/state/transports/memory.js");

function immediately(work: () => void) {
  work();
}

const ACTIVATION = {
  arguments: ["open", "a.txt"],
  workingDirectory: "C:\\work"
};

function fakeSource({ isPrimary }: { isPrimary: boolean }) {
  const [server, client] = MemoryEnd.pair<Json>();
  const handedOver: unknown[] = [];
  const state = {
    client,
    handedOver,
    isClosed: false
  };
  const source = {
    claim({ activation }: { activation: unknown }) {
      if (!isPrimary) {
        state.handedOver.push(activation);
        return { isPrimary: false } as const;
      }

      return {
        isPrimary: true,
        transport: server,
        close() {
          state.isClosed = true;
        }
      } as const;
    }
  };
  return {
    state,
    source
  };
}

function settle() {
  return new Promise(resolve => setTimeout(resolve, 10));
}

test("the first copy is primary and hears what a later copy sends until it releases", async () => {
  const { state, source } = fakeSource({ isPrimary: true });
  const heard: { arguments: string[] }[] = [];
  let isWindowRaised = false;
  const single = claimInstance({
    key: "app.test",
    source,
    activation: ACTIVATION,
    runOnUiThread: immediately,
    window: {
      bringToFront() {
        isWindowRaised = true;
      }
    },
    onRedirect(activation) {
      heard.push(activation);
    }
  });
  assert.equal(single.isPrimary, true);
  state.client.sendJson({ value: ACTIVATION });
  await settle();
  assert.deepEqual(heard, [ACTIVATION]);
  assert.equal(isWindowRaised, true);
  single.release();
  assert.equal(state.isClosed, true);
  state.client.sendJson({ value: ACTIVATION });
  await settle();
  assert.equal(heard.length, 1, "nothing is heard after release");
});

test("malformed or foreign input is ignored and never reaches onRedirect", async () => {
  const { state, source } = fakeSource({ isPrimary: true });
  const heard: unknown[] = [];
  claimInstance({
    key: "app.test",
    source,
    activation: ACTIVATION,
    runOnUiThread: immediately,
    onRedirect: activation => heard.push(activation)
  });
  state.client.sendJson({
    value: {
      arguments: "rm -rf",
      workingDirectory: 1
    }
  });
  state.client.sendJson({
    value: {
      arguments: [1],
      workingDirectory: "x"
    }
  });
  state.client.sendJson({
    arguments: ["a"],
    workingDirectory: "x"
  });
  state.client.sendJson("text");
  state.client.sendMalformed("not json");
  await settle();
  assert.deepEqual(heard, []);
});

test("a later copy hands its activation over and is not primary", () => {
  const { state, source } = fakeSource({ isPrimary: false });
  const single = claimInstance({
    key: "app.test",
    source,
    activation: ACTIVATION,
    runOnUiThread: immediately,
    onRedirect() {
      assert.fail("a copy that redirects hears nothing");
    }
  });
  assert.equal(single.isPrimary, false);
  assert.deepEqual(state.handedOver, [ACTIVATION]);
});

test("an empty key is refused before the link is asked", () => {
  assert.throws(
    () => claimInstance({
      key: "",
      source: {
        claim() {
          assert.fail("not reached");
        }
      },
      activation: ACTIVATION,
      runOnUiThread: immediately,
      onRedirect: () => undefined
    }), /non-empty key/u
  );
});

test("a redirect line reads back, and a wrong or oversized one is refused", () => {
  assert.deepEqual(decodeRedirect(JSON.parse(encodeRedirect(ACTIVATION))), ACTIVATION);
  assert.equal(decodeRedirect(null), undefined);
  assert.equal(decodeRedirect({ arguments: [] }), undefined);
  assert.throws(() => encodeRedirect({
    arguments: ["x".repeat(MAX_REDIRECT_BYTES)],
    workingDirectory: "C:\\"
  }), /larger than/u);
});

test("the pipe name is per key and per user, and never holds either", () => {
  const base = pipeNameFor({
    key: "a",
    sid: "S-1-5-21-1"
  });
  assert.ok(base.startsWith("\\\\.\\pipe\\winui-svelte-"));
  assert.match(base.slice(-32), /^[0-9a-f]{32}$/u);
  assert.notEqual(
    base, pipeNameFor({
      key: "b",
      sid: "S-1-5-21-1"
    })
  );
  assert.notEqual(
    base, pipeNameFor({
      key: "a",
      sid: "S-1-5-21-2"
    })
  );
  assert.equal(
    base, pipeNameFor({
      key: "a",
      sid: "S-1-5-21-1"
    })
  );
  assert.equal(base.includes("S-1-5"), false);
});

test("on a real pipe the first opener serves and a later one delivers its line", async () => {
  const pipeName = pipeNameFor({
    key: `test.${randomUUID()}`,
    sid: "S-1-5-test"
  });
  const first = openPipe({
    pipeName,
    payload: "{}"
  });
  assert.equal(first.isPrimary, true);

  if (!first.isPrimary) {
    return;
  }

  const second = openPipe({
    pipeName,
    payload: encodeRedirect(ACTIVATION)
  });
  assert.equal(second.isPrimary, false);
  await settle();
  await settle();
  const received = receiveMessageOnPort(first.port)?.message;
  first.close();
  assert.deepEqual(received, { value: ACTIVATION });
});

function recordingSource() {
  const calls: string[] = [];
  const shown: {
    title: string;
    body?: string;
    tag?: string;
    arguments: ReadonlyMap<string, string>;
  }[] = [];
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
