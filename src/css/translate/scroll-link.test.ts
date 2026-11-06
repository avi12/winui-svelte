import { LinkedProperty, progressExpression, rangeOffsets, trackExpression } from "./scroll-link.ts";
import type { ScrollGeometry } from "./scroll-link.ts";
import { RangeName, ScrollAxis } from "#src/css/parse/scroll-timeline.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// Which scroll offsets an animation range spans, and the text of the
// Composition expressions that map the scroll position onto a property.

const NO_INSET = {
  isAuto: true,
  offset: {
    pixels: 0,
    fraction: 0
  }
};
const VIEWPORT = 600;
const SCROLL_EXTENT = 1400;
const SUBJECT_START = 800;
const SUBJECT_SIZE = 200;
const scrolling: ScrollGeometry = {
  scrollExtent: SCROLL_EXTENT,
  viewport: VIEWPORT,
  subject: null,
  inset: {
    start: NO_INSET,
    end: NO_INSET
  }
};
const viewing: ScrollGeometry = {
  ...scrolling,
  subject: {
    start: SUBJECT_START,
    size: SUBJECT_SIZE
  }
};

function pointAt({ name, fraction = 0, pixels = 0 }: {
  name: RangeName | null;
  fraction?: number;
  pixels?: number;
}) {
  return {
    name,
    offset: {
      pixels,
      fraction
    }
  };
}

test("a scroll timeline spans the whole scroll range by default", () => {
  assert.deepEqual(
    rangeOffsets({
      geometry: scrolling,
      start: null,
      end: null
    }), {
      start: 0,
      end: SCROLL_EXTENT
    }
  );
});

test("a scroll timeline's range takes percentages of the scroll range and lengths", () => {
  assert.deepEqual(
    rangeOffsets({
      geometry: scrolling,
      start: pointAt({
        name: null,
        fraction: 0.5
      }),
      end: pointAt({
        name: null,
        pixels: 1000
      })
    }), {
      start: 700,
      end: 1000
    }
  );
});

test("a view timeline covers from the subject entering the viewport to leaving it", () => {
  assert.deepEqual(
    rangeOffsets({
      geometry: viewing,
      start: null,
      end: null
    }), {
      start: SUBJECT_START - VIEWPORT,
      end: SUBJECT_START + SUBJECT_SIZE
    }
  );
});

test("the named parts of a view timeline split the cover range", () => {
  function part(name: RangeName) {
    return rangeOffsets({
      geometry: viewing,
      start: pointAt({ name }),
      end: pointAt({
        name,
        fraction: 1
      })
    });
  }

  assert.deepEqual(part(RangeName.COVER), {
    start: 200,
    end: 1000
  });
  assert.deepEqual(part(RangeName.ENTRY), {
    start: 200,
    end: 400
  });
  assert.deepEqual(part(RangeName.CONTAIN), {
    start: 400,
    end: 800
  });
  assert.deepEqual(part(RangeName.EXIT), {
    start: 800,
    end: 1000
  });
  assert.deepEqual(part(RangeName.ENTRY_CROSSING), {
    start: 200,
    end: 400
  });
  assert.deepEqual(part(RangeName.EXIT_CROSSING), {
    start: 800,
    end: 1000
  });
});

test("a subject taller than the viewport contains from its start edge to its end edge crossing", () => {
  const tall: ScrollGeometry = {
    ...viewing,
    subject: {
      start: 800,
      size: 900
    }
  };
  const contain = rangeOffsets({
    geometry: tall,
    start: pointAt({ name: RangeName.CONTAIN }),
    end: pointAt({
      name: RangeName.CONTAIN,
      fraction: 1
    })
  });
  assert.deepEqual(contain, {
    start: 800,
    end: 1100
  });
});

test("a view inset shrinks the viewport the subject is measured against", () => {
  const inset: ScrollGeometry = {
    ...viewing,
    inset: {
      start: {
        isAuto: false,
        offset: {
          pixels: 100,
          fraction: 0
        }
      },
      end: {
        isAuto: false,
        offset: {
          pixels: 0,
          fraction: 0.1
        }
      }
    }
  };
  assert.deepEqual(
    rangeOffsets({
      geometry: inset,
      start: null,
      end: null
    }), {
      start: SUBJECT_START - (VIEWPORT - 60),
      end: SUBJECT_START + SUBJECT_SIZE - 100
    }
  );
});

test("an offset inside a named part is measured from the part's start, in its length", () => {
  assert.deepEqual(
    rangeOffsets({
      geometry: viewing,
      start: pointAt({
        name: RangeName.ENTRY,
        fraction: 0.5
      }),
      end: pointAt({
        name: RangeName.EXIT,
        pixels: 50
      })
    }), {
      start: 300,
      end: 850
    }
  );
});

test("an empty range keeps a span, so the progress never divides by zero", () => {
  const { start, end } = rangeOffsets({
    geometry: {
      ...scrolling,
      scrollExtent: 0
    },
    start: null,
    end: null
  });
  assert.ok(end > start);
});

test("progress is the scroll offset between the link's start and end, clamped, reversed on request", () => {
  assert.equal(
    progressExpression({
      axis: ScrollAxis.VERTICAL,
      isReversed: false
    }),
    "Clamp((-scroller.Translation.Y - link.Start) / (link.End - link.Start), 0, 1)"
  );
  assert.equal(
    progressExpression({
      axis: ScrollAxis.HORIZONTAL,
      isReversed: true
    }),
    "1 - Clamp((-scroller.Translation.X - link.Start) / (link.End - link.Start), 0, 1)"
  );
});

test("two key frames are one clamped Lerp over the progress", () => {
  assert.equal(
    trackExpression({
      track: {
        property: LinkedProperty.OPACITY,
        frames: [{
          offset: 0,
          value: 1
        }, {
          offset: 1,
          value: 0
        }]
      },
      underlying: 1
    }),
    "Lerp(1, 0, Clamp((link.Progress - 0) / 1, 0, 1))"
  );
});

test("more key frames add one Lerp of the change for each segment", () => {
  assert.equal(
    trackExpression({
      track: {
        property: LinkedProperty.TRANSLATION_Y,
        frames: [{
          offset: 0,
          value: 0
        }, {
          offset: 0.25,
          value: 40
        }, {
          offset: 1,
          value: 10
        }]
      },
      underlying: 0
    }),
    "Lerp(0, 40, Clamp((link.Progress - 0) / 0.25, 0, 1)) + Lerp(0, -30, Clamp((link.Progress - 0.25) / 0.75, 0, 1))"
  );
});

test("a track that starts late or ends early holds the element's own value there", () => {
  assert.equal(
    trackExpression({
      track: {
        property: LinkedProperty.OPACITY,
        frames: [{
          offset: 0.5,
          value: 0
        }]
      },
      underlying: 0.8
    }),
    "Lerp(0.8, 0, Clamp((link.Progress - 0) / 0.5, 0, 1)) + Lerp(0, 0.8, Clamp((link.Progress - 0.5) / 0.5, 0, 1))"
  );
});
