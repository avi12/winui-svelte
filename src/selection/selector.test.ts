import { gripEdge, nearestEdge, ResizeEdge } from "./edges.ts";
import type { Point } from "./geometry.ts";
import {
  boundsOf,
  dragRegion,
  gripCorner,
  isFallingCorner,
  lassoRegion,
  moveRegion,
  nearestCorner,
  pixelRegion,
  resizeRegion
} from "./geometry.ts";
import { formatChord, SELECTION_SHORTCUTS, selectorKeyEvent } from "./keyboard.ts";
import type { SelectorEvent, SelectorState } from "./selector.ts";
import {
  createSelector,
  hoverCursor,
  reduceSelector,
  SelectionCursor,
  SelectionPhase,
  selectionResult,
  SelectionShape,
  SelectorEventKind,
  visibleRegion
} from "./selector.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const BOUNDS = {
  width: 1000,
  height: 600
};

function play({ state, events }: {
  state: SelectorState;
  events: readonly SelectorEvent[];
}) {
  let current = state;
  for (const event of events) {
    current = reduceSelector({
      state: current,
      event
    });
  }

  return current;
}

function press(point: Point) {
  return {
    kind: SelectorEventKind.pointerDown,
    point
  } as const;
}

function move(point: Point) {
  return {
    kind: SelectorEventKind.pointerMove,
    point
  } as const;
}

const RELEASE = { kind: SelectorEventKind.pointerUp } as const;

const CIRCLE = [
  press({
    x: 200,
    y: 200
  }),
  move({
    x: 300,
    y: 150
  }),
  move({
    x: 400,
    y: 200
  }),
  move({
    x: 300,
    y: 300
  }),
  RELEASE
];

test("boundsOf is the box of the points, and nothing for none", () => {
  assert.equal(boundsOf([]), undefined);
  assert.deepEqual(
    boundsOf([{
      x: 5,
      y: 9
    }, {
      x: 1,
      y: 20
    }]),
    {
      x: 1,
      y: 9,
      width: 4,
      height: 11
    }
  );
});

test("a lasso loop selects its padded box, kept on screen, and a slip selects nothing", () => {
  const region = lassoRegion({
    loop: [{
      x: 2,
      y: 2
    }, {
      x: 100,
      y: 80
    }],
    bounds: BOUNDS
  });
  assert.deepEqual(region, {
    x: 0,
    y: 0,
    width: 116,
    height: 96
  });
  assert.equal(
    lassoRegion({
      loop: [{
        x: 2,
        y: 2
      }, {
        x: 5,
        y: 80
      }],
      bounds: BOUNDS
    }),
    undefined
  );
});

test("dragRegion orders the corners, clips to the area and refuses a sliver", () => {
  assert.deepEqual(
    dragRegion({
      first: {
        x: 300,
        y: 300
      },
      second: {
        x: 100,
        y: 50
      },
      bounds: BOUNDS
    }),
    {
      x: 100,
      y: 50,
      width: 200,
      height: 250
    }
  );
  assert.equal(
    dragRegion({
      first: {
        x: 10,
        y: 10
      },
      second: {
        x: 15,
        y: 200
      },
      bounds: BOUNDS
    }),
    undefined
  );
});

test("moveRegion keeps the size and stays on screen", () => {
  const moved = moveRegion({
    selection: {
      x: 100,
      y: 100,
      width: 200,
      height: 100
    },
    grip: {
      x: 10,
      y: 10
    },
    pointer: {
      x: 2000,
      y: -50
    },
    bounds: BOUNDS
  });
  assert.deepEqual(moved, {
    x: 800,
    y: 0,
    width: 200,
    height: 100
  });
});

test("a corner is grabbed from within reach, and resizing keeps the opposite corner still", () => {
  const selection = {
    x: 100,
    y: 100,
    width: 200,
    height: 100
  };
  assert.equal(
    nearestCorner({
      selection,
      point: {
        x: 150,
        y: 150
      }
    }),
    undefined
  );
  const corner = nearestCorner({
    selection,
    point: {
      x: 310,
      y: 205
    }
  });
  assert.deepEqual(corner, {
    x: 300,
    y: 200
  });
  assert.ok(corner !== undefined);
  assert.equal(
    isFallingCorner({
      selection,
      corner
    }),
    true
  );
  const grip = gripCorner({
    selection,
    corner
  });
  assert.deepEqual(grip.anchor, {
    x: 100,
    y: 100
  });
  assert.deepEqual(
    resizeRegion({
      grip,
      pointer: {
        x: 400,
        y: 110
      },
      bounds: BOUNDS
    }),
    {
      x: 100,
      y: 100,
      width: 300,
      height: 20
    }
  );
});

test("pixelRegion scales a selection to the picture and rounds outward", () => {
  assert.deepEqual(
    pixelRegion({
      selection: {
        x: 10.2,
        y: 10,
        width: 100.2,
        height: 50
      },
      drawnIn: {
        width: 1000,
        height: 600
      },
      picture: {
        width: 2000,
        height: 1200
      }
    }),
    {
      x: 20,
      y: 20,
      width: 201,
      height: 100
    }
  );
});

test("a lasso circle becomes a selection and keeps its loop", () => {
  const state = play({
    state: createSelector({ bounds: BOUNDS }),
    events: CIRCLE
  });
  assert.equal(state.phase, SelectionPhase.idle);
  const result = selectionResult(state);
  assert.deepEqual(result?.region, {
    x: 184,
    y: 134,
    width: 232,
    height: 182
  });
  assert.equal(result?.shape, SelectionShape.lasso);
  assert.equal(result?.outline.length, 4);
});

test("a rectangle shows its live box while dragged and selects it on release", () => {
  const dragging = play({
    state: createSelector({
      bounds: BOUNDS,
      shape: SelectionShape.rectangle
    }),
    events: [
      press({
        x: 100,
        y: 100
      }),
      move({
        x: 150,
        y: 130
      }),
      move({
        x: 300,
        y: 250
      })
    ]
  });
  assert.deepEqual(visibleRegion(dragging), {
    x: 100,
    y: 100,
    width: 200,
    height: 150
  });
  assert.equal(selectionResult(dragging), undefined);
  const done = reduceSelector({
    state: dragging,
    event: RELEASE
  });
  const result = selectionResult(done);
  assert.deepEqual(result?.region, {
    x: 100,
    y: 100,
    width: 200,
    height: 150
  });
  assert.deepEqual(result?.outline, []);
});

test("a stroke too small is dropped and leaves nothing selected", () => {
  const state = play({
    state: createSelector({ bounds: BOUNDS }),
    events: [
      press({
        x: 50,
        y: 50
      }),
      move({
        x: 53,
        y: 52
      }),
      RELEASE
    ]
  });
  assert.equal(selectionResult(state), undefined);
  assert.equal(state.phase, SelectionPhase.idle);
});

test("moves shorter than the step add no point to a loop", () => {
  const state = play({
    state: createSelector({ bounds: BOUNDS }),
    events: [
      press({
        x: 50,
        y: 50
      }),
      move({
        x: 50.5,
        y: 50.5
      }),
      move({
        x: 60,
        y: 60
      })
    ]
  });
  assert.equal(state.stroke.length, 2);
});

test("after a selection, a press inside moves it, on a corner resizes it, outside starts afresh", () => {
  const selected = play({
    state: createSelector({
      bounds: BOUNDS,
      shape: SelectionShape.rectangle
    }),
    events: [
      press({
        x: 100,
        y: 100
      }),
      move({
        x: 300,
        y: 250
      }),
      RELEASE
    ]
  });

  const moved = play({
    state: selected,
    events: [
      press({
        x: 200,
        y: 175
      }),
      move({
        x: 250,
        y: 175
      }),
      RELEASE
    ]
  });
  assert.deepEqual(selectionResult(moved)?.region, {
    x: 150,
    y: 100,
    width: 200,
    height: 150
  });

  const resized = play({
    state: selected,
    events: [
      press({
        x: 300,
        y: 250
      }),
      move({
        x: 400,
        y: 300
      }),
      RELEASE
    ]
  });
  assert.deepEqual(selectionResult(resized)?.region, {
    x: 100,
    y: 100,
    width: 300,
    height: 200
  });

  const fresh = reduceSelector({
    state: selected,
    event: press({
      x: 700,
      y: 500
    })
  });
  assert.equal(fresh.phase, SelectionPhase.draw);
  assert.equal(selectionResult(fresh), undefined);
});

test("clear drops the selection and keeps the limits", () => {
  const selected = play({
    state: createSelector({
      bounds: BOUNDS,
      padding: 4
    }),
    events: CIRCLE
  });
  const cleared = reduceSelector({
    state: selected,
    event: {
      kind: SelectorEventKind.clear
    }
  });
  assert.equal(selectionResult(cleared), undefined);
  assert.equal(cleared.limits.padding, 4);
});

test("the cursor follows what a press would do", () => {
  const empty = createSelector({ bounds: BOUNDS });
  const origin = {
    x: 0,
    y: 0
  };
  assert.equal(
    hoverCursor({
      state: empty,
      point: origin
    }),
    SelectionCursor.draw
  );
  const selected = play({
    state: createSelector({
      bounds: BOUNDS,
      shape: SelectionShape.rectangle
    }),
    events: [
      press({
        x: 100,
        y: 100
      }),
      move({
        x: 300,
        y: 250
      }),
      RELEASE
    ]
  });
  assert.equal(
    hoverCursor({
      state: selected,
      point: {
        x: 200,
        y: 175
      }
    }),
    SelectionCursor.move
  );
  assert.equal(
    hoverCursor({
      state: selected,
      point: {
        x: 300,
        y: 250
      }
    }),
    SelectionCursor.resizeFalling
  );
  assert.equal(
    hoverCursor({
      state: selected,
      point: {
        x: 300,
        y: 100
      }
    }),
    SelectionCursor.resizeRising
  );
  assert.equal(
    hoverCursor({
      state: selected,
      point: {
        x: 800,
        y: 500
      }
    }),
    SelectionCursor.draw
  );
});

test("an edge between the corners resizes along one axis and keeps the rest", () => {
  const selection = {
    x: 100,
    y: 100,
    width: 200,
    height: 100
  };
  const point = {
    x: 200,
    y: 104
  };
  assert.equal(
    nearestEdge({
      selection,
      point
    }), ResizeEdge.top
  );
  assert.equal(
    nearestEdge({
      selection,
      point: {
        x: 200,
        y: 150
      }
    }),
    undefined
  );
  assert.equal(
    nearestEdge({
      selection,
      point: {
        x: 296,
        y: 150
      }
    }),
    ResizeEdge.right
  );
  const top = gripEdge({
    selection,
    edge: ResizeEdge.top
  });
  assert.deepEqual(
    resizeRegion({
      grip: top,
      pointer: {
        x: 999,
        y: 40
      },
      bounds: BOUNDS
    }),
    {
      x: 100,
      y: 40,
      width: 200,
      height: 160
    }
  );
  const left = gripEdge({
    selection,
    edge: ResizeEdge.left
  });
  assert.deepEqual(
    resizeRegion({
      grip: left,
      pointer: {
        x: 290,
        y: 0
      },
      bounds: BOUNDS
    }),
    {
      x: 280,
      y: 100,
      width: 20,
      height: 100
    }
  );
});

test("a press on an edge resizes the selection and the cursor says which way", () => {
  const selected = play({
    state: createSelector({
      bounds: BOUNDS,
      shape: SelectionShape.rectangle
    }),
    events: [
      press({
        x: 100,
        y: 100
      }),
      move({
        x: 300,
        y: 250
      }),
      RELEASE
    ]
  });
  assert.equal(
    hoverCursor({
      state: selected,
      point: {
        x: 200,
        y: 100
      }
    }),
    SelectionCursor.resizeVertical
  );
  assert.equal(
    hoverCursor({
      state: selected,
      point: {
        x: 300,
        y: 175
      }
    }),
    SelectionCursor.resizeHorizontal
  );
  const resized = play({
    state: selected,
    events: [
      press({
        x: 300,
        y: 175
      }),
      move({
        x: 400,
        y: 10
      }),
      RELEASE
    ]
  });
  assert.deepEqual(selectionResult(resized)?.region, {
    x: 100,
    y: 100,
    width: 300,
    height: 150
  });
});

function selectedBox() {
  return play({
    state: createSelector({
      bounds: BOUNDS,
      shape: SelectionShape.rectangle
    }),
    events: [
      press({
        x: 100,
        y: 100
      }),
      move({
        x: 300,
        y: 250
      }),
      RELEASE
    ]
  });
}

test("a drag that leaves the area keeps working, clamped to it", () => {
  const moved = play({
    state: selectedBox(),
    events: [
      press({
        x: 200,
        y: 175
      }),
      move({
        x: 5000,
        y: -5000
      }),
      RELEASE
    ]
  });
  assert.deepEqual(selectionResult(moved)?.region, {
    x: 800,
    y: 0,
    width: 200,
    height: 150
  });
});

test("Alt and an arrow nudge the selection, Shift makes it ten, the area clamps it", () => {
  const nudge = (state: SelectorState, key: string, isShift = false) => reduceSelector({
    state,
    event: selectorKeyEvent({
      key,
      isAlt: true,
      isShift,
      isControl: false
    }) ?? { kind: SelectorEventKind.clear }
  });
  const once = nudge(selectedBox(), "ArrowRight");
  assert.equal(selectionResult(once)?.region.x, 101);
  const ten = nudge(once, "ArrowDown", true);
  assert.equal(selectionResult(ten)?.region.y, 110);
  const clamped = nudge(nudge(selectedBox(), "ArrowLeft", true), "ArrowUp", true);
  assert.deepEqual(selectionResult(clamped)?.region, {
    x: 90,
    y: 90,
    width: 200,
    height: 150
  });
  assert.equal(
    selectorKeyEvent({
      key: "ArrowUp",
      isAlt: false,
      isShift: false,
      isControl: false
    }),
    undefined
  );
});

test("Ctrl, Alt and an arrow resize from the bottom right within the minimum size", () => {
  const event = selectorKeyEvent({
    key: "ArrowLeft",
    isAlt: true,
    isShift: true,
    isControl: true
  });
  assert.ok(event !== undefined);
  const resized = reduceSelector({
    state: selectedBox(),
    event
  });
  assert.deepEqual(selectionResult(resized)?.region, {
    x: 100,
    y: 100,
    width: 190,
    height: 150
  });
  const shrunk = reduceSelector({
    state: resized,
    event: {
      kind: SelectorEventKind.resizeBy,
      delta: {
        x: -500,
        y: -500
      }
    }
  });
  assert.deepEqual(selectionResult(shrunk)?.region, {
    x: 100,
    y: 100,
    width: 20,
    height: 20
  });
  const empty = createSelector({ bounds: BOUNDS });
  assert.equal(
    reduceSelector({
      state: empty,
      event: {
        kind: SelectorEventKind.nudge,
        delta: {
          x: 1,
          y: 1
        }
      }
    }),
    empty
  );
});

test("every shortcut is in one table that formats for help and drives the key handling", () => {
  const shortcuts = Object.values(SELECTION_SHORTCUTS);
  assert.deepEqual(shortcuts.map(shortcut => formatChord(shortcut.chord)), [
    "Alt+Arrow",
    "Alt+Shift+Arrow",
    "Ctrl+Alt+Arrow",
    "Ctrl+Alt+Shift+Arrow"
  ]);
  for (const shortcut of shortcuts) {
    const event = selectorKeyEvent({
      key: "ArrowDown",
      isAlt: shortcut.chord.isAlt,
      isShift: shortcut.chord.isShift,
      isControl: shortcut.chord.isControl
    });
    assert.equal(event?.kind, shortcut.kind);
    assert.deepEqual(event?.delta, {
      x: 0,
      y: shortcut.step
    });
  }
  const rebound = selectorKeyEvent({
    key: "ArrowLeft",
    isAlt: false,
    isShift: false,
    isControl: false,
    shortcuts: [{
      id: "plain",
      chord: {
        isControl: false,
        isAlt: false,
        isShift: false,
        key: "Arrow"
      },
      kind: SelectorEventKind.nudge,
      step: 5
    }]
  });
  assert.deepEqual(rebound?.delta, {
    x: -5,
    y: 0
  });
  assert.equal(
    selectorKeyEvent({
      key: "ArrowLeft",
      isAlt: true,
      isShift: false,
      isControl: false,
      shortcuts: []
    }),
    undefined
  );
});
