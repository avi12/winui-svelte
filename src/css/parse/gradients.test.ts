import { parseGradient } from "./gradients.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

function gradientOf(text: string) {
  const result = parseGradient(text);
  assert.ok(result.isValid, result.isValid ? "" : result.reason);
  return result.gradient;
}

function reasonOf(text: string) {
  const result = parseGradient(text);
  assert.ok(!result.isValid, `${text} should not parse`);
  return result.reason;
}

function lineOf(text: string) {
  const gradient = gradientOf(text);
  assert.equal(gradient.kind, "linear");
  return gradient.kind === "linear" ? [gradient.start, gradient.end] : [];
}

function ellipseOf(text: string) {
  const gradient = gradientOf(text);
  assert.equal(gradient.kind, "radial");
  return gradient.kind === "radial" ? [gradient.center, gradient.radiusX, gradient.radiusY] : [];
}

test("linear: no direction runs top to bottom, ends take 0% and 100%", () => {
  assert.deepEqual(gradientOf("linear-gradient(red, blue)"), {
    kind: "linear",
    start: {
      x: 0.5,
      y: 0
    },
    end: {
      x: 0.5,
      y: 1
    },
    stops: [
      {
        color: "#FF0000",
        offset: 0
      },
      {
        color: "#0000FF",
        offset: 1
      }
    ],
    warnings: []
  });
});

test("linear: side keywords are exact", () => {
  const cases: Array<[string, [number, number], [number, number]]> = [
    ["to top", [0.5, 1], [0.5, 0]],
    ["to right", [0, 0.5], [1, 0.5]],
    ["to bottom", [0.5, 0], [0.5, 1]],
    ["to left", [1, 0.5], [0, 0.5]],
    ["to bottom right", [0, 0], [1, 1]],
    ["to right bottom", [0, 0], [1, 1]],
    ["to top left", [1, 1], [0, 0]]
  ];
  for (const [direction, [startX, startY], [endX, endY]] of cases) {
    assert.deepEqual(
      lineOf(`linear-gradient(${direction}, red, blue)`), [
        {
          x: startX,
          y: startY
        },
        {
          x: endX,
          y: endY
        }
      ], direction
    );
    assert.deepEqual(gradientOf(`linear-gradient(${direction}, red, blue)`).warnings, []);
  }
});

test("linear: cardinal angles are exact, in every unit", () => {
  for (const angle of ["0deg", "0", "360deg", "1turn", "400grad"]) {
    assert.deepEqual(
      lineOf(`linear-gradient(${angle}, red, blue)`), [
        {
          x: 0.5,
          y: 1
        },
        {
          x: 0.5,
          y: 0
        }
      ], angle
    );
    assert.deepEqual(gradientOf(`linear-gradient(${angle}, red, blue)`).warnings, []);
  }

  assert.deepEqual(lineOf("linear-gradient(90deg, red, blue)"), [
    {
      x: 0,
      y: 0.5
    },
    {
      x: 1,
      y: 0.5
    }
  ]);
  assert.deepEqual(lineOf("linear-gradient(180deg, red, blue)"), [
    {
      x: 0.5,
      y: 0
    },
    {
      x: 0.5,
      y: 1
    }
  ]);
  assert.deepEqual(lineOf("linear-gradient(0.25turn, red, blue)"), lineOf("linear-gradient(90deg, red, blue)"));
});

test("linear: a diagonal angle is the corner-to-corner line of a square, with a warning", () => {
  assert.deepEqual(lineOf("linear-gradient(45deg, red, blue)"), [
    {
      x: 0,
      y: 1
    },
    {
      x: 1,
      y: 0
    }
  ]);
  const { warnings } = gradientOf("linear-gradient(45deg, red, blue)");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /^45deg is exact on a square element only/u);
});

test("stops: missing positions are spread evenly between their neighbors", () => {
  const even = gradientOf("linear-gradient(red, yellow, lime, blue)");
  assert.deepEqual(even.stops.map(stop => stop.offset), [0, 0.3333, 0.6667, 1]);
  const anchored = gradientOf("linear-gradient(red, yellow, lime 80%, blue)");
  assert.deepEqual(anchored.stops.map(stop => stop.offset), [0, 0.4, 0.8, 1]);
});

test("stops: given positions are kept, and never run backward", () => {
  const gradient = gradientOf("linear-gradient(red 10%, yellow 5%, blue 90%)");
  assert.deepEqual(gradient.stops.map(stop => stop.offset), [0.1, 0.1, 0.9]);
});

test("stops: two positions make a stop that holds its color", () => {
  assert.deepEqual(gradientOf("linear-gradient(red 0% 50%, blue 50% 100%)").stops, [
    {
      color: "#FF0000",
      offset: 0
    },
    {
      color: "#FF0000",
      offset: 0.5
    },
    {
      color: "#0000FF",
      offset: 0.5
    },
    {
      color: "#0000FF",
      offset: 1
    }
  ]);
});

test("stops: colors are spelled the way XAML takes them", () => {
  const gradient = gradientOf("linear-gradient(to right, #0af, rgb(0 0 0 / 50%) 50%, hsl(120, 100%, 25%))");
  assert.deepEqual(gradient.stops.map(stop => stop.color), ["#00AAFF", "#80000000", "#008000"]);
});

test("stops: transparent fades the neighbor's color, not white", () => {
  assert.deepEqual(gradientOf("linear-gradient(red, transparent)").stops, [
    {
      color: "#FF0000",
      offset: 0
    },
    {
      color: "#00FF0000",
      offset: 1
    }
  ]);
  assert.deepEqual(gradientOf("linear-gradient(red, transparent, blue)").stops, [
    {
      color: "#FF0000",
      offset: 0
    },
    {
      color: "#00FF0000",
      offset: 0.5
    },
    {
      color: "#000000FF",
      offset: 0.5
    },
    {
      color: "#0000FF",
      offset: 1
    }
  ]);
});

test("radial: the default is an ellipse reaching the farthest corner from the middle", () => {
  assert.deepEqual(gradientOf("radial-gradient(red, blue)"), {
    kind: "radial",
    center: {
      x: 0.5,
      y: 0.5
    },
    radiusX: 0.7071,
    radiusY: 0.7071,
    stops: [
      {
        color: "#FF0000",
        offset: 0
      },
      {
        color: "#0000FF",
        offset: 1
      }
    ],
    warnings: []
  });
});

test("radial: size keywords and a position", () => {
  assert.deepEqual(ellipseOf("radial-gradient(closest-side, red, blue)"), [
    {
      x: 0.5,
      y: 0.5
    },
    0.5,
    0.5
  ]);
  assert.deepEqual(ellipseOf("radial-gradient(ellipse farthest-corner at 25% 50%, red, blue)"), [
    {
      x: 0.25,
      y: 0.5
    },
    1.0607,
    0.7071
  ]);
  assert.deepEqual(ellipseOf("radial-gradient(farthest-side at left top, red, blue)"), [
    {
      x: 0,
      y: 0
    },
    1,
    1
  ]);
  assert.deepEqual(ellipseOf("radial-gradient(at top right, red, blue)")[0], {
    x: 1,
    y: 0
  });
  assert.deepEqual(ellipseOf("radial-gradient(at bottom, red, blue)")[0], {
    x: 0.5,
    y: 1
  });
});

test("radial: ellipse radii as percentages", () => {
  assert.deepEqual(ellipseOf("radial-gradient(ellipse 50% 30% at 40% 60%, red, blue)"), [
    {
      x: 0.4,
      y: 0.6
    },
    0.5,
    0.3
  ]);
});

test("radial: a circle is a circle on a square element only, and says so", () => {
  const gradient = gradientOf("radial-gradient(circle closest-side, red, blue)");
  assert.deepEqual(ellipseOf("radial-gradient(circle closest-side, red, blue)").slice(1), [0.5, 0.5]);
  assert.match(gradient.warnings[0] ?? "", /^circle is a circle on a square element only/u);
});

test("malformed gradients say what is wrong", () => {
  const cases: Array<[string, RegExp]> = [
    ["linear-gradient(red)", /^a gradient needs at least two color stops$/u],
    ["linear-gradient()", /^a gradient needs at least two color stops$/u],
    ["linear-gradient(to nowhere, red, blue)", /^expected a direction such as "to right" or "to bottom left", found "to nowhere"$/u],
    ["linear-gradient(to left right, red, blue)", /^expected a direction/u],
    ["linear-gradient(red, sparkly)", /^expected a color stop \(a color and up to two percentages\), found "sparkly"$/u],
    ["linear-gradient(red 10px, blue)", /^"10px" is not a stop position \(WinUI maps a gradient to the element's size, so a position is a percentage, not a length\)$/u],
    ["linear-gradient(red -10%, blue)", /^"-10%" is outside the gradient/u],
    ["linear-gradient(red 120%, blue)", /^"120%" is outside the gradient/u],
    ["linear-gradient(red 1% 2% 3%, blue)", /^expected a color stop/u],
    ["linear-gradient(red, 50%, blue)", /^a color hint \("50%"\) has no WinUI meaning/u],
    ["linear-gradient(var(--a), blue)", /^var\(--a\) cannot be a gradient stop/u],
    ["repeating-linear-gradient(red, blue 10%)", /^repeating-linear-gradient has no WinUI meaning/u],
    ["conic-gradient(red, blue)", /^conic-gradient has no WinUI meaning/u],
    ["url(a.png)", /^expected linear-gradient\(\) or radial-gradient\(\), found "url\(a\.png\)"/u],
    ["radial-gradient(50px, red, blue)", /^"50px" is not a radius WinUI can use/u],
    ["radial-gradient(circle 50% 50%, red, blue)", /^expected two percentages for the radii of an ellipse/u],
    ["radial-gradient(closest-side 50% 50%, red, blue)", /^expected a size keyword or percentages for the radii, not both$/u],
    ["radial-gradient(sideways, red, blue)", /^expected a color stop/u],
    ["radial-gradient(at nowhere, red, blue)", /^expected a position of keywords/u],
    ["radial-gradient(at, red, blue)", /^expected a position after "at"$/u],
    ["radial-gradient(closest-side at left, red, blue)", /^the gradient's size is zero here/u]
  ];
  for (const [text, pattern] of cases) {
    assert.match(reasonOf(text), pattern, text);
  }
});
