import type { RawLine, RecognizingEngine } from "./text-recognition.ts";
import { candidatesOf, firstRecognition, linesInSource, OcrCandidateKind } from "./text-recognition.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const INSTALLED = ["en-GB", "en-US"];

function line(text: string) {
  return {
    text,
    words: [
      {
        text,
        bounds: {
          x: 0,
          y: 0,
          width: 10,
          height: 5
        }
      }
    ]
  } satisfies RawLine;
}

function fakeEngine({ language, lines, asked }: {
  language: string;
  lines: RawLine[];
  asked: string[];
}) {
  return () => ({
    language,
    async recognize() {
      asked.push(language);
      return lines;
    }
  }) satisfies RecognizingEngine;
}

test("without languages the profile engine comes first, then each installed language", () => {
  assert.deepEqual(
    candidatesOf({
      requested: undefined,
      installed: INSTALLED,
      isSupported: () => true
    }), [
      { kind: OcrCandidateKind.PROFILE },
      {
        kind: OcrCandidateKind.LANGUAGE,
        tag: "en-GB"
      },
      {
        kind: OcrCandidateKind.LANGUAGE,
        tag: "en-US"
      }
    ]
  );
});

test("with languages only the supported ones are tried, in the order given, once each", () => {
  assert.deepEqual(
    candidatesOf({
      requested: ["he", "en-US", "xx", "EN-us"],
      installed: INSTALLED,
      isSupported: tag => tag !== "xx"
    }), [
      {
        kind: OcrCandidateKind.LANGUAGE,
        tag: "he"
      },
      {
        kind: OcrCandidateKind.LANGUAGE,
        tag: "en-US"
      }
    ]
  );
});

test("named languages that are none supported leave nothing to try, and an empty list means none named", () => {
  assert.deepEqual(
    candidatesOf({
      requested: ["xx"],
      installed: INSTALLED,
      isSupported: () => false
    }), []
  );
  assert.equal(
    candidatesOf({
      requested: [],
      installed: INSTALLED,
      isSupported: () => true
    }).length, 3
  );
});

test("the first engine that finds a line wins and the rest are not asked", async () => {
  const asked: string[] = [];
  const result = await firstRecognition([
    fakeEngine({
      language: "he",
      lines: [],
      asked
    }),
    fakeEngine({
      language: "en-US",
      lines: [line("hello")],
      asked
    }),
    fakeEngine({
      language: "en-GB",
      lines: [line("other")],
      asked
    })
  ]);
  assert.equal(result.language, "en-US");
  assert.deepEqual(result.lines.map(found => found.text), ["hello"]);
  assert.deepEqual(asked, ["he", "en-US"]);
});

test("an engine that cannot be made, or whose language was asked already, is skipped", async () => {
  const asked: string[] = [];
  const result = await firstRecognition([
    () => undefined,
    fakeEngine({
      language: "en-US",
      lines: [],
      asked
    }),
    fakeEngine({
      language: "EN-us",
      lines: [line("again")],
      asked
    })
  ]);
  assert.deepEqual(result, {
    lines: [],
    language: ""
  });
  assert.deepEqual(asked, ["en-US"]);
});

test("lines move into source pixels and take the box of their words", () => {
  const [moved] = linesInSource({
    lines: [
      {
        text: "a b",
        words: [
          {
            text: "a",
            bounds: {
              x: 0,
              y: 0,
              width: 10,
              height: 10
            }
          },
          {
            text: "b",
            bounds: {
              x: 20,
              y: 0,
              width: 10,
              height: 12
            }
          }
        ]
      }
    ],
    crop: {
      x: 100,
      y: 200,
      width: 60,
      height: 40
    },
    read: {
      width: 30,
      height: 20
    }
  });
  assert.deepEqual(moved?.words.map(word => word.bounds), [
    {
      x: 100,
      y: 200,
      width: 20,
      height: 20
    },
    {
      x: 140,
      y: 200,
      width: 20,
      height: 24
    }
  ]);
  assert.deepEqual(moved?.bounds, {
    x: 100,
    y: 200,
    width: 60,
    height: 24
  });
});
