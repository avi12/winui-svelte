import type { DisplayAreaInfo } from "#src/devices/display.js";
import { DisplayMonitorConnectionKind } from "#src/devices/display.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// screen, devicePixelRatio and getScreenDetails over stand-in display areas.

const { installScreen, ScreenDetails } = await import("./screen.ts");
const { installPermissions, Permissions } = await import("./permissions.ts");

const MAIN = {
  id: 1n,
  isPrimary: true,
  outerBounds: {
    x: 0,
    y: 0,
    width: 3840,
    height: 2160
  },
  workArea: {
    x: 0,
    y: 0,
    width: 3840,
    height: 2100
  }
} satisfies DisplayAreaInfo;

const SIDE = {
  id: 2n,
  isPrimary: false,
  outerBounds: {
    x: 3840,
    y: 0,
    width: 1080,
    height: 1920
  },
  workArea: {
    x: 3840,
    y: 0,
    width: 1080,
    height: 1880
  }
} satisfies DisplayAreaInfo;

function immediately(work: () => void) {
  work();
}

function fakeBackend({ areas, scale = 2 }: {
  areas: DisplayAreaInfo[];
  scale?: number;
}) {
  let current = areas;
  let notify: (() => void) | undefined;
  let stops = 0;
  return {
    backend: {
      source: {
        list: () => current,
        subscriptions: [
          (callback: () => void) => {
            notify = callback;
            return () => {
              stops += 1;
            };
          }
        ]
      },
      scale: () => scale,
      monitors: () => Promise.resolve([])
    },
    set(next: DisplayAreaInfo[]) {
      current = next;
      notify?.();
    },
    get stops() {
      return stops;
    }
  };
}

test("screen sizes are CSS pixels: device pixels over the scale", () => {
  const fake = fakeBackend({ areas: [MAIN] });
  const uninstall = installScreen({
    backend: fake.backend,
    deliver: immediately
  });
  assert.equal(screen.width, 1920);
  assert.equal(screen.height, 1080);
  assert.equal(screen.availWidth, 1920);
  assert.equal(screen.availHeight, 1050);
  assert.equal(screen.colorDepth, 24);
  assert.equal(screen.pixelDepth, 24);
  assert.equal(globalThis.devicePixelRatio, 2);
  assert.equal(screen.orientation.type, "landscape-primary");
  assert.equal(screen.orientation.angle, 0);
  uninstall();
  assert.equal("screen" in globalThis, false);
  assert.equal("devicePixelRatio" in globalThis, false);
});

test("a portrait primary display and a changing orientation fire change", () => {
  const fake = fakeBackend({ areas: [MAIN] });
  const uninstall = installScreen({
    backend: fake.backend,
    deliver: immediately
  });
  const seen: string[] = [];
  screen.orientation.onchange = () => seen.push(screen.orientation.type);
  fake.set([{
    ...MAIN,
    outerBounds: {
      x: 0,
      y: 0,
      width: 2160,
      height: 3840
    }
  }]);
  assert.deepEqual(seen, ["portrait-primary"]);
  fake.set([{
    ...MAIN,
    outerBounds: {
      x: 0,
      y: 0,
      width: 2160,
      height: 3840
    }
  }]);
  assert.deepEqual(seen, ["portrait-primary"]);
  uninstall();
});

test("the orientation cannot be locked", async () => {
  const fake = fakeBackend({ areas: [MAIN] });
  const uninstall = installScreen({
    backend: fake.backend,
    deliver: immediately
  });
  await assert.rejects(screen.orientation.lock("portrait"), { name: "NotSupportedError" });
  assert.doesNotThrow(() => screen.orientation.unlock());
  uninstall();
});

test("getScreenDetails lists every display with its geometry", async () => {
  const fake = fakeBackend({ areas: [MAIN, SIDE] });
  const uninstall = installScreen({
    backend: fake.backend,
    deliver: immediately
  });
  assert.equal(screen.isExtended, true);
  const details = await getScreenDetails();
  assert.ok(details instanceof ScreenDetails);
  assert.equal(details.screens.length, 2);
  assert.equal(details.currentScreen?.isPrimary, true);
  const side = details.screens[1];
  assert.equal(side?.left, 1920);
  assert.equal(side?.width, 540);
  assert.equal(side?.height, 960);
  assert.equal(side?.availHeight, 940);
  assert.equal(side?.devicePixelRatio, 2);
  assert.equal(side?.label, "Display 2");
  assert.equal(side?.displayId, "2");
  uninstall();
});

test("screenschange fires when a display is attached", async () => {
  const fake = fakeBackend({ areas: [MAIN] });
  const uninstall = installScreen({
    backend: fake.backend,
    deliver: immediately
  });
  const details = await getScreenDetails();
  const seen: string[] = [];
  details.onscreenschange = () => seen.push(`screens:${details.screens.length}`);
  details.oncurrentscreenchange = () => seen.push("current");
  fake.set([MAIN, SIDE]);
  fake.set([MAIN, SIDE]);
  assert.deepEqual(seen, ["screens:2"]);
  fake.set([{
    ...SIDE,
    isPrimary: true
  }]);
  assert.deepEqual(seen, ["screens:2", "screens:1", "current"]);
  uninstall();
});

test("the monitors extra carries what EDID says, and a failure leaves it empty", async () => {
  const fake = fakeBackend({ areas: [MAIN] });
  const monitor = {
    id: "m1",
    name: "Dell",
    connectionKind: DisplayMonitorConnectionKind.Internal,
    nativeWidth: 3840,
    nativeHeight: 2160,
    physicalWidthInches: 27,
    physicalHeightInches: 15,
    rawDpiX: 163,
    rawDpiY: 163,
    maxLuminanceInNits: 400
  };
  const uninstall = installScreen({
    backend: {
      ...fake.backend,
      monitors: () => Promise.resolve([monitor])
    },
    deliver: immediately
  });
  assert.deepEqual((await getScreenDetails()).monitors, [monitor]);
  uninstall();
  const failing = installScreen({
    backend: {
      ...fake.backend,
      monitors: () => Promise.reject(new Error("no monitors"))
    },
    deliver: immediately
  });
  assert.deepEqual((await getScreenDetails()).monitors, []);
  failing();
});

test("window-management is granted and uninstall stops listening", async () => {
  const fake = fakeBackend({ areas: [MAIN] });
  const uninstallPermissions = installPermissions();
  const uninstall = installScreen({
    backend: fake.backend,
    deliver: immediately
  });
  assert.equal((await new Permissions().query({ name: "window-management" })).state, "granted");
  uninstall();
  assert.equal(fake.stops, 1);
  uninstallPermissions();
});
