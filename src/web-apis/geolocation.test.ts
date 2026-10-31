import assert from "node:assert/strict";
import { test } from "node:test";

// navigator.geolocation over a stand-in for Windows: the success and error
// paths with the spec's codes, watches, the permission mapping, and the
// WinUI extras. The real Geolocator is for test/web-apis.test.ts.

const {
  GeolocationAccess,
  GeolocationFailure,
  GeolocationFailureReason,
  GeolocationPosition,
  GeolocationPositionError,
  installGeolocation
} = await import("./geolocation.ts");
const { installPermissions } = await import("./permissions.ts");

type Backend = NonNullable<Parameters<typeof installGeolocation>[0]>["backend"];
type Fix = Awaited<ReturnType<NonNullable<Backend>["getFix"]>>;
type Request = Parameters<NonNullable<Backend>["getFix"]>[0];
type Access = (typeof GeolocationAccess)[keyof typeof GeolocationAccess];

const FIX = {
  latitude: 32.08,
  longitude: 34.78,
  altitude: null,
  accuracy: 25,
  altitudeAccuracy: null,
  heading: null,
  speed: 1.5,
  timestamp: 1_700_000_000_000,
  positionSource: "wifi",
  isRemoteSource: false,
  satelliteData: null,
  civicAddress: {
    country: "IL",
    state: "",
    city: "Tel Aviv",
    postalCode: ""
  }
} satisfies Fix;

function fakeBackend({ access = GeolocationAccess.ALLOWED, failure }: {
  access?: Access;
  failure?: Error;
} = {}) {
  const requests: Request[] = [];
  const stopped: number[] = [];
  let emit: ((fix: Fix) => void) | undefined;
  let fail: ((error: InstanceType<typeof GeolocationFailure>) => void) | undefined;
  const backend = {
    requestAccess: () => Promise.resolve(access),
    getFix(request) {
      requests.push(request);
      return failure === undefined ? Promise.resolve(FIX) : Promise.reject(failure);
    },
    watch({ request, onFix, onFailure }) {
      requests.push(request);
      emit = onFix;
      fail = onFailure;
      return () => {
        stopped.push(requests.length);
      };
    }
  } satisfies NonNullable<Backend>;
  return {
    backend,
    requests,
    stopped,
    emit: (fix: Fix) => emit?.(fix),
    fail: (error: InstanceType<typeof GeolocationFailure>) => fail?.(error)
  };
}

function settle() {
  return new Promise(resolve => {
    setImmediate(resolve);
  });
}

function current(options?: PositionOptions) {
  return new Promise<unknown>(resolve => {
    navigator.geolocation.getCurrentPosition(resolve, resolve, options);
  });
}

test("getCurrentPosition gives the standard shape and the extras", async () => {
  const fake = fakeBackend();
  const uninstall = installGeolocation({ backend: fake.backend });
  const found = await current({
    enableHighAccuracy: true,
    maximumAge: 5,
    timeout: 100
  });
  assert.ok(found instanceof GeolocationPosition);
  assert.equal(found.coords.latitude, 32.08);
  assert.equal(found.coords.altitude, null);
  assert.equal(found.timestamp, 1_700_000_000_000);
  assert.deepEqual(Object.keys(found.toJSON().coords), [
    "latitude", "longitude", "altitude", "accuracy", "altitudeAccuracy", "heading", "speed"
  ]);
  assert.equal(found.positionSource, "wifi");
  assert.equal(found.civicAddress?.city, "Tel Aviv");
  assert.equal(fake.requests[0]?.isHighAccuracy, true);
  assert.equal(fake.requests[0]?.maximumAgeMilliseconds, 5);
  assert.equal(fake.requests[0]?.timeoutMilliseconds, 100);
  uninstall();
});

test("the extra options reach the backend", async () => {
  const fake = fakeBackend();
  const uninstall = installGeolocation({ backend: fake.backend });
  await current({
    desiredAccuracyInMeters: 5,
    reportInterval: 1000,
    movementThreshold: 3
  });
  assert.equal(fake.requests[0]?.desiredAccuracyInMeters, 5);
  assert.equal(fake.requests[0]?.reportInterval, 1000);
  assert.equal(fake.requests[0]?.movementThreshold, 3);
  uninstall();
});

test("a denied access calls the error with code 1", async () => {
  const fake = fakeBackend({ access: GeolocationAccess.DENIED });
  const uninstall = installGeolocation({ backend: fake.backend });
  const error = await current();
  assert.ok(error instanceof GeolocationPositionError);
  assert.equal(error.code, GeolocationPositionError.PERMISSION_DENIED);
  assert.equal(fake.requests.length, 0);
  uninstall();
});

test("failures become codes 1, 2 and 3", async () => {
  const cases = [
    {
      failure: new GeolocationFailure({
        reason: GeolocationFailureReason.TIMEOUT,
        message: "slow"
      }),
      code: 3
    },
    {
      failure: new Error("boom"),
      code: 2
    },
    {
      failure: new Error("Access is denied. 0x80070005"),
      code: 1
    }
  ];
  for (const { failure, code } of cases) {
    const uninstall = installGeolocation({ backend: fakeBackend({ failure }).backend });
    const error = await current();
    assert.ok(error instanceof GeolocationPositionError);
    assert.equal(error.code, code);
    uninstall();
  }
});

test("a missing callback is a TypeError", () => {
  const uninstall = installGeolocation({ backend: fakeBackend().backend });
  assert.throws(() => {
    // @ts-expect-error the call is wrong on purpose
    navigator.geolocation.getCurrentPosition(undefined);
  }, TypeError);
  uninstall();
});

test("watchPosition reports each fix until clearWatch", async () => {
  const fake = fakeBackend();
  const uninstall = installGeolocation({ backend: fake.backend });
  const seen: number[] = [];
  const failures: number[] = [];
  const id = navigator.geolocation.watchPosition(
    value => seen.push(value.coords.latitude),
    value => failures.push(value.code)
  );
  assert.equal(typeof id, "number");
  await settle();
  fake.emit({
    ...FIX,
    latitude: 1
  });
  fake.emit({
    ...FIX,
    latitude: 2
  });
  fake.fail(
    new GeolocationFailure({
      reason: GeolocationFailureReason.UNAVAILABLE,
      message: "lost"
    })
  );
  navigator.geolocation.clearWatch(id);
  assert.deepEqual(seen, [1, 2]);
  assert.deepEqual(failures, [2]);
  assert.equal(fake.stopped.length, 1);
  navigator.geolocation.clearWatch(id);
  assert.equal(fake.stopped.length, 1);
  uninstall();
});

test("clearing a watch before access is answered never starts it", async () => {
  const fake = fakeBackend();
  const uninstall = installGeolocation({ backend: fake.backend });
  const id = navigator.geolocation.watchPosition(() => undefined);
  navigator.geolocation.clearWatch(id);
  await settle();
  assert.equal(fake.requests.length, 0);
  uninstall();
});

test("a denied watch reports code 1 and does not start", async () => {
  const fake = fakeBackend({ access: GeolocationAccess.DENIED });
  const uninstall = installGeolocation({ backend: fake.backend });
  const failures: number[] = [];
  navigator.geolocation.watchPosition(() => undefined, value => failures.push(value.code));
  await settle();
  assert.deepEqual(failures, [1]);
  assert.equal(fake.requests.length, 0);
  uninstall();
});

test("the geolocation permission follows the access answer", async () => {
  const fake = fakeBackend({ access: GeolocationAccess.ALLOWED });
  const uninstallPermissions = installPermissions();
  const uninstall = installGeolocation({ backend: fake.backend });
  const status = await navigator.permissions.query({ name: "geolocation" });
  assert.equal(status.state, "prompt");
  const changes: string[] = [];
  status.onchange = () => changes.push(status.state);
  await current();
  assert.deepEqual(changes, ["granted"]);
  assert.equal((await navigator.permissions.query({ name: "geolocation" })).state, "granted");
  uninstall();
  await assert.rejects(navigator.permissions.query({ name: "geolocation" }), TypeError);
  uninstallPermissions();
});

test("uninstall removes the globals and puts back the previous ones", () => {
  const before = Object.getOwnPropertyDescriptor(navigator, "geolocation");
  const uninstall = installGeolocation({ backend: fakeBackend().backend });
  assert.equal(typeof globalThis.GeolocationPositionError, "function");
  uninstall();
  assert.equal(Object.getOwnPropertyDescriptor(navigator, "geolocation"), before);
  assert.equal("GeolocationPositionError" in globalThis, false);
});
