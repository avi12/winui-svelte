import { roInitialize } from "@microsoft/dynwinrt";
import { windowsContactChooser } from "#src/web-apis/contacts.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// Only the question whether Windows has a contact picker is asked: opening it
// is a user interface, so no test does.

roInitialize();

test("Windows says whether a contact picker exists, without showing one", async context => {
  const chooser = windowsContactChooser();
  const isSupported = await chooser.isSupported();
  assert.equal(typeof isSupported, "boolean");
  assert.deepEqual(chooser.properties, ["address", "email", "name", "tel"]);
  context.diagnostic(`Contact picker supported: ${isSupported}`);
});
