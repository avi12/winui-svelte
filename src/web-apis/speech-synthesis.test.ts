import assert from "node:assert/strict";
import { test } from "node:test";

// speechSynthesis over a stand-in for Windows' SpeechSynthesizer: queue order,
// event order, pause/resume/cancel, boundary char indexes, errors, mapping of
// rate/pitch/volume, voices, and the WinUI extras. Real voices are for
// test/web-apis.test.ts.

const {
  installSpeechSynthesis,
  SpeechSynthesis,
  SpeechSynthesisErrorEvent,
  SpeechSynthesisEvent,
  SpeechSynthesisUtterance
} = await import("./speech-synthesis.ts");

type Backend = NonNullable<Parameters<typeof installSpeechSynthesis>[0]>["backend"];
type Request = Parameters<NonNullable<Backend>["speak"]>[0]["request"];
type Listener = Parameters<NonNullable<Backend>["speak"]>[0]["listener"];

const VOICES = [
  {
    id: "david",
    name: "David",
    language: "en-US",
    isDefault: true,
    isLocal: true,
    gender: "male",
    description: "Microsoft David"
  },
  {
    id: "zira",
    name: "Zira",
    language: "en-US",
    isDefault: false,
    isLocal: true,
    gender: "female",
    description: "Microsoft Zira"
  }
] as const;

function fakeBackend() {
  const requests: Request[] = [];
  const listeners: Listener[] = [];
  const calls: string[] = [];
  const backend = {
    voices: () => VOICES,
    speak({ request, listener }) {
      requests.push(request);
      listeners.push(listener);
      return {
        pause: () => calls.push("pause"),
        resume: () => calls.push("resume"),
        cancel: () => calls.push("cancel")
      };
    }
  } satisfies NonNullable<Backend>;
  return {
    backend,
    requests,
    calls,
    listenerAt(index: number) {
      const listener = listeners[index];
      assert.ok(listener);
      return listener;
    }
  };
}

function synthesisOf() {
  const synthesis: unknown = speechSynthesis;
  assert.ok(synthesis instanceof SpeechSynthesis);
  return synthesis;
}

function withSynthesis(run: (fake: ReturnType<typeof fakeBackend>) => void | Promise<void>) {
  const fake = fakeBackend();
  const uninstall = installSpeechSynthesis({ backend: fake.backend });
  return Promise.resolve(run(fake)).finally(uninstall);
}

function record(utterance: InstanceType<typeof SpeechSynthesisUtterance>) {
  const events: string[] = [];
  for (const type of ["start", "end", "pause", "resume", "error"]) {
    utterance.addEventListener(type, event => {
      const detail = event instanceof SpeechSynthesisErrorEvent ? event.error : "";
      events.push(`${type} ${detail}`.trim());
    });
  }

  return events;
}

test("the voices are the backend's, and the Windows extras ride on them", async () => {
  await withSynthesis(() => {
    const voices = synthesisOf().getVoices();
    assert.deepEqual(voices.map(voice => voice.name), ["David", "Zira"]);
    assert.equal(voices[0]?.default, true);
    assert.equal(voices[0]?.voiceURI, "david");
    assert.equal(voices[0]?.localService, true);
    assert.equal(voices[1]?.gender, "female");
    assert.equal(voices[1]?.description, "Microsoft Zira");
  });
});

test("voiceschanged fires once after install", async () => {
  const fake = fakeBackend();
  const uninstall = installSpeechSynthesis({ backend: fake.backend });
  let count = 0;
  synthesisOf().onvoiceschanged = () => {
    count += 1;
  };
  await Promise.resolve();
  assert.equal(count, 1);
  uninstall();
});

test("utterances are spoken one after the other with start and end events", async () => {
  await withSynthesis(fake => {
    const first = new SpeechSynthesisUtterance("one");
    const second = new SpeechSynthesisUtterance("two");
    const firstEvents = record(first);
    const secondEvents = record(second);
    synthesisOf().speak(first);
    synthesisOf().speak(second);
    assert.equal(synthesisOf().speaking, true);
    assert.equal(synthesisOf().pending, true);
    assert.equal(fake.requests.length, 1);
    fake.listenerAt(0).onStart();
    fake.listenerAt(0).onEnd();
    assert.equal(fake.requests.length, 2);
    fake.listenerAt(1).onStart();
    fake.listenerAt(1).onEnd();
    assert.deepEqual(firstEvents, ["start", "end"]);
    assert.deepEqual(secondEvents, ["start", "end"]);
    assert.equal(synthesisOf().speaking, false);
    assert.equal(synthesisOf().pending, false);
  });
});

test("word boundaries carry the char index and length, marks their name", async () => {
  await withSynthesis(fake => {
    const utterance = new SpeechSynthesisUtterance("hello big world");
    const seen: [string, number, number][] = [];
    utterance.onboundary = event => {
      assert.ok(event instanceof SpeechSynthesisEvent);
      seen.push([event.name, event.charIndex, event.charLength]);
    };
    const marks: string[] = [];
    utterance.onmark = event => {
      assert.ok(event instanceof SpeechSynthesisEvent);
      marks.push(event.name);
    };
    synthesisOf().speak(utterance);
    const listener = fake.listenerAt(0);
    listener.onBoundary({
      kind: "word",
      text: "hello"
    });
    listener.onBoundary({
      kind: "word",
      text: "big"
    });
    listener.onBoundary({
      kind: "word",
      text: "world"
    });
    listener.onBoundary({
      kind: "mark",
      text: "here"
    });
    assert.deepEqual(seen, [["word", 0, 5], ["word", 6, 3], ["word", 10, 5]]);
    assert.deepEqual(marks, ["here"]);
  });
});

test("pause and resume reach the backend and the utterance; nothing starts while paused", async () => {
  await withSynthesis(fake => {
    const utterance = new SpeechSynthesisUtterance("a");
    const events = record(utterance);
    synthesisOf().speak(utterance);
    synthesisOf().pause();
    assert.equal(synthesisOf().paused, true);
    const later = new SpeechSynthesisUtterance("b");
    synthesisOf().speak(later);
    fake.listenerAt(0).onEnd();
    assert.equal(fake.requests.length, 1);
    synthesisOf().resume();
    assert.equal(fake.requests.length, 2);
    assert.deepEqual(events, ["pause", "end"]);
    assert.deepEqual(fake.calls, ["pause"]);
  });
});

test("cancel drops the queue and the spoken utterance gets a canceled error", async () => {
  await withSynthesis(fake => {
    const first = new SpeechSynthesisUtterance("a");
    const second = new SpeechSynthesisUtterance("b");
    const firstEvents = record(first);
    const secondEvents = record(second);
    synthesisOf().speak(first);
    synthesisOf().speak(second);
    synthesisOf().cancel();
    assert.deepEqual(firstEvents, ["error canceled"]);
    assert.deepEqual(secondEvents, []);
    assert.deepEqual(fake.calls, ["cancel"]);
    assert.equal(synthesisOf().speaking, false);
    assert.equal(synthesisOf().pending, false);
  });
});

test("a backend error is the utterance's error event and the queue goes on", async () => {
  await withSynthesis(fake => {
    const failing = new SpeechSynthesisUtterance("a");
    const events = record(failing);
    synthesisOf().speak(failing);
    synthesisOf().speak(new SpeechSynthesisUtterance("b"));
    fake.listenerAt(0).onError("synthesis-failed");
    assert.deepEqual(events, ["error synthesis-failed"]);
    assert.equal(fake.requests.length, 2);
  });
});

test("empty text and a wrong argument", async () => {
  await withSynthesis(fake => {
    const empty = new SpeechSynthesisUtterance("");
    const events = record(empty);
    synthesisOf().speak(empty);
    assert.deepEqual(events, ["start", "end"]);
    assert.equal(fake.requests.length, 0);
    assert.throws(() => {
      // @ts-expect-error -- a page may pass anything
      synthesisOf().speak({ text: "plain" });
    }, TypeError);
  });
});

test("rate, pitch and volume are clamped, the voice and language pass through", async () => {
  await withSynthesis(fake => {
    const utterance = new SpeechSynthesisUtterance("x");
    utterance.rate = 50;
    utterance.pitch = -1;
    utterance.volume = 3;
    utterance.lang = "en-US";
    const [, zira] = synthesisOf().getVoices();
    assert.ok(zira);
    utterance.voice = zira;
    synthesisOf().speak(utterance);
    assert.deepEqual(fake.requests[0], {
      text: "x",
      isSsml: false,
      voiceId: "zira",
      language: "en-US",
      rate: 10,
      pitch: 0,
      volume: 1,
      punctuationSilence: "default",
      appendedSilence: "default"
    });
  });
});

test("the WinUI extras: SSML and silences reach the backend", async () => {
  await withSynthesis(fake => {
    const utterance = new SpeechSynthesisUtterance("<speak>hi<bookmark mark='m'/></speak>");
    utterance.isSsml = true;
    utterance.punctuationSilence = "minimal";
    utterance.appendedSilence = "minimal";
    synthesisOf().speak(utterance);
    assert.equal(fake.requests[0]?.isSsml, true);
    assert.equal(fake.requests[0]?.punctuationSilence, "minimal");
    assert.equal(fake.requests[0]?.appendedSilence, "minimal");
  });
});
