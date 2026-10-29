import {
  attachedList,
  cornerSides,
  dateTicks,
  DurationKind,
  durationParts,
  fontWeightNumber,
  gridLengthParts,
  GridUnit,
  isResourceRecord,
  isSvgBytes,
  isSvgUri,
  numberList,
  parseColor,
  pathMarkup,
  pointList,
  RepeatKind,
  repeatParts,
  thicknessSides,
  ticksDate,
  ticksMilliseconds,
  timeSpanTicks
} from "./values.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a number is every side of a thickness", () => {
  assert.deepEqual(thicknessSides(8), [8, 8, 8, 8]);
});

test("a pair is left-right and top-bottom, as in XAML", () => {
  assert.deepEqual(thicknessSides([8, 4]), [8, 4, 8, 4]);
});

test("four numbers are left, top, right, bottom", () => {
  assert.deepEqual(thicknessSides([1, 2, 3, 4]), [1, 2, 3, 4]);
});

test("a string without commas is CSS order, top right bottom left", () => {
  assert.deepEqual(thicknessSides("12px 16px"), [16, 12, 16, 12]);
  assert.deepEqual(thicknessSides("1 2 3"), [2, 1, 2, 3]);
  assert.deepEqual(thicknessSides("1 2 3 4"), [4, 1, 2, 3]);
});

test("a string with commas is XAML order", () => {
  assert.deepEqual(thicknessSides("1,2,3,4"), [1, 2, 3, 4]);
  assert.deepEqual(thicknessSides("8,4"), [8, 4, 8, 4]);
});

test("a thickness that is not a length fails with the text", () => {
  assert.throws(() => thicknessSides("wide"), /"wide" is not a length/u);
});

test("a corner radius reads like a thickness, in corner order", () => {
  assert.deepEqual(cornerSides(6), [6, 6, 6, 6]);
  assert.deepEqual(cornerSides([1, 2, 3, 4]), [1, 2, 3, 4]);
  assert.deepEqual(cornerSides("4,8"), [4, 8, 4, 8]);
});

test("a grid length is pixels, Auto or a star weight", () => {
  assert.deepEqual(gridLengthParts(120), {
    unit: GridUnit.PIXEL,
    value: 120
  });
  assert.deepEqual(gridLengthParts("Auto"), {
    unit: GridUnit.AUTO,
    value: 1
  });
  assert.deepEqual(gridLengthParts("*"), {
    unit: GridUnit.STAR,
    value: 1
  });
  assert.deepEqual(gridLengthParts("2*"), {
    unit: GridUnit.STAR,
    value: 2
  });
});

test("a color is #rgb, #rrggbb or #aarrggbb", () => {
  assert.deepEqual(parseColor("#fff"), {
    a: 255,
    r: 255,
    g: 255,
    b: 255
  });
  assert.deepEqual(parseColor("#0a141e"), {
    a: 255,
    r: 10,
    g: 20,
    b: 30
  });
  assert.deepEqual(parseColor("#800a141e"), {
    a: 128,
    r: 10,
    g: 20,
    b: 30
  });
  assert.equal(parseColor("CardBackgroundFillColorDefaultBrush"), null);
});

test("attached takes one entry or a list of them", () => {
  const owner = {};
  assert.deepEqual(attachedList([owner, "Row", 1]), [[owner, "Row", 1]]);
  assert.deepEqual(attachedList([[owner, "Row", 1], [owner, "Column", 2]]), [[owner, "Row", 1], [owner, "Column", 2]]);
});

const TICKS_PER_SECOND = 10_000_000n;

test("a number is milliseconds, text carries its unit", () => {
  assert.equal(timeSpanTicks(300), 3_000_000n);
  assert.equal(timeSpanTicks("0.3s"), 3_000_000n);
  assert.equal(timeSpanTicks("300ms"), 3_000_000n);
  assert.equal(timeSpanTicks("2 m"), 120n * TICKS_PER_SECOND);
  assert.equal(timeSpanTicks("1h"), 3600n * TICKS_PER_SECOND);
  assert.equal(timeSpanTicks("-1s"), -TICKS_PER_SECOND);
});

test("a time span can be written as a clock", () => {
  assert.equal(timeSpanTicks("0:00:05"), 5n * TICKS_PER_SECOND);
  assert.equal(timeSpanTicks("00:00:00.3"), 3_000_000n);
  assert.equal(timeSpanTicks("1:30"), 5400n * TICKS_PER_SECOND);
  assert.equal(timeSpanTicks("-0:00:01"), -TICKS_PER_SECOND);
});

test("a time span that is none fails with the text", () => {
  assert.throws(() => timeSpanTicks("soon"), /"soon" is not a time span/u);
  assert.throws(() => timeSpanTicks(Number.NaN), /NaN is not a time span/u);
  assert.throws(() => timeSpanTicks("1:2:3:4"), /is not a time span/u);
});

test("ticks read back as the milliseconds they came from", () => {
  assert.equal(ticksMilliseconds(timeSpanTicks(250)), 250);
});

test("a duration is a time span, auto or forever", () => {
  assert.deepEqual(durationParts("0.3s"), {
    kind: DurationKind.TIME_SPAN,
    ticks: 3_000_000n
  });
  assert.deepEqual(durationParts(500), {
    kind: DurationKind.TIME_SPAN,
    ticks: 5_000_000n
  });
  assert.deepEqual(durationParts(" Auto "), {
    kind: DurationKind.AUTOMATIC,
    ticks: 0n
  });
  assert.deepEqual(durationParts("forever"), {
    kind: DurationKind.FOREVER,
    ticks: 0n
  });
});

test("a repeat is a count, a length of time or forever", () => {
  assert.deepEqual(repeatParts(3), {
    kind: RepeatKind.COUNT,
    count: 3,
    ticks: 0n
  });
  assert.deepEqual(repeatParts("2.5x"), {
    kind: RepeatKind.COUNT,
    count: 2.5,
    ticks: 0n
  });
  assert.deepEqual(repeatParts("2s"), {
    kind: RepeatKind.DURATION,
    count: 0,
    ticks: 2n * TICKS_PER_SECOND
  });
  assert.deepEqual(repeatParts("Forever"), {
    kind: RepeatKind.FOREVER,
    count: 0,
    ticks: 0n
  });
});

test("a font weight is a name or a number from 1 to 999", () => {
  assert.equal(fontWeightNumber("bold"), 700);
  assert.equal(fontWeightNumber("SemiBold"), 600);
  assert.equal(fontWeightNumber("semilight"), 350);
  assert.equal(fontWeightNumber("normal"), 400);
  assert.equal(fontWeightNumber(550), 550);
  assert.equal(fontWeightNumber("700"), 700);
});

test("a font weight that is none fails", () => {
  assert.throws(() => fontWeightNumber("heavyish"), /heavyish is no font weight/u);
  assert.throws(() => fontWeightNumber(0), /0 is no font weight/u);
  assert.throws(() => fontWeightNumber(1000), /1000 is no font weight/u);
  assert.throws(() => fontWeightNumber(Number.NaN), /NaN is no font weight/u);
});

test("a list of numbers is an array or text", () => {
  assert.deepEqual(numberList([4, 2]), [4, 2]);
  assert.deepEqual(numberList("4 2"), [4, 2]);
  assert.deepEqual(numberList("4,2,1"), [4, 2, 1]);
  assert.throws(() => numberList(""), /is not a length/u);
  assert.throws(() => numberList("four"), /"four" is not a length/u);
});

test("a list of points is points, or text of pairs", () => {
  const points = [[0, 0], {
    x: 20,
    y: 0
  }] as const;
  assert.equal(pointList(points), points);
  assert.deepEqual(pointList("0,0 10,10 20,0"), [[0, 0], [10, 10], [20, 0]]);
  assert.deepEqual(pointList("0 0, 10 10"), [[0, 0], [10, 10]]);
  assert.throws(() => pointList("0,0 10"), /0,0 10 is not x, y pairs/u);
});

test("a date is a Date, milliseconds or ISO text, in ticks since 1601", () => {
  const unixEpochTicks = 116_444_736_000_000_000n;
  assert.equal(dateTicks(0), unixEpochTicks);
  assert.equal(dateTicks(new Date(0)), unixEpochTicks);
  assert.equal(dateTicks("1970-01-01T00:00:00Z"), unixEpochTicks);
  assert.equal(dateTicks(1000), unixEpochTicks + TICKS_PER_SECOND);
  assert.throws(() => dateTicks("someday"), /someday is not a date/u);
  assert.throws(() => dateTicks(new Date(Number.NaN)), /is not a date/u);
});

test("ticks read back as the Date they came from", () => {
  const moment = new Date("2026-10-29T12:34:56.789Z");
  assert.equal(ticksDate(dateTicks(moment)).toISOString(), moment.toISOString());
});

test("an SVG is told by the extension of its path, or by its data URI", () => {
  assert.equal(isSvgUri("ms-appx:///Assets/logo.svg"), true);
  assert.equal(isSvgUri("https://example.com/logo.SVG?v=2#top"), true);
  assert.equal(isSvgUri("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="), true);
  assert.equal(isSvgUri("ms-appx:///Assets/logo.png"), false);
  assert.equal(isSvgUri("https://example.com/svg/logo.png?file=a.svg"), false);
});

test("path data is wrapped as the XAML of a Path, with its characters escaped", () => {
  assert.equal(
    pathMarkup("M0,0 L10,10"),
    "<Path xmlns=\"http://schemas.microsoft.com/winfx/2006/xaml/presentation\" Data=\"M0,0 L10,10\"/>"
  );
  assert.match(pathMarkup("M0,0\"/><Button/>"), /Data="M0,0&quot;\/&gt;&lt;Button\/&gt;"/u);
});

test("a plain object is a record of resources and a WinRT object is not", () => {
  class ResourceDictionaryLike {}
  assert.equal(isResourceRecord({ accent: "#0af" }), true);
  assert.equal(isResourceRecord(Object.create(null)), true);
  assert.equal(isResourceRecord(new ResourceDictionaryLike()), false);
});

test("bytes are SVG when an svg element opens the file, PNG bytes are not", () => {
  const encoder = new TextEncoder();
  assert.equal(isSvgBytes(encoder.encode("<?xml version=\"1.0\"?> <svg xmlns=\"u\"/>")), true);
  assert.equal(isSvgBytes(encoder.encode("  <SVG width=\"1\"></SVG>")), true);
  assert.equal(isSvgBytes(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), false);
});
