import { roInitialize } from "@microsoft/dynwinrt";
import { windowsKeyStore, windowsVault } from "#src/web-apis/credentials-windows.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

// The credentials over the real PasswordVault with a uniquely named resource,
// deleted afterwards, and the harmless availability checks of Windows Hello.
// No Windows Hello prompt is ever shown: nothing here makes a key or signs.

roInitialize();

test("the PasswordVault keeps, lists and removes an entry", () => {
  const vault = windowsVault();
  const resource = `winui-svelte-test:${randomUUID()}`;
  try {
    assert.deepEqual(vault.list(resource), []);
    vault.add({
      resource,
      userName: "avi",
      password: "s3cret"
    });
    vault.add({
      resource,
      userName: "avi",
      password: "changed"
    });
    vault.add({
      resource,
      userName: "other",
      password: "x"
    });
    const stored = vault.list(resource).sort((left, right) => left.userName.localeCompare(right.userName));
    assert.deepEqual(stored, [
      {
        userName: "avi",
        password: "changed"
      },
      {
        userName: "other",
        password: "x"
      }
    ]);
  } finally {
    vault.remove({
      resource,
      userName: "avi"
    });
    vault.remove({
      resource,
      userName: "other"
    });
  }

  assert.deepEqual(vault.list(resource), []);
});

test("Windows Hello availability is a plain yes or no, with no prompt", async context => {
  const isAvailable = await windowsKeyStore({ windowHandle: undefined }).isAvailable();
  assert.equal(typeof isAvailable, "boolean");
  context.diagnostic(`Windows Hello available: ${isAvailable}`);
});
