import type { RegistryBackend } from "./registry.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// navigator.registerProtocolHandler over a fake registry: the web API's own
// checks, and that nothing is written until it is called.

const { installProtocolHandlers } = await import("./protocol-handlers.ts");

const COMMAND = {
  program: "C:\\node.exe",
  arguments: ["C:\\main.js"]
};

function recordingRegistry() {
  const keys = new Set<string>();
  return {
    keys,
    setString: ({ key }) => keys.add(key.toLowerCase()),
    readString({ key, name }) {
      const isOwned = keys.has(key.toLowerCase()) && name === "WinuiSvelte";
      return isOwned ? "1" : undefined;
    },
    hasKey: key => keys.has(key.toLowerCase()),
    deleteTree: key => keys.delete(key.toLowerCase()),
    deleteValue() {},
    deleteKeyIfEmpty: () => false
  } satisfies RegistryBackend & { keys: Set<string> };
}

test("installing defines the two methods and writes nothing", () => {
  const registry = recordingRegistry();
  const uninstall = installProtocolHandlers({
    registry,
    command: COMMAND
  });
  try {
    assert.equal(typeof navigator.registerProtocolHandler, "function");
    assert.equal(typeof navigator.unregisterProtocolHandler, "function");
    assert.equal(registry.keys.size, 0);
  } finally {
    uninstall();
  }
  assert.equal("registerProtocolHandler" in navigator, false);
});

test("register and unregister follow the web API", () => {
  const registry = recordingRegistry();
  const uninstall = installProtocolHandlers({
    registry,
    command: COMMAND
  });
  try {
    navigator.registerProtocolHandler("note", "https://example.com/open?uri=%s");
    assert.equal(registry.keys.has("software\\classes\\note"), true);
    assert.throws(() => navigator.registerProtocolHandler("note", "https://example.com/open"), { name: "SyntaxError" });
    assert.throws(() => navigator.registerProtocolHandler("https", "https://example.com/%s"), { name: "SecurityError" });
    navigator.unregisterProtocolHandler("note", "https://example.com/open?uri=%s");
    assert.equal(registry.keys.has("software\\classes\\note"), false);
  } finally {
    uninstall();
  }
});
