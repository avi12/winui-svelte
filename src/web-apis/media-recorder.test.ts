import assert from "node:assert/strict";
import { test } from "node:test";

// MediaRecorder over a stand-in for MediaCapture's recording: state machine,
// event order, the Blob, unsupported types and the WinUI quality extra. No
// camera or microphone is ever started.

const { BlobEvent, installMediaRecorder, MediaRecorder, MediaRecorderErrorEvent } = await import("./media-recorder.ts");
const { MediaStream } = await import("./media-devices.ts");

type Backend = NonNullable<Parameters<typeof installMediaRecorder>[0]>["backend"];
type Request = Parameters<NonNullable<Backend>["start"]>[0];

function fakeBackend() {
  const requests: Request[] = [];
  const calls: string[] = [];
  const backend = {
    isTypeSupported: (mimeType: string) => mimeType.startsWith("video/mp4") || mimeType === "audio/mp4",
    start(request) {
      requests.push(request);
      return Promise.resolve({
        pause() {
          calls.push("pause");
          return Promise.resolve();
        },
        resume() {
          calls.push("resume");
          return Promise.resolve();
        },
        stop: () => Promise.resolve(new Uint8Array([1, 2, 3]))
      });
    }
  } satisfies NonNullable<Backend>;
  return {
    backend,
    requests,
    calls
  };
}

function tick() {
  return new Promise<void>(resolve => {
    setImmediate(resolve);
  });
}

function recorderOf({ fake, options }: {
  fake: ReturnType<typeof fakeBackend>;
  options?: ConstructorParameters<typeof MediaRecorder>[0]["options"];
}) {
  return new MediaRecorder({
    backend: fake.backend,
    stream: new MediaStream(),
    ...(options === undefined ? {} : { options })
  });
}

test("recording goes inactive, recording, paused, recording, inactive with its events", async () => {
  const fake = fakeBackend();
  const recorder = recorderOf({ fake });
  const events: string[] = [];
  for (const type of ["start", "pause", "resume", "stop"]) {
    recorder.addEventListener(type, () => events.push(type));
  }

  recorder.ondataavailable = event => {
    assert.ok(event instanceof BlobEvent);
    events.push(`data ${event.data.size}`);
  };
  assert.equal(recorder.state, "inactive");
  recorder.start();
  assert.equal(recorder.state, "recording");
  await tick();
  recorder.pause();
  assert.equal(recorder.state, "paused");
  await tick();
  recorder.resume();
  await tick();
  recorder.stop();
  assert.equal(recorder.state, "inactive");
  await tick();
  assert.deepEqual(events, ["start", "pause", "resume", "data 3", "stop"]);
  assert.deepEqual(fake.calls, ["pause", "resume"]);
});

test("start twice and requestData while inactive throw InvalidStateError", () => {
  const recorder = recorderOf({ fake: fakeBackend() });
  assert.throws(() => {
    recorder.requestData();
  }, { name: "InvalidStateError" });
  recorder.start();
  assert.throws(() => {
    recorder.start();
  }, { name: "InvalidStateError" });
});

test("an unsupported type is NotSupportedError, the default follows the tracks", () => {
  assert.throws(() => recorderOf({
    fake: fakeBackend(),
    options: {
      mimeType: "video/webm"
    }
  }), { name: "NotSupportedError" });
  assert.equal(recorderOf({ fake: fakeBackend() }).mimeType, "audio/mp4");
});

test("a backend that cannot start reports an error event and goes inactive", async () => {
  const backend = {
    isTypeSupported: () => true,
    start: () => Promise.reject(new Error("no MediaCapture"))
  } satisfies NonNullable<Backend>;
  const recorder = new MediaRecorder({
    backend,
    stream: new MediaStream()
  });
  const errors: string[] = [];
  recorder.onerror = event => {
    assert.ok(event instanceof MediaRecorderErrorEvent);
    errors.push(event.error.message);
  };
  recorder.start();
  await tick();
  assert.deepEqual(errors, ["no MediaCapture"]);
  assert.equal(recorder.state, "inactive");
});

test("the WinUI quality extra reaches the backend, and the global is defined by install", async () => {
  const fake = fakeBackend();
  const uninstall = installMediaRecorder({ backend: fake.backend });
  assert.equal(MediaRecorder.isTypeSupported("audio/mp4"), true);
  assert.equal(MediaRecorder.isTypeSupported("video/webm"), false);
  const recorder = recorderOf({
    fake,
    options: {
      videoQuality: "hd720p"
    }
  });
  recorder.start();
  await tick();
  assert.equal(fake.requests[0]?.videoQuality, "hd720p");
  assert.equal(fake.requests[0]?.mimeType, "audio/mp4");
  uninstall();
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, "MediaRecorder"), undefined);
});
