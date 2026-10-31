import assert from "node:assert/strict";
import { test } from "node:test";

// The Push API over a stand-in for PushNotificationManager: subscribe,
// getSubscription, unsubscribe, the permission, error names and the push event.

const { installPush, PushEvent } = await import("./push.ts");
const { installPermissions } = await import("./permissions.ts");

type Backend = NonNullable<Parameters<typeof installPush>[0]>["backend"];

function fakeBackend({ isSupported = true, isChannelFailing = false } = {}) {
  const calls: string[] = [];
  let deliver: ((payload: Uint8Array) => void) | undefined;
  const backend = {
    isSupported: () => isSupported,
    register() {
      calls.push("register");
    },
    createChannel(remoteId: string) {
      calls.push(`channel ${remoteId}`);

      if (isChannelFailing) {
        return Promise.reject(new Error("service down"));
      }

      return Promise.resolve({
        uri: "https://wns.example/channel/1",
        expirationTime: 1_700_000_000_000,
        close() {
          calls.push("close");
        }
      });
    },
    onPush(callback) {
      deliver = callback;
      return () => {
        calls.push("stop");
      };
    }
  } satisfies NonNullable<Backend>;
  return {
    backend,
    calls,
    push: (payload: Uint8Array) => deliver?.(payload)
  };
}

test("subscribe opens a channel once, getSubscription finds it, unsubscribe closes it", async () => {
  const fake = fakeBackend();
  const uninstall = installPush({
    backend: fake.backend,
    remoteId: "app-id"
  });
  try {
    assert.equal(await navigator.pushManager.getSubscription(), null);
    const subscription = await navigator.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: "key"
    });
    assert.equal(subscription.endpoint, "https://wns.example/channel/1");
    assert.equal(subscription.expirationTime, 1_700_000_000_000);
    assert.equal(subscription.options.userVisibleOnly, true);
    assert.equal(subscription.getKey(), null);
    assert.deepEqual(subscription.toJSON(), {
      endpoint: "https://wns.example/channel/1",
      expirationTime: 1_700_000_000_000,
      keys: {}
    });
    assert.equal(await navigator.pushManager.subscribe(), subscription);
    assert.equal(await navigator.pushManager.getSubscription(), subscription);
    assert.equal(await subscription.unsubscribe(), true);
    assert.equal(await navigator.pushManager.getSubscription(), null);
    assert.deepEqual(fake.calls.filter(call => call !== "stop"), ["register", "channel app-id", "close"]);
  } finally {
    uninstall();
  }
});

test("errors carry the spec's names", async () => {
  const unsupported = installPush({ backend: fakeBackend({ isSupported: false }).backend });
  try {
    await assert.rejects(navigator.pushManager.subscribe({ remoteId: "x" }), { name: "NotSupportedError" });
    assert.equal(await navigator.pushManager.permissionState(), "denied");
  } finally {
    unsupported();
  }

  const noId = installPush({ backend: fakeBackend().backend });
  try {
    await assert.rejects(navigator.pushManager.subscribe(), { name: "NotSupportedError" });
  } finally {
    noId();
  }

  const failing = installPush({ backend: fakeBackend({ isChannelFailing: true }).backend });
  try {
    await assert.rejects(navigator.pushManager.subscribe({ remoteId: "x" }), { name: "NetworkError" });
  } finally {
    failing();
  }
});

test("the push permission follows support, and a message fires push with its data", async () => {
  const fake = fakeBackend();
  const uninstallPermissions = installPermissions();
  const uninstall = installPush({ backend: fake.backend });
  try {
    const status = await navigator.permissions.query({ name: "push" });
    assert.equal(status.state, "granted");
    const seen: string[] = [];
    navigator.pushManager.onpush = event => {
      const isPush = event instanceof PushEvent;
      if (isPush) {
        seen.push(event.data?.text() ?? "");
      }
    };
    fake.push(new TextEncoder().encode("hello"));
    assert.deepEqual(seen, ["hello"]);
    assert.deepEqual(PushManager.supportedContentEncodings, ["aes128gcm"]);
  } finally {
    uninstall();
    uninstallPermissions();
  }

  assert.equal(typeof PushManager, "undefined");
});
