import assert from "node:assert/strict";
import { test } from "node:test";

// installChromeApis defines exactly the namespaces it is given and undoes itself.

const { installChromeApis } = await import("./install.ts");
const { ChromeI18n } = await import("./i18n/chrome-i18n.ts");
const alarms = await import("#src/app/schedule/index.js");

function chromeGlobal() {
  return Object.getOwnPropertyDescriptor(globalThis, "chrome")?.value;
}

function i18n() {
  return new ChromeI18n({
    root: "app",
    uiLanguage: "en",
    defaultLocale: "en",
    readText: () => "{\"hello\": {\"message\": \"Hello\"}}"
  });
}

test("the global holds exactly the namespaces given", () => {
  assert.equal(chromeGlobal(), undefined);
  const instance = i18n();
  const uninstall = installChromeApis({
    i18n: instance,
    alarms
  });
  try {
    assert.equal(chromeGlobal().i18n, instance);
    assert.equal(chromeGlobal().i18n.getMessage("hello"), "Hello");
    assert.equal(chromeGlobal().alarms.create, alarms.create);
    assert.deepEqual(Object.keys(chromeGlobal()).toSorted(), ["alarms", "i18n"]);
  } finally {
    uninstall();
  }

  assert.equal(chromeGlobal(), undefined);
});

test("a chrome object already there keeps its members, and uninstall restores it", () => {
  const previous = { webview: true };
  Object.defineProperty(globalThis, "chrome", {
    value: previous,
    configurable: true,
    writable: true
  });
  const uninstall = installChromeApis({ i18n: i18n() });
  assert.deepEqual(Object.keys(chromeGlobal()).toSorted(), ["i18n", "webview"]);
  uninstall();
  assert.equal(chromeGlobal(), previous);
});
