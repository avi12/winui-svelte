import type { NetworkReading as Reading } from "#src/devices/network.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// navigator.connection, onLine and the online and offline events over a
// stand-in network source.

const { NetworkConnectivityLevel, NetworkCostType } = await import("#src/devices/network.js");
const { installNetwork } = await import("./network.ts");

const WIFI = {
  connectivity: NetworkConnectivityLevel.InternetAccess,
  profileName: "Home",
  costType: NetworkCostType.Unrestricted,
  isRoaming: false,
  isOverDataLimit: false,
  isApproachingDataLimit: false,
  isWifi: true,
  isMobile: false,
  signalBars: 4,
  profileNames: ["Home", "Office"]
} satisfies Reading;

const OFFLINE = {
  ...WIFI,
  connectivity: NetworkConnectivityLevel.None,
  profileName: "",
  isWifi: false,
  signalBars: null
} satisfies Reading;

function fakeSource(first: Reading) {
  let reading = first;
  let notify: (() => void) | undefined;
  let stops = 0;
  return {
    source: {
      read: () => reading,
      subscriptions: [
        (callback: () => void) => {
          notify = callback;
          return () => {
            stops += 1;
          };
        }
      ]
    },
    change(next: Reading) {
      reading = next;
      notify?.();
    },
    get stops() {
      return stops;
    }
  };
}

function immediately(work: () => void) {
  work();
}

test("wifi reads as the standard values", () => {
  const fake = fakeSource(WIFI);
  const uninstall = installNetwork({
    source: fake.source,
    deliver: immediately
  });
  const { connection } = navigator;
  assert.equal(navigator.onLine, true);
  assert.equal(connection.type, "wifi");
  assert.equal(connection.effectiveType, "4g");
  assert.equal(connection.rtt, 50);
  assert.equal(connection.downlink, 10);
  assert.equal(connection.saveData, false);
  uninstall();
});

test("a metered connection asks to save data", () => {
  const fake = fakeSource({
    ...WIFI,
    costType: NetworkCostType.Variable
  });
  const uninstall = installNetwork({
    source: fake.source,
    deliver: immediately
  });
  assert.equal(navigator.connection.saveData, true);
  uninstall();
});

test("cellular signal maps to the effective type", () => {
  const cellular = {
    ...WIFI,
    isWifi: false,
    isMobile: true
  };
  const expected = [[1, "2g"], [2, "3g"], [4, "4g"]] as const;
  for (const [signalBars, effectiveType] of expected) {
    const fake = fakeSource({
      ...cellular,
      signalBars
    });
    const uninstall = installNetwork({
      source: fake.source,
      deliver: immediately
    });
    assert.equal(navigator.connection.type, "cellular");
    assert.equal(navigator.connection.effectiveType, effectiveType);
    uninstall();
  }
});

test("going offline and online fires the window events and change", () => {
  const fake = fakeSource(WIFI);
  const uninstall = installNetwork({
    source: fake.source,
    deliver: immediately
  });
  const seen: string[] = [];
  function listen(type: string) {
    globalThis.addEventListener(type, () => seen.push(type));
  }
  listen("online");
  listen("offline");
  navigator.connection.onchange = () => seen.push("change");
  fake.change(OFFLINE);
  assert.equal(navigator.onLine, false);
  assert.equal(navigator.connection.type, "none");
  fake.change(WIFI);
  assert.equal(navigator.onLine, true);
  assert.deepEqual(seen, ["change", "offline", "change", "online"]);
  uninstall();
});

test("a change of name alone does not fire change", () => {
  const fake = fakeSource(WIFI);
  const uninstall = installNetwork({
    source: fake.source,
    deliver: immediately
  });
  let changes = 0;
  navigator.connection.onchange = () => {
    changes += 1;
  };
  fake.change({
    ...WIFI,
    profileName: "Other"
  });
  assert.equal(changes, 0);
  assert.equal(navigator.connection.profileName, "Other");
  uninstall();
});

test("the WinUI extras read the connection", () => {
  const fake = fakeSource({
    ...WIFI,
    isRoaming: true,
    isOverDataLimit: true
  });
  const uninstall = installNetwork({
    source: fake.source,
    deliver: immediately
  });
  const { connection } = navigator;
  assert.equal(connection.profileName, "Home");
  assert.equal(connection.isRoaming, true);
  assert.equal(connection.isOverDataLimit, true);
  assert.equal(connection.signalBars, 4);
  assert.equal(connection.costType, NetworkCostType.Unrestricted);
  assert.deepEqual(connection.profileNames, ["Home", "Office"]);
  uninstall();
});

test("uninstall stops listening and takes everything away", () => {
  const fake = fakeSource(WIFI);
  const uninstall = installNetwork({
    source: fake.source,
    deliver: immediately
  });
  uninstall();
  assert.equal(fake.stops, 1);
  assert.equal("connection" in navigator, false);
  assert.equal("onLine" in navigator, false);
  assert.equal("addEventListener" in globalThis, false);
});
