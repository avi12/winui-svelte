import { discoverEntrypoints } from "./discover.ts";
import { extractTrayManifests } from "./extract-tray.ts";
import { TRAY_VIRTUAL_ID, trayWrapperSource } from "./tray-module.ts";
import { restartTray, trayDevelopment } from "./tray-process.ts";
import type { TrayProcessSeams } from "./tray-process.ts";
import { startTray, trayInstanceKey } from "#src/app/tray-instance.js";
import { parseTrayManifestFile, processGuidOf, trayManifestFileOf } from "#src/tray/tray-manifest.js";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

function noop() {}

function appFolder(files: readonly string[]) {
  const root = mkdtempSync(path.join(tmpdir(), "entrypoints-"));
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), "");
  }

  return root;
}

test("discovery finds main, window and tray by name, and tray/index.ts too", () => {
  const root = appFolder(["entrypoints/main.ts", "entrypoints/window.js", "entrypoints/tray/index.ts", "entrypoints/other.ts"]);
  assert.deepEqual(discoverEntrypoints(root), {
    main: path.join(root, "entrypoints", "main.ts"),
    window: path.join(root, "entrypoints", "window.js"),
    tray: path.join(root, "entrypoints", "tray", "index.ts")
  });
  rmSync(root, { recursive: true });
});

test("discovery finds a tray written as markup, and refuses two trays", () => {
  const root = appFolder(["entrypoints/tray.svelte"]);
  assert.deepEqual(discoverEntrypoints(root), { tray: path.join(root, "entrypoints", "tray.svelte") });
  rmSync(root, { recursive: true });
  const both = appFolder(["entrypoints/tray.svelte", "entrypoints/tray.ts"]);
  assert.throws(() => discoverEntrypoints(both), /tray entrypoint is declared twice/u);
  rmSync(both, { recursive: true });
  const window = appFolder(["entrypoints/window.svelte"]);
  assert.deepEqual(discoverEntrypoints(window), {});
  rmSync(window, { recursive: true });
});

test("discovery of a folder with no entrypoints is empty", () => {
  const root = appFolder(["main.ts"]);
  assert.deepEqual(discoverEntrypoints(root), {});
  rmSync(root, { recursive: true });
});

test("extraction reads the literals and never runs the file", () => {
  const hostile = `
    import { Windows } from "#winui/windows/never-resolved";
    import { defineTray } from "winui-svelte/tray/standalone";
    throw new Error("the build must not run this file");
    export default defineTray({
      icon: "icons/tray.ico",
      "tooltip": \`My app\`,
      guid: 'abc-123',
      menu: [{ id: "open", label: String(Windows) }]
    });
  `;
  assert.deepEqual(extractTrayManifests(hostile), [{
    icon: "icons/tray.ico",
    tooltip: "My app",
    guid: "abc-123"
  }]);
});

test("extraction leaves the tooltip out when there is none", () => {
  const manifest = extractTrayManifests(`export default defineTray({ icon: "a.ico", guid: "g", menu: [] });`);
  assert.deepEqual(manifest, [{
    icon: "a.ico",
    guid: "g"
  }]);
});

test("extraction rejects an icon or guid that is not a literal, and a file that is not defineTray", () => {
  assert.throws(() => extractTrayManifests(`export default defineTray({ icon: ICON, guid: "g" });`), /string literals/u);
  assert.throws(() => extractTrayManifests(`const icon = "a"; export default defineTray({ icon, guid: "g" });`), /string literals/u);
  assert.throws(() => extractTrayManifests(`export default defineTray({ icon: \`\${a}.ico\`, guid: "g" });`), /string literals/u);
  assert.throws(() => extractTrayManifests(`export default { icon: "a", guid: "g" };`), /defineTray/u);
  assert.throws(() => extractTrayManifests(`export const tray = defineTray({ icon: "a", guid: "g" });`), /defineTray/u);
});

test("the wrapper imports the user's default export and the framework, so the user file imports none of the wiring", () => {
  const source = trayWrapperSource("/app/entrypoints/tray.ts");
  assert.match(source, /import entrypoint from "\/app\/entrypoints\/tray\.ts";/u);
  assert.match(source, /const trays = \[entrypoint\]\.flat\(\);/u);
  assert.match(source, /claimTrayInstance\(\{ guid: trays\[0\]\.guid \}\)/u);
  assert.match(source, /createStandaloneTray\(\{ \.\.\.tray, onclick: tray\.onclick \?\? tray\.onactivate \}\)/u);
  assert.equal(TRAY_VIRTUAL_ID, "virtual:winui-svelte/tray");
});

test("an array of defineTray calls gives one manifest each, in order", () => {
  const manifests = extractTrayManifests(
    `export default [
    defineTray({ icon: "a.ico", guid: "g1", tooltip: "A", menu: [] }),
    defineTray({ icon: "b.ico", guid: "g2", menu: [] })
  ];`
  );
  assert.deepEqual(manifests, [
    {
      icon: "a.ico",
      tooltip: "A",
      guid: "g1"
    },
    {
      icon: "b.ico",
      guid: "g2"
    }
  ]);
});

test("a list with a repeated guid, an empty list or a spread is refused", () => {
  assert.throws(() => extractTrayManifests(`export default [defineTray({ icon: "a", guid: "g" }), defineTray({ icon: "b", guid: "g" })];`), /guid "g"/u);
  assert.throws(() => extractTrayManifests("export default [];"), /at least one/u);
  assert.throws(() => extractTrayManifests(`export default [...others];`), /defineTray/u);
});

test("tray.json is the single manifest for one tray and { trays } for several, and the process guid is the first", () => {
  const first = {
    icon: "a.ico",
    guid: "g1"
  };
  const second = {
    icon: "b.ico",
    guid: "g2"
  };
  assert.deepEqual(trayManifestFileOf([first]), first);
  assert.deepEqual(trayManifestFileOf([first, second]), { trays: [first, second] });
  assert.deepEqual(parseTrayManifestFile(trayManifestFileOf([first])), [first]);
  assert.equal(processGuidOf(parseTrayManifestFile({ trays: [first, second] })), "g1");
});

function fakeSeams({ stale, imageName }: {
  stale?: number | undefined;
  imageName?: string | undefined;
}) {
  const calls: string[] = [];
  const seams: TrayProcessSeams = {
    readPid: () => stale,
    savePid: pid => calls.push(`save ${pid}`),
    imageNameOf(pid) {
      calls.push(`image ${pid}`);
      return imageName;
    },
    kill: pid => calls.push(`kill ${pid}`),
    spawn() {
      calls.push("spawn");
      return 99;
    }
  };
  return {
    seams,
    calls
  };
}

test("a restart stops the stale tray (a Node process) and saves the new pid", () => {
  const { seams, calls } = fakeSeams({
    stale: 7,
    imageName: "Node.exe"
  });
  restartTray(seams);
  assert.deepEqual(calls, ["image 7", "kill 7", "spawn", "save 99"]);
});

test("a restart never kills a pid that is not a Node process or no longer runs", () => {
  for (const imageName of ["chrome.exe", undefined]) {
    const { seams, calls } = fakeSeams({
      stale: 7,
      imageName
    });
    restartTray(seams);
    assert.deepEqual(calls, ["image 7", "spawn", "save 99"]);
  }
});

test("a first start has no pid to stop", () => {
  const { seams, calls } = fakeSeams({});
  restartTray(seams);
  assert.deepEqual(calls, ["spawn", "save 99"]);
});

test("a change to the tray rebuilds and restarts, another file does nothing, and changes during a build fold into one more", async () => {
  const calls: string[] = [];
  let release: () => void = noop;
  const development = trayDevelopment({
    build() {
      calls.push("build");
      return new Promise<void>(resolve => {
        release = resolve;
      });
    },
    restart: () => calls.push("restart"),
    isTrayFile: file => file === "tray.ts"
  });
  await development.changed("other.ts");
  assert.deepEqual(calls, []);
  const first = development.changed("tray.ts");
  void development.changed("tray.ts");
  void development.changed("tray.ts");
  release();
  await new Promise(resolve => setImmediate(resolve));
  release();
  await first;
  assert.deepEqual(calls, ["build", "restart", "build", "restart"]);
});

test("startTray hands the guid-derived key and the tray.js command to the activation", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "start-tray-"));
  writeFileSync(
    path.join(directory, "tray.json"), JSON.stringify({
      icon: "tray.ico",
      guid: "g-1"
    })
  );
  const seen: unknown[] = [];
  const isRunning = await startTray({
    directory,
    activate(options) {
      seen.push(options);
      return Promise.resolve(false);
    }
  });
  assert.equal(isRunning, false);
  assert.deepEqual(seen, [{
    key: trayInstanceKey("g-1"),
    activation: {
      arguments: [],
      workingDirectory: directory
    },
    launch: {
      command: process.execPath,
      arguments: [path.join(directory, "tray.js")],
      workingDirectory: directory
    }
  }]);
  rmSync(directory, { recursive: true });
});

test("startTray rejects a folder with no manifest", () => {
  assert.throws(() => startTray({ directory: tmpdir() }), /tray\.json/u);
});
