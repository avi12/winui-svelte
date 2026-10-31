import assert from "node:assert/strict";
import { test } from "node:test";

// The Launch Handler API over a fake disk: the initial command line waits for
// the consumer, later activations are delivered, arguments become targetURL
// and files.

const { installLaunch } = await import("./launch.ts");

const disk = {
  isFile: (candidate: string) => Promise.resolve(candidate.endsWith("notes.txt")),
  read: () => Promise.resolve(new TextEncoder().encode("hello"))
};

function tick() {
  return new Promise<void>(resolve => {
    setImmediate(resolve);
  });
}

test("the start's command line waits for the consumer, then arrives as params", async () => {
  const uninstall = installLaunch({
    ...disk,
    initialArguments: ["notes.txt", "myapp://open?id=1", "C:\\missing.bin"]
  });
  try {
    await tick();
    const received: Array<{
      targetURL: string | undefined;
      names: string[];
    }> = [];
    launchQueue.setConsumer(params => {
      received.push({
        targetURL: params.targetURL,
        names: params.files.map(file => file.name)
      });
    });
    assert.deepEqual(received, [{
      targetURL: "myapp://open?id=1",
      names: ["notes.txt"]
    }]);
  } finally {
    uninstall();
  }
});

test("a later activation reaches the consumer and its file reads back", async () => {
  const uninstall = installLaunch({
    ...disk,
    initialArguments: []
  });
  try {
    const texts: string[] = [];
    launchQueue.setConsumer(async params => {
      for (const file of params.files) {
        texts.push(await (await file.getFile()).text());
      }
    });
    await launchQueue.enqueueActivation({
      arguments: ["notes.txt"],
      workingDirectory: "C:\\work"
    });
    assert.deepEqual(texts, ["hello"]);
  } finally {
    uninstall();
  }

  assert.equal(typeof launchQueue, "undefined");
});
