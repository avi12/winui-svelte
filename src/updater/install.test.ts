import assert from "node:assert/strict";
import { test } from "node:test";

const { install } = await import("./install.ts");

const KEY = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\demo";

function fakeRegistry() {
  const values = new Map<string, string>();
  return {
    values,
    setString({ key, name, value }: {
      key: string;
      name: string;
      value: string;
    }) {
      values.set(`${key}|${name}`, value);
    },
    readString: () => undefined,
    hasKey: () => false,
    deleteTree: () => undefined,
    deleteValue: () => undefined,
    deleteKeyIfEmpty: () => false
  };
}

test("install writes the Add or remove programs entry and a shortcut", () => {
  const registry = fakeRegistry();
  const shortcuts: string[] = [];
  install({
    id: "demo",
    displayName: "Demo",
    publisher: "Avi",
    version: "1.2.0",
    root: "C:\\Users\\x\\AppData\\Local\\Demo",
    launcher: "C:\\Users\\x\\AppData\\Local\\Demo\\Demo.exe",
    registry,
    startMenuDirectory: "C:\\Users\\x\\Programs",
    shellBackend: {
      recycle: () => ({
        ok: true
      }),
      writeShortcut({ path }) {
        shortcuts.push(path);
      },
      readShortcut() {
        throw new Error("unused");
      }
    }
  });
  assert.equal(registry.values.get(`${KEY}|DisplayVersion`), "1.2.0");
  assert.equal(registry.values.get(`${KEY}|UninstallString`), "\"C:\\Users\\x\\AppData\\Local\\Demo\\Demo.exe\" \"--uninstall\"");
  assert.deepEqual(shortcuts, ["C:\\Users\\x\\Programs\\Demo.lnk"]);
});
