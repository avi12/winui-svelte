import { SelectorEventKind } from "./selector.ts";
import type { TextSelectorState } from "./text-selector.ts";
import { createTextSelector, reduceTextSelector, textSelection } from "./text-selector.ts";
import { selectableWords, wordAt, wordsBetween, wordsInRegion } from "./text-words.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

function box({ x, y }: {
  x: number;
  y: number;
}) {
  return {
    x,
    y,
    width: 40,
    height: 20
  };
}

const WORDS = selectableWords([
  {
    words: [
      {
        rawValue: "hello",
        boundingBox: box({
          x: 0,
          y: 0
        })
      },
      {
        rawValue: "world",
        boundingBox: box({
          x: 50,
          y: 0
        })
      }
    ]
  },
  {
    words: [
      {
        rawValue: "שלום",
        boundingBox: box({
          x: 50,
          y: 30
        })
      },
      {
        rawValue: "עולם",
        boundingBox: box({
          x: 0,
          y: 30
        })
      }
    ]
  }
]);

test("selectableWords flattens lines in order and tags the line", () => {
  assert.deepEqual(WORDS.map(word => [word.text, word.line]), [
    ["hello", 0],
    ["world", 0],
    ["שלום", 1],
    ["עולם", 1]
  ]);
});

test("wordAt finds the word under a point, or the nearest within reach", () => {
  const point = {
    x: 45,
    y: 25
  };
  assert.equal(
    wordAt({
      words: WORDS,
      point: {
        x: 60,
        y: 5
      }
    }), 1
  );
  assert.equal(
    wordAt({
      words: WORDS,
      point
    }), undefined
  );
  assert.equal(
    wordAt({
      words: WORDS,
      point,
      reach: 10
    }), 0
  );
});

test("wordsBetween runs across lines whichever way it is dragged", () => {
  assert.deepEqual(
    wordsBetween({
      words: WORDS,
      from: 3,
      to: 1
    }), {
      start: 1,
      end: 3
    }
  );
  assert.equal(
    wordsBetween({
      words: [],
      from: 0,
      to: 1
    }), undefined
  );
});

test("wordsInRegion keeps the words whose centre is inside", () => {
  assert.deepEqual(
    wordsInRegion({
      words: WORDS,
      region: {
        x: 0,
        y: 25,
        width: 100,
        height: 30
      }
    }), [2, 3]
  );
});

test("a drag into a Hebrew line selects in logical order with a line break", () => {
  let state: TextSelectorState = createTextSelector(WORDS);
  for (const event of [
    {
      kind: SelectorEventKind.pointerDown,
      point: {
        x: 60,
        y: 5
      }
    },
    {
      kind: SelectorEventKind.pointerMove,
      point: {
        x: 55,
        y: 35
      }
    },
    { kind: SelectorEventKind.pointerUp }
  ] as const) {
    state = reduceTextSelector({
      state,
      event
    });
  }

  assert.equal(textSelection(state)?.text, "world\nשלום");
  assert.equal(state.isDragging, false);
});

test("a press off every word clears the selection", () => {
  const pressed = reduceTextSelector({
    state: createTextSelector(WORDS),
    event: {
      kind: SelectorEventKind.pointerDown,
      point: {
        x: 5,
        y: 5
      }
    }
  });
  assert.equal(textSelection(pressed)?.text, "hello");
  const cleared = reduceTextSelector({
    state: pressed,
    event: {
      kind: SelectorEventKind.pointerDown,
      point: {
        x: 500,
        y: 500
      }
    }
  });
  assert.equal(textSelection(cleared), undefined);
});
