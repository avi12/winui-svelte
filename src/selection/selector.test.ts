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
