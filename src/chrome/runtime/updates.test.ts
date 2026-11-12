import type { StoreBackend } from "#src/store/types.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const { RuntimeUpdates, UpdateCheckStatus } = await import("./updates.ts");
const { StartupState, UpdateState } = await import("#src/store/states.js");

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
      isDevelopmentMode: false
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
