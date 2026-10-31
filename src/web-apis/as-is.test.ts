import { roInitialize } from "@microsoft/dynwinrt";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// Classes with no web counterpart are used as the bindings project them: the
// same class, method and property names as WinRT, an async operation as a
// promise, a collection that iterates. Two that work unpackaged.

roInitialize();

const { PasswordCredential } = await import("#winui/windows/security/credentials/PasswordCredential");
const { StorageFolder } = await import("#winui/windows/storage/StorageFolder");

test("Windows.Security.Credentials.PasswordCredential: properties as WinRT names them", () => {
  const credential = new PasswordCredential("notes.example", "avi", "s3cret");
  assert.equal(credential.resource, "notes.example");
  assert.equal(credential.userName, "avi");
  credential.userName = "someone";
  assert.equal(credential.userName, "someone");
});

test("Windows.Storage.StorageFolder: an async operation is a promise, a vector iterates", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "winui-svelte-as-is-"));
  try {
    writeFileSync(path.join(folder, "a.txt"), "a");
    writeFileSync(path.join(folder, "b.txt"), "b");
    const storageFolder = await StorageFolder.getFolderFromPathAsync(folder);
    const files = await storageFolder.getFilesAsync();
    const names = [...files ?? []].map(file => file.name).sort();
    assert.deepEqual(names, ["a.txt", "b.txt"]);
  } finally {
    rmSync(folder, {
      recursive: true,
      force: true
    });
  }
});
