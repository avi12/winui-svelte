import assert from "node:assert/strict";
import { test } from "node:test";

// navigator.mediaDevices over a stand-in for Windows' capture classes:
// enumeration and labels, permissions, constraints mapped to devices and
// formats, the errors the spec names, tracks and streams, devicechange, the
// screen picker's answer, and the WinUI extras. No camera, microphone or
// screen is ever opened.

const {
  installMediaDevices,
  MediaDevices,
  MediaStream,
  MediaStreamTrack,
  OverconstrainedError
} = await import("./media-devices.ts");
const { installPermissions } = await import("./permissions.ts");

type Backend = NonNullable<Parameters<typeof installMediaDevices>[0]>["backend"];
type Request = Parameters<NonNullable<Backend>["open"]>[0];
type Access = "granted" | "denied" | "prompt";
type CaptureDevice = Awaited<ReturnType<NonNullable<Backend>["devices"]>>[number];

const FRONT = {
  id: "cam-front",
  name: "Front camera",
  groupId: "g1",
  kind: "videoinput",
  isDefault: true,
  panel: "front"
} as const;
const BACK = {
  id: "cam-back",
  name: "Back camera",
  groupId: "g2",
  kind: "videoinput",
  isDefault: false,
  panel: "back"
} as const;
const MICROPHONE = {
  id: "mic-1",
  name: "Microphone",
  groupId: "g1",
  kind: "audioinput",
  isDefault: true,
  panel: "other"
} as const;
const SPEAKER = {
  id: "spk-1",
  name: "Speaker",
  groupId: "g3",
  kind: "audiooutput",
  isDefault: true,
  panel: "other"
} as const;
const MODES = [
  {
    width: 640,
    height: 480,
    frameRate: 30
  },
  {
    width: 1280,
    height: 720,
    frameRate: 30
  },
  {
    width: 1280,
    height: 720,
    frameRate: 60
  },
  {
    width: 1920,
    height: 1080,
    frameRate: 30
  }
] as const;

interface FakeOptions {
  readonly access?: Record<string, Access>;
  readonly devices?: readonly CaptureDevice[];
  readonly openError?: Error;
  readonly surface?: Awaited<ReturnType<NonNullable<Backend>["pickDisplay"]>>;
}

function fakeBackend({
  access = {
    camera: "granted",
    microphone: "granted"
  },
  devices = [FRONT, BACK, MICROPHONE, SPEAKER],
  openError,
  surface
}: FakeOptions = {}) {
  const opens: Request[] = [];
  const calls: string[] = [];
  const watchers: Array<() => void> = [];
  const failures: Array<() => void> = [];
  const axis = {
    isSupported: true,
    min: 100,
    max: 800,
    step: 100,
    value: 100,
    isAuto: false,
    setValue: (value: number) => calls.push(`zoom ${value}`) > 0,
    setAuto: () => true
  };
  const backend = {
    access: permission => access[permission] ?? "prompt",
    devices: () => Promise.resolve(devices),
    onDevicesChanged(callback) {
      watchers.push(callback);
      return () => calls.push("unwatch");
    },
    videoModes: () => Promise.resolve(MODES),
    open(request) {
      opens.push(request);

      if (openError) {
        return Promise.reject(openError);
      }

      return Promise.resolve({
        native: undefined,
        camera: {
          brightness: axis,
          contrast: axis,
          hue: axis,
          whiteBalance: axis,
          backlightCompensation: axis,
          pan: axis,
          tilt: axis,
          zoom: axis,
          roll: axis,
          exposure: axis,
          focus: axis
        },
        setVideoMode(mode) {
          calls.push(`mode ${mode.width}x${mode.height}@${mode.frameRate}`);
          return Promise.resolve();
        },
        setAudioMuted: isMuted => calls.push(`muted ${isMuted}`),
        onFailed(callback) {
          failures.push(callback);
          return () => undefined;
        },
        close: () => calls.push("close")
      });
    },
    pickDisplay: () => Promise.resolve(surface)
  } satisfies NonNullable<Backend>;
  return {
    backend,
    opens,
    calls,
    watchers,
    failures
  };
}

function devicesOf() {
  const mediaDevices: unknown = navigator.mediaDevices;
  assert.ok(mediaDevices instanceof MediaDevices);
  return mediaDevices;
}

async function withDevices({ fake, run }: {
  fake: ReturnType<typeof fakeBackend>;
  run: () => Promise<void>;
}) {
  const uninstall = installMediaDevices({ backend: fake.backend });
  try {
    await run();
  } finally {
    uninstall();
  }
}

test("install defines the globals, uninstalling takes them away", () => {
  const uninstall = installMediaDevices({ backend: fakeBackend().backend });
  devicesOf();
  uninstall();
  assert.equal(navigator.mediaDevices, undefined);
});

test("enumerateDevices lists every input and output with labels once permitted", async () => {
  await withDevices({
    fake: fakeBackend(),
    async run() {
      const infos = await devicesOf().enumerateDevices();
      assert.deepEqual(infos.map(info => [info.kind, info.label]), [
        ["audioinput", "Microphone"],
        ["audiooutput", "Speaker"],
        ["videoinput", "Front camera"],
        ["videoinput", "Back camera"]
      ]);
      assert.deepEqual(infos[0]?.toJSON(), {
        deviceId: "mic-1",
        kind: "audioinput",
        label: "Microphone",
        groupId: "g1"
      });
    }
  });
});

test("without permission one blank entry per kind is listed", async () => {
  await withDevices({
    fake: fakeBackend({
      access: {
        camera: "prompt",
        microphone: "prompt"
      }
    }),
    async run() {
      const infos = await devicesOf().enumerateDevices();
      assert.deepEqual(infos.map(info => [info.kind, info.deviceId, info.label]), [
        ["audioinput", "", ""],
        ["audiooutput", "", ""],
        ["videoinput", "", ""]
      ]);
    }
  });
});

test("getUserMedia needs audio or video, and a denied switch is NotAllowedError", async () => {
  await withDevices({
    fake: fakeBackend({
      access: {
        camera: "denied",
        microphone: "granted"
      }
    }),
    async run() {
      await assert.rejects(devicesOf().getUserMedia({}), TypeError);
      await assert.rejects(
        devicesOf().getUserMedia({
          audio: false,
          video: false
        }), TypeError
      );
      await assert.rejects(devicesOf().getUserMedia({ video: true }), { name: "NotAllowedError" });
      const stream = await devicesOf().getUserMedia({ audio: true });
      assert.equal(stream.getAudioTracks().length, 1);
    }
  });
});

test("a missing kind of device is NotFoundError", async () => {
  await withDevices({
    fake: fakeBackend({ devices: [MICROPHONE] }),
    async run() {
      await assert.rejects(devicesOf().getUserMedia({ video: true }), { name: "NotFoundError" });
    }
  });
});

test("video and audio come from one capture: default camera, 640 by 480", async () => {
  const fake = fakeBackend();
  await withDevices({
    fake,
    async run() {
      const stream = await devicesOf().getUserMedia({
        audio: true,
        video: true
      });
      assert.equal(stream.active, true);
      assert.deepEqual(fake.opens, [{
        audioDeviceId: "mic-1",
        videoDeviceId: "cam-front",
        videoMode: {
          width: 640,
          height: 480,
          frameRate: 30
        },
        sharingMode: "shared",
        profileId: undefined
      }]);
      const [video] = stream.getVideoTracks();
      assert.equal(video?.label, "Front camera");
      assert.deepEqual(video?.getSettings(), {
        deviceId: "cam-front",
        groupId: "g1",
        width: 640,
        height: 480,
        aspectRatio: 640 / 480,
        frameRate: 30,
        facingMode: "user"
      });
      assert.deepEqual(video?.getCapabilities().width, {
        min: 640,
        max: 1920
      });
    }
  });
});

test("ideal sizes pick the nearest format, exact ones must match", async () => {
  const fake = fakeBackend();
  await withDevices({
    fake,
    async run() {
      await devicesOf().getUserMedia({
        video: {
          width: {
            ideal: 1300
          },
          height: 700,
          frameRate: {
            min: 50
          }
        }
      });
      assert.deepEqual(fake.opens[0]?.videoMode, {
        width: 1280,
        height: 720,
        frameRate: 60
      });
      await devicesOf().getUserMedia({
        video: {
          width: {
            exact: 1920
          },
          height: {
            exact: 1080
          }
        }
      });
      assert.deepEqual(fake.opens[1]?.videoMode, {
        width: 1920,
        height: 1080,
        frameRate: 30
      });
      await assert.rejects(
        devicesOf().getUserMedia({
          video: {
            width: {
              exact: 3840
            }
          }
        }), error => {
          assert.ok(error instanceof OverconstrainedError);
          assert.equal(error.name, "OverconstrainedError");
          assert.equal(error.constraint, "width");
          return true;
        }
      );
      await assert.rejects(
        devicesOf().getUserMedia({
          video: {
            frameRate: {
              min: 120
            }
          }
        }), { constraint: "frameRate" }
      );
    }
  });
});

test("deviceId and facingMode choose the camera", async () => {
  const fake = fakeBackend();
  await withDevices({
    fake,
    async run() {
      await devicesOf().getUserMedia({
        video: {
          facingMode: "environment"
        }
      });
      assert.equal(fake.opens[0]?.videoDeviceId, "cam-back");
      await devicesOf().getUserMedia({
        video: {
          facingMode: {
            exact: "user"
          }
        }
      });
      assert.equal(fake.opens[1]?.videoDeviceId, "cam-front");
      await devicesOf().getUserMedia({
        video: {
          deviceId: {
            exact: "cam-back"
          }
        }
      });
      assert.equal(fake.opens[2]?.videoDeviceId, "cam-back");
      await assert.rejects(
        devicesOf().getUserMedia({
          video: {
            deviceId: {
              exact: "nope"
            }
          }
        }), { constraint: "deviceId" }
      );
      await assert.rejects(
        devicesOf().getUserMedia({
          video: {
            facingMode: {
              exact: "left"
            }
          }
        }), { constraint: "facingMode" }
      );
      await assert.rejects(
        devicesOf().getUserMedia({
          audio: {
            deviceId: {
              exact: "nope"
            }
          }
        }), { constraint: "deviceId" }
      );
    }
  });
});

test("applyConstraints changes the format; stopping the last track releases the device", async () => {
  const fake = fakeBackend();
  await withDevices({
    fake,
    async run() {
      const stream = await devicesOf().getUserMedia({
        audio: true,
        video: true
      });
      const [video] = stream.getVideoTracks();
      const [audio] = stream.getAudioTracks();
      assert.ok(video && audio);
      await video.applyConstraints({
        width: 1280,
        height: 720
      });
      assert.equal(fake.calls.at(-1), "mode 1280x720@30");
      assert.equal(video.getSettings().width, 1280);
      await assert.rejects(
        video.applyConstraints({
          width: {
            exact: 5000
          }
        }), OverconstrainedError
      );
      const copy = video.clone();
      assert.ok(copy instanceof MediaStreamTrack);
      assert.notEqual(copy.id, video.id);
      video.stop();
      audio.stop();
      assert.equal(fake.calls.includes("close"), false);
      copy.stop();
      assert.equal(fake.calls.at(-1), "close");
      assert.equal(stream.active, false);
      assert.equal(video.readyState, "ended");
    }
  });
});

test("disabling an audio track mutes the microphone", async () => {
  const fake = fakeBackend();
  await withDevices({
    fake,
    async run() {
      const stream = await devicesOf().getUserMedia({ audio: true });
      const [audio] = stream.getAudioTracks();
      assert.ok(audio);
      audio.enabled = false;
      audio.enabled = true;
      assert.deepEqual(fake.calls, ["muted true", "muted false"]);
    }
  });
});

test("a device that fails ends its tracks with an ended event", async () => {
  const fake = fakeBackend();
  await withDevices({
    fake,
    async run() {
      const stream = await devicesOf().getUserMedia({ video: true });
      const [video] = stream.getVideoTracks();
      assert.ok(video);
      let count = 0;
      video.onended = () => {
        count += 1;
      };
      fake.failures[0]?.();
      assert.equal(count, 1);
      assert.equal(stream.active, false);
    }
  });
});

test("open errors: an access denial is NotAllowedError, any other NotReadableError", async () => {
  await withDevices({
    fake: fakeBackend({ openError: new Error("Access is denied. (0x80070005)") }),
    async run() {
      await assert.rejects(devicesOf().getUserMedia({ video: true }), { name: "NotAllowedError" });
    }
  });
  await withDevices({
    fake: fakeBackend({ openError: new Error("The device is in use (0xC00D3704)") }),
    async run() {
      await assert.rejects(devicesOf().getUserMedia({ video: true }), { name: "NotReadableError" });
    }
  });
});

test("devicechange watches lazily and fires when a device comes or goes", async () => {
  const fake = fakeBackend();
  await withDevices({
    fake,
    run() {
      assert.equal(fake.watchers.length, 0);
      let count = 0;
      devicesOf().addEventListener("devicechange", () => {
        count += 1;
      });
      devicesOf().ondevicechange = () => {
        count += 10;
      };
      assert.equal(fake.watchers.length, 1);
      fake.watchers[0]?.();
      assert.equal(count, 11);
      return Promise.resolve();
    }
  });
});

test("getSupportedConstraints says what Windows can honor", async () => {
  await withDevices({
    fake: fakeBackend(),
    run() {
      const supported = devicesOf().getSupportedConstraints();
      assert.equal(supported.width, true);
      assert.equal(supported.facingMode, true);
      assert.equal(supported.aspectRatio, false);
      return Promise.resolve();
    }
  });
});

test("getDisplayMedia returns the picked surface, a canceled picker is NotAllowedError", async () => {
  const closed: string[] = [];
  await withDevices({
    fake: fakeBackend({
      surface: {
        name: "Notepad",
        width: 800,
        height: 600,
        surface: "window",
        native: {
          item: true
        },
        cursor: "never",
        close: () => closed.push("closed")
      }
    }),
    async run() {
      const stream = await devicesOf().getDisplayMedia({
        video: true,
        cursor: "never"
      });
      const [track] = stream.getVideoTracks();
      assert.equal(track?.label, "Notepad");
      assert.deepEqual(track?.getSettings(), {
        deviceId: "",
        groupId: "",
        width: 800,
        height: 600,
        aspectRatio: 800 / 600,
        displaySurface: "window",
        cursor: "never"
      });
      assert.deepEqual(track?.captureItem, { item: true });
      track?.stop();
      assert.deepEqual(closed, ["closed"]);
    }
  });
  await withDevices({
    fake: fakeBackend(),
    async run() {
      await assert.rejects(devicesOf().getDisplayMedia({ video: true }), { name: "NotAllowedError" });
    }
  });
});

test("the WinUI extras: sharing mode, camera axes and the MediaStream constructor", async () => {
  const fake = fakeBackend();
  await withDevices({
    fake,
    async run() {
      const stream = await devicesOf().getUserMedia({
        video: {
          profileId: "profile-1"
        },
        sharingMode: "exclusive"
      });
      assert.equal(fake.opens[0]?.sharingMode, "exclusive");
      assert.equal(fake.opens[0]?.profileId, "profile-1");
      const [video] = stream.getVideoTracks();
      assert.equal(video?.camera?.zoom.max, 800);
      assert.equal(video?.camera?.zoom.setValue(300), true);
      assert.equal(fake.calls.at(-1), "zoom 300");
      assert.ok(video);
      const mixed = new MediaStream([video]);
      assert.equal(mixed.getTracks().length, 1);
      assert.equal(mixed.getTrackById(video.id), video);
      const events: string[] = [];
      mixed.onremovetrack = () => events.push("removed");
      mixed.removeTrack(video);
      assert.deepEqual(events, ["removed"]);
    }
  });
});

test("the Permissions API answers camera and microphone from the backend", async () => {
  const uninstallPermissions = installPermissions();
  await withDevices({
    fake: fakeBackend({
      access: {
        camera: "denied",
        microphone: "granted"
      }
    }),
    async run() {
      assert.equal((await navigator.permissions.query({ name: "camera" })).state, "denied");
      assert.equal((await navigator.permissions.query({ name: "microphone" })).state, "granted");
    }
  });
  uninstallPermissions();
});
