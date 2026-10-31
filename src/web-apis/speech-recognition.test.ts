import assert from "node:assert/strict";
import { test } from "node:test";

// SpeechRecognition over a stand-in for Windows' SpeechRecognizer: event order,
// interim and final results, result indexes, alternatives, errors from the
// ending, a denied microphone, the webkit alias, and the WinUI extras. Real
// recognition needs a microphone and is never run.

const {
  installSpeechRecognition,
  SpeechRecognition,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent
} = await import("./speech-recognition.ts");

type Backend = NonNullable<Parameters<typeof installSpeechRecognition>[0]>["backend"];
type Started = Parameters<NonNullable<Backend>["start"]>[0];

function fakeBackend(access: "granted" | "denied" | "prompt" = "granted") {
  const starts: Started[] = [];
  const calls: string[] = [];
  const backend = {
    access: () => access,
    start(started) {
      starts.push(started);
      return {
        stop: () => calls.push("stop"),
        abort: () => calls.push("abort")
      };
    }
  } satisfies NonNullable<Backend>;
  return {
    backend,
    starts,
    calls,
    listener() {
      const started = starts.at(-1);
      assert.ok(started);
      return started.listener;
    }
  };
}

function globalValue(name: string) {
  const value: unknown = Object.getOwnPropertyDescriptor(globalThis, name)?.value;
  return value;
}

function recognitionOf() {
  const constructor = globalValue("SpeechRecognition");
  assert.equal(typeof constructor, "function");
  assert.ok(constructor === globalValue("webkitSpeechRecognition"));
  return new SpeechRecognition(fakeBackend().backend);
}

function withRecognition({ access, run }: {
  access?: "granted" | "denied" | "prompt";
  run: (options: {
    fake: ReturnType<typeof fakeBackend>;
    recognition: InstanceType<typeof SpeechRecognition>;
    events: string[];
  }) => void;
}) {
  const fake = fakeBackend(access);
  const uninstall = installSpeechRecognition({ backend: fake.backend });
  try {
    const recognition = new SpeechRecognition(fake.backend);
    const events: string[] = [];
    for (const type of ["start", "audiostart", "soundstart", "speechstart", "speechend", "soundend", "audioend", "nomatch", "end"]) {
      recognition.addEventListener(type, () => events.push(type));
    }

    recognition.addEventListener("error", event => {
      assert.ok(event instanceof SpeechRecognitionErrorEvent);
      events.push(`error ${event.error}`);
    });
    recognition.addEventListener("result", event => {
      assert.ok(event instanceof SpeechRecognitionEvent);
      const last = event.results[event.results.length - 1];
      events.push(`result ${event.resultIndex} ${last?.isFinal ? "final" : "interim"} ${last?.[0]?.transcript}`);
    });
    run({
      fake,
      recognition,
      events
    });
  } finally {
    uninstall();
  }
}

test("install defines SpeechRecognition and its webkit alias", () => {
  const uninstall = installSpeechRecognition({ backend: fakeBackend().backend });
  assert.ok(recognitionOf());
  assert.ok(Boolean(globalValue("SpeechRecognition")));
  uninstall();
  assert.equal(globalValue("SpeechRecognition"), undefined);
  assert.equal(globalValue("webkitSpeechRecognition"), undefined);
});

test("a phrase: events come in the spec's order and the result is final", () => {
  withRecognition({
    run({ fake, recognition, events }) {
      recognition.start();
      const listener = fake.listener();
      listener.onAudioStart();
      listener.onSpeechStart();
      listener.onFinal([{
        transcript: "hello world",
        confidence: 0.9
      }]);
      listener.onEnd("completed");
      assert.deepEqual(events, [
        "start",
        "audiostart",
        "soundstart",
        "speechstart",
        "result 0 final hello world",
        "speechend",
        "soundend",
        "audioend",
        "end"
      ]);
    }
  });
});

test("interim results show only when asked, and the final replaces them", () => {
  withRecognition({
    run({ fake, recognition, events }) {
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.start();
      const listener = fake.listener();
      listener.onInterim("hel");
      listener.onInterim("hello");
      listener.onFinal([{
        transcript: "hello",
        confidence: 1
      }]);
      listener.onInterim("wor");
      listener.onFinal([{
        transcript: "world",
        confidence: 1
      }]);
      assert.deepEqual(events.filter(event => event.startsWith("result")), [
        "result 0 interim hel",
        "result 0 interim hello",
        "result 0 final hello",
        "result 1 interim wor",
        "result 1 final world"
      ]);
      assert.equal(fake.starts[0]?.options.isContinuous, true);
      assert.equal(fake.starts[0]?.options.isInterimEnabled, true);
    }
  });

  withRecognition({
    run({ fake, recognition, events }) {
      recognition.start();
      fake.listener().onInterim("hel");
      assert.deepEqual(events.filter(event => event.startsWith("result")), []);
    }
  });
});

test("alternatives are cut to maxAlternatives and the result list indexes", () => {
  withRecognition({
    run({ fake, recognition }) {
      recognition.maxAlternatives = 2;
      let heard: InstanceType<typeof SpeechRecognitionEvent> | undefined;
      recognition.onresult = event => {
        assert.ok(event instanceof SpeechRecognitionEvent);
        heard = event;
      };
      recognition.start();
      fake.listener().onFinal([
        {
          transcript: "a",
          confidence: 0.9
        },
        {
          transcript: "b",
          confidence: 0.5
        },
        {
          transcript: "c",
          confidence: 0.1
        }
      ]);
      const result = heard?.results.item(0);
      assert.equal(result?.length, 2);
      assert.equal(result?.item(1)?.transcript, "b");
      assert.equal(result?.item(2), null);
      assert.equal(heard?.results.item(1), null);
    }
  });
});

test("nothing recognized is nomatch, and the endings become error codes", () => {
  withRecognition({
    run({ fake, recognition, events }) {
      recognition.start();
      fake.listener().onFinal([]);
      fake.listener().onEnd("no-speech");
      assert.deepEqual(events, ["start", "soundstart", "speechstart", "nomatch", "speechend", "soundend", "error no-speech", "end"]);
    }
  });
});

test("a denied microphone is a not-allowed error and never starts", () => {
  withRecognition({
    access: "denied",
    run({ fake, recognition, events }) {
      recognition.start();
      assert.deepEqual(events, ["error not-allowed", "end"]);
      assert.equal(fake.starts.length, 0);
    }
  });
});

test("start twice throws, stop and abort reach the backend", () => {
  withRecognition({
    run({ fake, recognition }) {
      recognition.start();
      assert.throws(() => {
        recognition.start();
      }, { name: "InvalidStateError" });
      recognition.stop();
      recognition.abort();
      assert.deepEqual(fake.calls, ["stop", "abort"]);
      fake.listener().onEnd("aborted");
      recognition.start();
      assert.equal(fake.starts.length, 2);
    }
  });
});

test("the language and the WinUI extras reach the backend", () => {
  withRecognition({
    run({ fake, recognition }) {
      recognition.lang = "he-IL";
      recognition.scenario = "web-search";
      recognition.phrases = ["yes", "no"];
      recognition.start();
      assert.deepEqual(fake.starts[0]?.options, {
        language: "he-IL",
        isContinuous: false,
        isInterimEnabled: false,
        maxAlternatives: 1,
        scenario: "web-search",
        phrases: ["yes", "no"]
      });
    }
  });
});
