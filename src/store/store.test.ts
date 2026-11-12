import type { PackageUpdateState as PackageUpdateStateValue } from "./states.ts";
import type { InstallOptions, PackageProgress, StoreBackend, UpdateCheck } from "./types.ts";
import { roInitialize } from "@microsoft/dynwinrt";
import assert from "node:assert/strict";
import { test } from "node:test";

// The store modules over a stand-in for Windows (the call shapes and events),
// and over the real process, which is unpackaged under node.exe: every call
// that needs an identity must answer "no package", and nothing here installs,
// downloads or changes state.

roInitialize();

const { checkForUpdates } = await import("./updates.ts");
const { checkPackageUpdate } = await import("./package-update.ts");
const { getAppLicense, watchLicense } = await import("./license.ts");
const { getPackageInfo, hasPackage } = await import("./identity.ts");
const { PackageProgressEvent, watchPackages } = await import("./packages.ts");
const { getStartupTask } = await import("./startup.ts");
const { PackageUpdateState, StartupState, UpdateState, updateStateOf, startupStateOf } = await import("./states.ts");
const { hasPackageIdentity } = await import("./windows-identity.ts");

const LICENSE = {
  isActive: true,
  isTrial: false,
  skuStoreId: "9ABC",
  expirationDate: null
};
const POLL_MILLISECONDS = 5;

function settle() {
  return new Promise(resolve => setImmediate(resolve));
}

function fakeBackend({ isPackaged, check, availability = PackageUpdateState.noUpdates }: {
  isPackaged: boolean;
  check?: UpdateCheck;
  availability?: PackageUpdateStateValue;
}) {
  const calls: string[] = [];
  let license = LICENSE;
  const hooks = {
    license() {},
    package(_progress: PackageProgress) {},
    tick() {}
  };
  let stops = 0;
  const backend = {
    hasPackage: () => isPackaged,
    packageInfo: () => ({
      name: "Avi.App",
      fullName: "Avi.App_1.2.3.0_x64__abc",
      familyName: "Avi.App_abc",
      publisher: "CN=Avi",
      version: "1.2.3.0",
      installedPath: "C:\\Program Files\\WindowsApps\\Avi.App",
      isDevelopmentMode: false,
      isFromStore: true
    }),
    async license() {
      calls.push("license");
      return license;
    },
    onOfflineLicensesChanged(callback) {
      hooks.license = callback;
      return () => {
        stops += 1;
      };
    },
    async checkUpdates() {
      calls.push("checkUpdates");
      assert.ok(check !== undefined);
      return check;
    },
    onPackageProgress(callback) {
      hooks.package = callback;
      return () => {
        stops += 1;
      };
    },
    async checkPackageUpdate() {
      calls.push("checkPackageUpdate");
      return availability;
    },
    async startupTask(taskId: string) {
      calls.push(`startupTask:${taskId}`);
      return {
        state: StartupState.disabledByUser,
        enable: async () => StartupState.enabled,
        disable: () => undefined
      };
    },
    poll({ tick: onTick }) {
      hooks.tick = onTick;
      return () => {
        stops += 1;
      };
    }
  } satisfies StoreBackend;
  return {
    backend,
    calls,
    changeLicense(next: typeof LICENSE) {
      license = next;
    },
    raiseLicense: () => hooks.license(),
    raisePackage: (progress: PackageProgress) => hooks.package(progress),
    runPoll: () => hooks.tick(),
    get stops() {
      return stops;
    }
  };
}

test("outside a package every call answers no package and never throws", async () => {
  const fake = fakeBackend({ isPackaged: false });
  assert.equal(hasPackage(fake), false);
  assert.equal(getPackageInfo(fake), null);
  assert.deepEqual(await getAppLicense(fake), { hasPackage: false });
  assert.deepEqual(await checkForUpdates(fake), { hasPackage: false });
  assert.deepEqual(
    await getStartupTask({
      taskId: "Main",
      backend: fake.backend
    }), { hasPackage: false }
  );
  assert.deepEqual(fake.calls, []);
});

test("inside a package the calls reach Windows and wrap the value", async () => {
  const fake = fakeBackend({ isPackaged: true });
  assert.equal(getPackageInfo(fake)?.version, "1.2.3.0");
  assert.deepEqual(await getAppLicense(fake), {
    hasPackage: true,
    value: LICENSE
  });
  const reply = await getStartupTask({
    taskId: "Main",
    backend: fake.backend
  });
  assert.ok(reply.hasPackage);
  assert.equal(reply.value.state, StartupState.disabledByUser);
  assert.equal(await reply.value.enable(), StartupState.enabled);
  assert.deepEqual(fake.calls, ["license", "startupTask:Main"]);
});

test("an update check carries the mandatory flag and installs only on request", async () => {
  const progress: number[] = [];
  const check = {
    updates: [{
      packageFamilyName: "Avi.App_abc",
      isMandatory: true
    }],
    hasMandatory: true,
    async install({ onprogress }: InstallOptions = {}) {
      onprogress?.({
        packageFamilyName: "Avi.App_abc",
        state: UpdateState.downloading,
        packageDownloadProgress: 0.5,
        totalDownloadProgress: 0.5
      });
      return {
        state: UpdateState.completed,
        packages: []
      };
    }
  } satisfies UpdateCheck;
  const fake = fakeBackend({
    isPackaged: true,
    check
  });
  const reply = await checkForUpdates(fake);
  assert.ok(reply.hasPackage);
  assert.equal(reply.value.hasMandatory, true);
  assert.deepEqual(fake.calls, ["checkUpdates"]);
  const outcome = await reply.value.install({ onprogress: update => progress.push(update.totalDownloadProgress) });
  assert.equal(outcome.state, UpdateState.completed);
  assert.deepEqual(progress, [0.5]);
});

test("the licence watcher raises offlinelicenseschanged and stops on close", () => {
  const fake = fakeBackend({ isPackaged: true });
  const watcher = watchLicense({ backend: fake.backend });
  let raised = 0;
  watcher.onofflinelicenseschanged = () => {
    raised += 1;
  };
  fake.raiseLicense();
  assert.equal(raised, 1);
  watcher.onofflinelicenseschanged = null;
  fake.raiseLicense();
  assert.equal(raised, 1);
  watcher.close();
  assert.equal(fake.stops, 1);
});

test("polling raises the event once, when the licence differs from the last read", async () => {
  const fake = fakeBackend({ isPackaged: true });
  const watcher = watchLicense({
    backend: fake.backend,
    pollMilliseconds: POLL_MILLISECONDS
  });
  let raised = 0;
  watcher.addEventListener("offlinelicenseschanged", () => {
    raised += 1;
  });
  fake.runPoll();
  await settle();
  assert.equal(raised, 0, "the first read is the baseline");
  fake.changeLicense({
    ...LICENSE,
    isActive: false
  });
  fake.runPoll();
  await settle();
  fake.runPoll();
  await settle();
  assert.equal(raised, 1);
  watcher.close();
  assert.equal(fake.stops, 2);
});

test("a package watcher raises packageupdating with the progress", () => {
  const fake = fakeBackend({ isPackaged: true });
  const watcher = watchPackages({ backend: fake.backend });
  const seen: number[] = [];
  watcher.onpackageupdating = event => {
    assert.ok(event instanceof PackageProgressEvent);
    seen.push(event.progress.progress);
  };
  fake.raisePackage({
    stage: "updating",
    activityId: "a",
    packageFullName: "Avi.App_1.2.4.0_x64__abc",
    progress: 40,
    isComplete: false,
    errorCode: 0
  });
  fake.raisePackage({
    stage: "staging",
    activityId: "a",
    packageFullName: "Avi.App_1.2.4.0_x64__abc",
    progress: 10,
    isComplete: false,
    errorCode: 0
  });
  assert.deepEqual(seen, [40]);
  watcher.close();
  assert.equal(fake.stops, 1);
});

test("Windows numbers map to the closed sets, and strangers to the fallback", () => {
  assert.equal(updateStateOf(UpdateState.deploying), UpdateState.deploying);
  assert.equal(updateStateOf(99), UpdateState.otherError);
  assert.equal(startupStateOf(StartupState.enabledByPolicy), StartupState.enabledByPolicy);
  assert.equal(startupStateOf("x"), StartupState.disabled);
});

test("node.exe has no package identity, and the real calls say so", async () => {
  assert.equal(hasPackageIdentity(), false);
  assert.equal(hasPackage(), false);
  assert.equal(getPackageInfo(), null);
  assert.deepEqual(await getAppLicense(), { hasPackage: false });
  assert.deepEqual(await checkForUpdates(), { hasPackage: false });
  assert.deepEqual(await getStartupTask({ taskId: "Main" }), { hasPackage: false });
  const licenses = watchLicense({ pollMilliseconds: POLL_MILLISECONDS });
  const packages = watchPackages();
  assert.equal(licenses.hasPackage, false);
  assert.equal(packages.hasPackage, false);
  licenses.close();
  packages.close();
});

test("the package update answer is no package outside one, else the availability", async () => {
  const outside = fakeBackend({ isPackaged: false });
  assert.deepEqual(await checkPackageUpdate(outside), { hasPackage: false });
  assert.deepEqual(outside.calls, []);

  const inside = fakeBackend({
    isPackaged: true,
    availability: PackageUpdateState.available
  });
  assert.deepEqual(await checkPackageUpdate(inside), {
    hasPackage: true,
    value: PackageUpdateState.available
  });
});
