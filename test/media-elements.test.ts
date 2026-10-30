import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The media example (examples/media) in a real WinUI window, off screen and
// never activated: Images made from bytes, a data URI, a file path and SVG
// markup show the pixels they were made from, a bad image raises ImageFailed,
// and a MediaPlayer with no window plays a generated WAV to its end.

const TIMEOUT_MILLISECONDS = 300_000;
const IMAGE_SIZE = 4;
const COLOR_TOLERANCE = 40;
const LOAD_MILLISECONDS = 1500;
const ENDED_WAIT_MILLISECONDS = 15_000;
const POLL_MILLISECONDS = 250;
const PLAYING = 3;

function isNear({ actual, expected }: {
  actual: unknown;
  expected: number[];
}) {
  const isColor = Array.isArray(actual);
  return isColor && expected.every((channel, i) => Math.abs(Number(actual[i]) - channel) <= COLOR_TOLERANCE);
}

function rendered({ report, key }: {
  report: Record<string, unknown>;
  key: string;
}) {
  const value = report[key];
  assert.ok(typeof value === "object" && value !== null, `${key} was rendered`);
  return Object.fromEntries(Object.entries(value));
}

function assertColors({ report, key, left, right }: {
  report: Record<string, unknown>;
  key: string;
  left: number[];
  right: number[];
}) {
  const colors = rendered({
    report,
    key
  });
  assert.ok(
    isNear({
      actual: colors["left"],
      expected: left
    }), `${key}: the left half is ${left}`
  );
  assert.ok(
    isNear({
      actual: colors["right"],
      expected: right
    }), `${key}: the right half is ${right}`
  );
}

test("images made from bytes, a data URI, a file and SVG show their pixels", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/media/main.ts" });
  try {
    await example.ask({
      command: {
        cmd: "images"
      },
      kind: "images"
    });
    await new Promise(resolve => setTimeout(resolve, LOAD_MILLISECONDS));
    const report = await example.ask({
      command: {
        cmd: "images"
      },
      kind: "images"
    });
    assert.equal(report["pngWidth"], IMAGE_SIZE, "the PNG's natural width");
    assert.equal(report["pngHeight"], IMAGE_SIZE, "the PNG's natural height");
    assert.equal(report["dataUriWidth"], IMAGE_SIZE, "the data URI decodes to the same PNG");
    const opened = report["opened"];
    for (const name of ["bytes", "dataUri", "svg", "file"]) {
      assert.ok(Array.isArray(opened) && opened.includes(name), `${name} raised ImageOpened`);
    }

    assert.ok(
      "broken" in rendered({
        report,
        key: "failures"
      }), "bad bytes fail with an error the app is told of"
    );
    assertColors({
      report,
      key: "bytes",
      left: [255, 0, 0, 255],
      right: [0, 0, 255, 255]
    });
    assertColors({
      report,
      key: "svg",
      left: [0, 255, 0, 255],
      right: [255, 255, 0, 255]
    });
    assertColors({
      report,
      key: "file",
      left: [255, 0, 0, 255],
      right: [0, 0, 255, 255]
    });

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});

test("a MediaPlayer with no window plays a WAV: state and position advance to the end", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/media/main.ts" });
  try {
    let report = await example.ask({
      command: {
        cmd: "play"
      },
      kind: "audio"
    });
    const states = new Set<unknown>();
    const deadline = Date.now() + ENDED_WAIT_MILLISECONDS;
    while (report["isEnded"] !== true && Date.now() < deadline) {
      states.add(report["playbackState"]);
      await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
      report = await example.ask({
        command: {
          cmd: "audio"
        },
        kind: "audio"
      });
    }

    assert.equal(report["isEnded"], true, "the media played to its end");
    assert.ok(Number(report["naturalDuration"]) > 0, "the duration is known");
    assert.ok(Number(report["position"]) >= Number(report["naturalDuration"]), "the position reached the duration");
    assert.ok(states.has(PLAYING) || Number(report["position"]) > 0, "the player played");

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});
