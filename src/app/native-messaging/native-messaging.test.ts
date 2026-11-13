import type { RegistryBackend, ValueAddress } from "#src/app/activation/registry.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The native messaging registrations over a fake registry in memory: the four
// browser keys and their default value, writing twice, and that removing
// takes only the host's own keys and the parents left empty.

const { NativeMessagingBrowser, registerNativeMessagingHost, unregisterNativeMessagingHost } = await import("./index.ts");

const MANIFEST = "C:\\apps\\notes\\host.json";
const KEYS = [
  "Software\\Google\\Chrome\\NativeMessagingHosts\\com.example.notes",
  "Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.example.notes",
  "Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\com.example.notes",
  "Software\\Chromium\\NativeMessagingHosts\\com.example.notes"
];

function createFakeRegistry() {
  const values = new Map<string, Map<string, string>>();
  function normal(key: string) {
    return key.toLowerCase();
  }
  function ensure(key: string) {
    const parts = key.split("\\");
    for (let length = 1; length <= parts.length; length++) {
      const prefix = normal(parts.slice(0, length).join("\\"));
      if (!values.has(prefix)) {
        values.set(prefix, new Map());
      }
    }
  }
  function children(key: string) {
    return [...values.keys()].filter(other => other.startsWith(`${normal(key)}\\`));
  }
  return {
    values,
    setString({ key, name, value }: ValueAddress & { value: string }) {
      ensure(key);
      values.get(normal(key))?.set(normal(name), value);
    },
    readString({ key, name }: ValueAddress) {
      return values.get(normal(key))?.get(normal(name));
    },
    hasKey: (key: string) => values.has(normal(key)),
    deleteTree(key: string) {
      for (const other of [normal(key), ...children(key)]) {
        values.delete(other);
      }
    },
    deleteValue({ key, name }: ValueAddress) {
      values.get(normal(key))?.delete(normal(name));
    },
    deleteKeyIfEmpty(key: string) {
      const isEmpty = (values.get(normal(key))?.size ?? 1) === 0 && children(key).length === 0;
      if (isEmpty) {
        values.delete(normal(key));
      }

      return isEmpty;
    }
  } satisfies RegistryBackend & { values: Map<string, Map<string, string>> };
}

function register({ registry, browsers }: {
  registry: RegistryBackend;
  browsers?: readonly (typeof NativeMessagingBrowser)[keyof typeof NativeMessagingBrowser][];
}) {
  registerNativeMessagingHost({
    name: "com.example.notes",
    manifestPath: MANIFEST,
    registry,
    ...browsers === undefined ? {} : { browsers }
  });
}

test("the host is written for all four browsers with the manifest as the default value", () => {
  const registry = createFakeRegistry();
  register({ registry });
  for (const key of KEYS) {
    assert.equal(
      registry.readString({
        key,
        name: ""
      }), MANIFEST, key
    );
  }
});

test("registering again changes nothing", () => {
  const registry = createFakeRegistry();
  register({ registry });
  const once = JSON.stringify([...registry.values]);
  register({ registry });
  assert.equal(JSON.stringify([...registry.values]), once);
});

test("only the browsers asked for are written", () => {
  const registry = createFakeRegistry();
  register({
    registry,
    browsers: [NativeMessagingBrowser.edge]
  });
  assert.equal(registry.hasKey(KEYS[1] ?? ""), true);
  assert.equal(registry.hasKey("Software\\Google\\Chrome"), false);
});

test("unregistering removes the host keys and the parents left empty", () => {
  const registry = createFakeRegistry();
  register({ registry });
  unregisterNativeMessagingHost({
    name: "com.example.notes",
    registry
  });
  assert.deepEqual([...registry.values.keys()].filter(key => key !== "software"), []);
});

test("unregistering leaves another host and a browser's other keys alone", () => {
  const registry = createFakeRegistry();
  register({ registry });
  registry.setString({
    key: "Software\\Google\\Chrome\\NativeMessagingHosts\\com.example.other",
    name: "",
    value: "C:\\other.json"
  });
  registry.setString({
    key: "Software\\Microsoft\\Edge\\Settings",
    name: "x",
    value: "y"
  });
  unregisterNativeMessagingHost({
    name: "com.example.notes",
    registry
  });
  assert.equal(
    registry.readString({
      key: "Software\\Google\\Chrome\\NativeMessagingHosts\\com.example.other",
      name: ""
    }), "C:\\other.json"
  );
  assert.equal(registry.hasKey(KEYS[0] ?? ""), false);
  assert.equal(
    registry.readString({
      key: "Software\\Microsoft\\Edge\\Settings",
      name: "x"
    }), "y"
  );
  assert.equal(registry.hasKey("Software\\Microsoft\\Edge"), true);
  assert.equal(registry.hasKey("Software\\Chromium"), false);
});

test("a bad host name or a relative manifest path is refused before anything is written", () => {
  const registry = createFakeRegistry();
  for (const name of ["", "Com.Example", "a..b", ".a", "a b", "a\\b"]) {
    assert.throws(() => registerNativeMessagingHost({
      name,
      manifestPath: MANIFEST,
      registry
    }), TypeError, name);
  }
  assert.throws(() => registerNativeMessagingHost({
    name: "com.example.notes",
    manifestPath: "host.json",
    registry
  }), TypeError);
  assert.equal(registry.values.size, 0);
});
