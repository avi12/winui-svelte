import assert from "node:assert/strict";
import { test } from "node:test";

// chrome.permissions over the Permissions API's registered providers: the
// names that map, the ones that are always held, origins, the saved file, the
// events and the Settings fallback. Providers and the file are fakes.

const { ChromePermissions } = await import("./chrome-permissions.ts");
const { PermissionName, PermissionStateName, registerPermission } = await import("#src/web-apis/permissions.js");

type State = (typeof PermissionStateName)[keyof typeof PermissionStateName];

function fakeFile(initial?: string) {
  const state = {
    text: initial,
    writes: 0
  };
  return {
    state,
    read: () => state.text,
    write(text: string) {
      state.text = text;
      state.writes += 1;
    }
  };
}

function fakeProvider({ name, initial, onPrompt }: {
  name: (typeof PermissionName)[keyof typeof PermissionName];
  initial: State;
  onPrompt?: State;
}) {
  const box = {
    state: initial,
    prompts: 0
  };
  const unregister = registerPermission({
    name,
    provider: {
      state: () => box.state,
      ...onPrompt !== undefined && {
        async request() {
          box.prompts += 1;
          box.state = onPrompt;
          return box.state;
        }
      }
    }
  });
  return {
    box,
    unregister
  };
}

test("names with no native meaning are held and cannot be removed", async () => {
  const permissions = new ChromePermissions({ file: fakeFile() });
  assert.equal(await permissions.contains({ permissions: ["tabs", "storage"] }), true);
  assert.equal(await permissions.request({ permissions: ["tabs"] }), true);
  assert.equal(await permissions.remove({ permissions: ["tabs"] }), false);
  assert.equal(await permissions.remove({ origins: ["https://example.com/*"] }), false);
});

test("an unknown name or a bad origin rejects", async () => {
  const permissions = new ChromePermissions({ file: fakeFile() });
  await assert.rejects(permissions.contains({ permissions: ["nope"] }), /not a valid permission/u);
  await assert.rejects(permissions.request({ permissions: ["nope"] }), /not a valid permission/u);
  await assert.rejects(permissions.contains({ origins: ["example.com"] }), /not a valid match pattern/u);
});

test("every origin is held", async () => {
  const permissions = new ChromePermissions({ file: fakeFile() });
  assert.equal(await permissions.contains({ origins: ["https://*.example.com/*", "<all_urls>"] }), true);
  assert.equal((await permissions.getAll()).origins.includes("<all_urls>"), true);
});

test("a native permission is requested through the prompt, saved and announced", async () => {
  const file = fakeFile();
  const geolocation = fakeProvider({
    name: PermissionName.GEOLOCATION,
    initial: PermissionStateName.PROMPT,
    onPrompt: PermissionStateName.GRANTED
  });
  const permissions = new ChromePermissions({ file });
  const added: unknown[] = [];
  permissions.onAdded.addListener(set => added.push(set));
  assert.equal(await permissions.contains({ permissions: ["geolocation"] }), false);
  assert.equal(await permissions.request({ permissions: ["geolocation"] }), true);
  assert.equal(geolocation.box.prompts, 1);
  assert.equal(await permissions.contains({ permissions: ["geolocation"] }), true);
  assert.deepEqual(added, [{
    permissions: ["geolocation"],
    origins: []
  }]);
  assert.equal(file.state.text, JSON.stringify({ granted: ["geolocation"] }));
  assert.equal((await permissions.getAll()).permissions.includes("geolocation"), true);
  geolocation.unregister();
});

test("a grant survives a new instance, and the OS taking it back wins", async () => {
  const file = fakeFile(JSON.stringify({ granted: ["videoCapture"] }));
  const camera = fakeProvider({
    name: PermissionName.CAMERA,
    initial: PermissionStateName.GRANTED
  });
  const permissions = new ChromePermissions({ file });
  assert.equal(await permissions.contains({ permissions: ["videoCapture"] }), true);
  camera.box.state = PermissionStateName.DENIED;
  assert.equal(await permissions.contains({ permissions: ["videoCapture"] }), false);
  camera.unregister();
});

test("a denied permission is refused; openSettings opens its page", async () => {
  const opened: string[] = [];
  const microphone = fakeProvider({
    name: PermissionName.MICROPHONE,
    initial: PermissionStateName.DENIED
  });
  const file = fakeFile();
  const permissions = new ChromePermissions({
    file,
    openSettings: url => opened.push(url)
  });
  assert.equal(await permissions.request({ permissions: ["audioCapture"] }), false);
  assert.deepEqual(opened, []);
  assert.equal(
    await permissions.request({
      permissions: ["audioCapture"],
      openSettings: true
    }), false
  );
  assert.deepEqual(opened, ["ms-settings:privacy-microphone"]);
  assert.equal(file.state.writes, 0);
  microphone.unregister();
});

test("a permission whose API is not installed is refused", async () => {
  const permissions = new ChromePermissions({ file: fakeFile() });
  assert.equal(await permissions.request({ permissions: ["bluetooth"] }), false);
});

test("all must be allowed or none is saved", async () => {
  const file = fakeFile();
  const camera = fakeProvider({
    name: PermissionName.CAMERA,
    initial: PermissionStateName.GRANTED
  });
  const microphone = fakeProvider({
    name: PermissionName.MICROPHONE,
    initial: PermissionStateName.DENIED
  });
  const permissions = new ChromePermissions({ file });
  assert.equal(await permissions.request({ permissions: ["videoCapture", "audioCapture"] }), false);
  assert.equal(file.state.writes, 0);
  camera.unregister();
  microphone.unregister();
});

test("remove forgets a grant and announces it once", async () => {
  const file = fakeFile(JSON.stringify({ granted: ["clipboardRead"] }));
  const clipboard = fakeProvider({
    name: PermissionName.CLIPBOARD_READ,
    initial: PermissionStateName.GRANTED
  });
  const permissions = new ChromePermissions({ file });
  const removed: unknown[] = [];
  permissions.onRemoved.addListener(set => removed.push(set));
  assert.equal(await permissions.remove({ permissions: ["clipboardRead"] }), true);
  assert.equal(await permissions.remove({ permissions: ["clipboardRead"] }), true);
  assert.deepEqual(removed, [{
    permissions: ["clipboardRead"],
    origins: []
  }]);
  assert.equal(await permissions.contains({ permissions: ["clipboardRead"] }), false);
  assert.equal(file.state.text, JSON.stringify({ granted: [] }));
  clipboard.unregister();
});

test("a damaged file starts empty", async () => {
  const permissions = new ChromePermissions({ file: fakeFile("{not json") });
  assert.deepEqual((await permissions.getAll()).permissions.includes("geolocation"), false);
});
