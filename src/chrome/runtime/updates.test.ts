import type { PackageUpdateState as PackageUpdateStateValue } from "#src/store/states.js";
import type { StoreBackend } from "#src/store/types.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const { RuntimeUpdates, UpdateCheckStatus } = await import("./updates.ts");
const { PackageUpdateState, StartupState, UpdateState } = await import("#src/store/states.js");

const CURRENT = "1.0.0";

function feedFetch() {
  return Promise.resolve(
    Response.json({
      releases: [{
        version: CURRENT,
        file: "app-1.0.0.zip",
        sha256: "00",
        size: 1
      }]
    })
  );
}

test("answers no_update without a source", async () => {
  const updates = new RuntimeUpdates({
    source: undefined,
    currentVersion: CURRENT
  });
  assert.equal((await updates.requestUpdateCheck()).status, UpdateCheckStatus.NO_UPDATE);
  assert.equal(updates.startStaged(), false);
});

test("answers no_update when current, then throttled", async () => {
  const updates = new RuntimeUpdates({
    source: {
      root: "unused",
      feedUrl: "http://host/releases.json",
      executable: "app.exe",
      fetch: feedFetch
    },
    currentVersion: CURRENT
  });
  assert.equal((await updates.requestUpdateCheck()).status, UpdateCheckStatus.NO_UPDATE);
  assert.equal((await updates.requestUpdateCheck()).status, UpdateCheckStatus.THROTTLED);
});

test("in a package the Store is asked, and an update is installed silently", async () => {
  let installed = 0;
  const seen: unknown[] = [];
  const backend = {
    hasPackage: () => true,
    packageInfo: () => ({
      name: "Avi.App",
      fullName: "Avi.App_1.2.3.0_x64__abc",
      familyName: "Avi.App_abc",
      publisher: "CN=Avi",
      version: "1.2.3.0",
      installedPath: "C:/Program Files/WindowsApps/Avi.App",
      isDevelopmentMode: false,
      isFromStore: true
    }),
    license: () => Promise.resolve({
      isActive: true,
      isTrial: false,
      skuStoreId: "9ABC",
      expirationDate: null
    }),
    onOfflineLicensesChanged: () => () => undefined,
    onPackageProgress: () => () => undefined,
    startupTask: () => Promise.resolve({
      state: StartupState.enabled,
      enable: () => Promise.resolve(StartupState.enabled),
      disable: () => undefined
    }),
    poll: () => () => undefined,
    checkPackageUpdate: () => Promise.resolve(PackageUpdateState.noUpdates),
    checkUpdates: () => Promise.resolve({
      updates: [{
        packageFamilyName: "x",
        isMandatory: false
      }],
      hasMandatory: false,
      install() {
        installed += 1;
        return Promise.resolve({
          state: UpdateState.completed,
          packages: []
        });
      }
    })
  } satisfies StoreBackend;
  const updates = new RuntimeUpdates({
    source: undefined,
    currentVersion: CURRENT,
    storeBackend: backend
  });
  updates.onUpdateAvailable.addListener(details => seen.push(details));
  assert.equal((await updates.requestUpdateCheck()).status, UpdateCheckStatus.UPDATE_AVAILABLE);
  assert.equal(installed, 1);
  assert.deepEqual(seen, [{}]);
  assert.equal(updates.startStaged(), false);
});

function sideloadedBackend({ availability, isFromStore = false }: {
  availability: PackageUpdateStateValue;
  isFromStore?: boolean;
}) {
  return {
    hasPackage: () => true,
    packageInfo: () => ({
      name: "Avi.App",
      fullName: "Avi.App_1.2.3.0_x64__abc",
      familyName: "Avi.App_abc",
      publisher: "CN=Avi",
      version: "1.2.3.0",
      installedPath: "C:/Program Files/WindowsApps/Avi.App",
      isDevelopmentMode: false,
      isFromStore
    }),
    license: () => Promise.reject(new Error("unused")),
    onOfflineLicensesChanged: () => () => undefined,
    onPackageProgress: () => () => undefined,
    startupTask: () => Promise.reject(new Error("unused")),
    poll: () => () => undefined,
    checkPackageUpdate: () => Promise.resolve(availability),
    checkUpdates: () => Promise.reject(new Error("the Store must not be asked"))
  } satisfies StoreBackend;
}

test("a sideloaded package with an update opens its app installer", async () => {
  const opened: string[] = [];
  const seen: unknown[] = [];
  const updates = new RuntimeUpdates({
    source: {
      appInstallerUrl: "https://host/app.appinstaller?a=1"
    },
    currentVersion: CURRENT,
    storeBackend: sideloadedBackend({ availability: PackageUpdateState.available }),
    openUri(url) {
      opened.push(url);
      return Promise.resolve(true);
    }
  });
  updates.onUpdateAvailable.addListener(details => seen.push(details));
  assert.equal((await updates.requestUpdateCheck()).status, UpdateCheckStatus.UPDATE_AVAILABLE);
  assert.deepEqual(opened, [`ms-appinstaller:?source=${encodeURIComponent("https://host/app.appinstaller?a=1")}`]);
  assert.deepEqual(seen, [{}]);
});

test("a sideloaded package answers no_update when current or without an app installer", async () => {
  function openUri() {
    return Promise.reject(new Error("nothing to open"));
  }
  const current = new RuntimeUpdates({
    source: {
      appInstallerUrl: "https://host/app.appinstaller"
    },
    currentVersion: CURRENT,
    storeBackend: sideloadedBackend({ availability: PackageUpdateState.noUpdates }),
    openUri
  });
  assert.equal((await current.requestUpdateCheck()).status, UpdateCheckStatus.NO_UPDATE);

  const unconfigured = new RuntimeUpdates({
    source: undefined,
    currentVersion: CURRENT,
    storeBackend: sideloadedBackend({ availability: PackageUpdateState.required }),
    openUri
  });
  assert.equal((await unconfigured.requestUpdateCheck()).status, UpdateCheckStatus.NO_UPDATE);
});
