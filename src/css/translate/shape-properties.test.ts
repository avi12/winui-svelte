import { computeDeclarations, resolveBuiltVariable } from "./cascade.ts";
import { loadWinuiCatalogue } from "./catalogue.ts";
import { lowerDeclarations } from "./properties.ts";
import { shapeGroups } from "./shape-properties.ts";
import { formatDiagnostic, translateStyleSheet } from "./translate.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const resources = loadWinuiCatalogue();

function lower({ elementType, declarations }: {
  elementType: string;
  declarations: string;
}) {
  const translation = translateStyleSheet({
    file: "t.svelte",
    css: `${elementType}.t { ${declarations} }`,
    resources
  });
  const rule = translation.sheet.rules[0];
  const errors = translation.diagnostics.map(formatDiagnostic);
  const isRuleMissing = rule === undefined;
  if (isRuleMissing) {
    return {
      setters: [],
      errors
    };
  }

  const lowered = lowerDeclarations({
    extraGroups: shapeGroups(),
    computed: computeDeclarations({
      matched: [rule],
      inline: []
    }),
    options: {
      elementType,
      resolveVariable: resolveBuiltVariable,
      hasStyle: () => true,
      report(diagnostic) {
        errors.push(diagnostic.message);
      }
    }
  });
  return {
    setters: lowered.setters.map(entry => [entry.property, entry.kind === "setter" ? entry.value : entry.xaml]),
    errors
  };
}

const rows: Array<[string, string, string, string[][]]> = [
  ["fill is a brush", "rectangle", "fill: #0af", [["Fill", "#00AAFF"]]],
  ["fill from a WinUI brush", "rectangle", "fill: var(--accent-fill-color-default)", [["Fill", "{ThemeResource AccentFillColorDefaultBrush}"]]],
  ["fill none is transparent", "ellipse", "fill: none", [["Fill", "#00FFFFFF"]]],
  ["dashes are multiples of the thickness", "rectangle", "stroke-width: 2px; stroke-dasharray: 8px 4px", [
    ["StrokeThickness", "2"],
    ["StrokeDashArray", "4,2"]
  ]],
  ["dashes with commas and no stroke-width", "line", "stroke-dasharray: 5px, 3px, 1px", [["StrokeDashArray", "5,3,1"]]],
  ["dasharray none clears the dashes", "line", "stroke-dasharray: none", [["StrokeDashArray", ""]]],
  ["dashoffset is a multiple of the thickness", "line", "stroke-width: 4px; stroke-dashoffset: 6px", [
    ["StrokeThickness", "4"],
    ["StrokeDashOffset", "1.5"]
  ]],
  ["linecap butt caps both ends flat", "line", "stroke-linecap: butt", [
    ["StrokeStartLineCap", "Flat"],
    ["StrokeEndLineCap", "Flat"]
  ]],
  ["linecap round", "line", "stroke-linecap: round", [
    ["StrokeStartLineCap", "Round"],
    ["StrokeEndLineCap", "Round"]
  ]],
  ["linecap square", "line", "stroke-linecap: square", [
    ["StrokeStartLineCap", "Square"],
    ["StrokeEndLineCap", "Square"]
  ]],
  ["linejoin miter", "polyline", "stroke-linejoin: miter", [["StrokeLineJoin", "Miter"]]],
  ["linejoin bevel", "polyline", "stroke-linejoin: bevel", [["StrokeLineJoin", "Bevel"]]],
  ["linejoin round", "polyline", "stroke-linejoin: round", [["StrokeLineJoin", "Round"]]],
  ["miterlimit", "polygon", "stroke-miterlimit: 4", [["StrokeMiterLimit", "4"]]],
  ["rx and ry on a rectangle", "rectangle", "rx: 6px; ry: 3px", [
    ["RadiusX", "6"],
    ["RadiusY", "3"]
  ]],
  ["fill-rule nonzero", "polygon", "fill-rule: nonzero", [["FillRule", "Nonzero"]]],
  ["fill-rule evenodd", "polygon", "fill-rule: evenodd", [["FillRule", "EvenOdd"]]]
];

for (const [name, elementType, declarations, expected] of rows) {
  test(name, () => {
    const result = lower({
      elementType,
      declarations
    });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.setters, expected);
  });
}

const failures: Array<[string, string, RegExp]> = [
  ["stroke-linecap: triangle", "line", /one of butt, round, square/u],
  ["stroke-linejoin: arcs", "polyline", /one of miter, bevel, round/u],
  ["stroke-miterlimit: 0.5", "polygon", /at least 1/u],
  ["stroke-dasharray: 4px -2px", "line", /not negative/u],
  ["fill-rule: odd", "polygon", /one of nonzero, evenodd/u]
];

for (const [declarations, elementType, pattern] of failures) {
  test(`${declarations} is an error`, () => {
    const result = lower({
      elementType,
      declarations
    });
    assert.match(result.errors.join("\n"), pattern);
  });
}
