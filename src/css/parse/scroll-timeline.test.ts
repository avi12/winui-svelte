import {
  parseAxis,
  parseRangePoint,
  parseTimeline,
  parseTimelineName,
  parseViewInset,
  ScrollAxis,
  Scroller,
  splitRange,
  TimelineKind
} from "./scroll-timeline.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The scroll-driven animation values: animation-timeline items, timeline names
// and insets, and animation-range.

const NO_INSET = {
  isAuto: true,
  offset: {
    pixels: 0,
    fraction: 0
  }
};

test("auto and none are timeline items", () => {
  assert.deepEqual(parseTimeline("auto"), {
    isValid: true,
    value: {
      kind: TimelineKind.AUTO
    }
  });
  assert.deepEqual(parseTimeline(" NONE "), {
    isValid: true,
    value: {
      kind: TimelineKind.NONE
    }
  });
});

test("scroll() takes a scroller and an axis in either order, nearest and block by default", () => {
  assert.deepEqual(parseTimeline("scroll()"), {
    isValid: true,
    value: {
      kind: TimelineKind.SCROLL,
      scroller: Scroller.NEAREST,
      axis: ScrollAxis.VERTICAL
    }
  });
  assert.deepEqual(parseTimeline("scroll(root inline)"), {
    isValid: true,
    value: {
      kind: TimelineKind.SCROLL,
      scroller: Scroller.ROOT,
      axis: ScrollAxis.HORIZONTAL
    }
  });
  assert.deepEqual(parseTimeline("scroll(x self)"), {
    isValid: true,
    value: {
      kind: TimelineKind.SCROLL,
      scroller: Scroller.SELF,
      axis: ScrollAxis.HORIZONTAL
    }
  });
});

test("scroll() with a word it does not know, or a scroller twice, is invalid with a reason", () => {
  const unknown = parseTimeline("scroll(sideways)");
  assert.equal(unknown.isValid, false);
  assert.match(unknown.isValid ? "" : unknown.reason, /scroll\(\) takes a scroller \(nearest, root, self\) and an axis/u);
  assert.equal(parseTimeline("scroll(root self)").isValid, false);
});

test("view() takes an axis and one or two insets", () => {
  assert.deepEqual(parseTimeline("view()"), {
    isValid: true,
    value: {
      kind: TimelineKind.VIEW,
      axis: ScrollAxis.VERTICAL,
      inset: {
        start: NO_INSET,
        end: NO_INSET
      }
    }
  });
  const inset = parseTimeline("view(inline 10px 20%)");
  assert.deepEqual(inset, {
    isValid: true,
    value: {
      kind: TimelineKind.VIEW,
      axis: ScrollAxis.HORIZONTAL,
      inset: {
        start: {
          isAuto: false,
          offset: {
            pixels: 10,
            fraction: 0
          }
        },
        end: {
          isAuto: false,
          offset: {
            pixels: 0,
            fraction: 0.2
          }
        }
      }
    }
  });
});

test("one inset serves both sides of view()", () => {
  const parsed = parseViewInset("5px");
  assert.equal(parsed.isValid && parsed.value.end.offset.pixels, 5);
  const invalid = parseViewInset("5px 6px 7px");
  assert.equal(invalid.isValid, false);
  assert.equal(parseViewInset("2em").isValid, false);
});

test("a dashed name is a named timeline, a bare word is not", () => {
  assert.deepEqual(parseTimeline("--hero"), {
    isValid: true,
    value: {
      kind: TimelineKind.NAMED,
      name: "--hero"
    }
  });
  const bare = parseTimeline("hero");
  assert.equal(bare.isValid, false);
  assert.match(bare.isValid ? "" : bare.reason, /expected auto, none, scroll\(\), view\(\) or a dashed name such as --hero, found "hero"/u);
});

test("a timeline name is none or a dashed name", () => {
  assert.deepEqual(parseTimelineName("none"), {
    isValid: true,
    value: null
  });
  assert.deepEqual(parseTimelineName("--card"), {
    isValid: true,
    value: "--card"
  });
  assert.equal(parseTimelineName("card").isValid, false);
});

test("block and y are vertical, inline and x are horizontal", () => {
  assert.equal(parseAxis("block"), ScrollAxis.VERTICAL);
  assert.equal(parseAxis("Y"), ScrollAxis.VERTICAL);
  assert.equal(parseAxis("inline"), ScrollAxis.HORIZONTAL);
  assert.equal(parseAxis("x"), ScrollAxis.HORIZONTAL);
  assert.equal(parseAxis("z"), null);
});

test("a range point is normal, an offset, a name, or a name with an offset", () => {
  assert.deepEqual(
    parseRangePoint({
      text: "normal",
      isEnd: false
    }), {
      isValid: true,
      value: null
    }
  );
  assert.deepEqual(
    parseRangePoint({
      text: "25%",
      isEnd: false
    }), {
      isValid: true,
      value: {
        name: null,
        offset: {
          pixels: 0,
          fraction: 0.25
        }
      }
    }
  );
  assert.deepEqual(
    parseRangePoint({
      text: "entry 40px",
      isEnd: false
    }), {
      isValid: true,
      value: {
        name: "entry",
        offset: {
          pixels: 40,
          fraction: 0
        }
      }
    }
  );
});

test("a range name alone is the start of the part for a start and the end of it for an end", () => {
  const start = parseRangePoint({
    text: "cover",
    isEnd: false
  });
  const end = parseRangePoint({
    text: "cover",
    isEnd: true
  });
  assert.equal(start.isValid && start.value?.offset.fraction, 0);
  assert.equal(end.isValid && end.value?.offset.fraction, 1);
});

test("a range with a word that is no name or offset is invalid", () => {
  const invalid = parseRangePoint({
    text: "middle 10%",
    isEnd: false
  });
  assert.equal(invalid.isValid, false);
  assert.match(invalid.isValid ? "" : invalid.reason, /a range name \(cover, contain, entry, exit, entry-crossing, exit-crossing\)/u);
  assert.equal(
    parseRangePoint({
      text: "entry 10% 20%",
      isEnd: false
    }).isValid, false
  );
});

test("the animation-range shorthand splits into a start and an end", () => {
  assert.deepEqual(splitRange("entry 10% exit 90%"), {
    isValid: true,
    value: {
      start: "entry 10%",
      end: "exit 90%"
    }
  });
  assert.deepEqual(splitRange("entry"), {
    isValid: true,
    value: {
      start: "entry",
      end: "entry"
    }
  });
  assert.deepEqual(splitRange("20% 80%"), {
    isValid: true,
    value: {
      start: "20%",
      end: "80%"
    }
  });
  assert.deepEqual(splitRange("20%"), {
    isValid: true,
    value: {
      start: "20%",
      end: "normal"
    }
  });
  assert.equal(splitRange("").isValid, false);
  assert.equal(splitRange("a b c").isValid, false);
});
