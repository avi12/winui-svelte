import { computeDeclarations, resolveBuiltVariable } from "./cascade.ts";
import { loadWinuiCatalogue } from "./catalogue.ts";
import { LAZY_GROUPS } from "./lazy-groups.ts";
import { lowerDeclarations } from "./properties.ts";
import { COMPOSITION_PROPERTIES } from "./property-kit.ts";
import { formatDiagnostic, translateStyleSheet } from "./translate.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// Every row of the property map, through the same path a component's CSS takes:
// translated, then lowered for an element type.

const resources = loadWinuiCatalogue();

interface Lowered {
  setters: Array<[string, string]>;
  writes: Array<[string, string]>;
  basedOn: string | null;
  errors: string[];
  warnings: string[];
}

function lower({ elementType, declarations }: {
  elementType: string | null;
  declarations: string;
}) {
  const selector = elementType === null ? ".t" : `${elementType}.t`;
  const translation = translateStyleSheet({
    file: "t.svelte",
    css: `${selector} { ${declarations} }`,
    resources
  });
  const rule = translation.sheet.rules[0];
  const messages: Lowered = {
    setters: [],
    writes: [],
    basedOn: null,
    errors: translation.diagnostics.filter(diagnostic => diagnostic.severity === "error").map(formatDiagnostic),
    warnings: translation.diagnostics.filter(diagnostic => diagnostic.severity === "warning").map(formatDiagnostic)
  };
  const isRuleMissing = rule === undefined;
  if (isRuleMissing) {
    return messages;
  }

  // As the runtime does: the keys the build resolved, no catalogue.
  const lowered = lowerDeclarations({
    computed: computeDeclarations({
      matched: [rule],
      inline: []
    }),
    options: {
      elementType,
      resolveVariable: resolveBuiltVariable,
      hasStyle: () => true,
      report() {}
    },
    extraGroups: LAZY_GROUPS.flatMap(lazy => lazy.groups())
  });
  // The composition properties are written once the element has loaded; here they read as setters.
  const [composition, others] = [
    lowered.writes.filter(entry => COMPOSITION_PROPERTIES.has(entry.target)),
    lowered.writes.filter(entry => !COMPOSITION_PROPERTIES.has(entry.target))
  ];
  messages.setters = [
    ...lowered.setters.map<[string, string]>(entry => [entry.property, entry.kind === "setter" ? entry.value : entry.xaml]),
    ...composition.map<[string, string]>(entry => [entry.target, entry.value])
  ];
  messages.writes = others.map(entry => [entry.target, entry.value]);
  messages.basedOn = lowered.basedOn;
  return messages;
}

function setters({ elementType, declarations }: {
  elementType: string | null;
  declarations: string;
}) {
  const result = lower({
    elementType,
    declarations
  });
  assert.deepEqual(result.errors, [], declarations);
  return result.setters;
}

const positionRows: Array<[string, string, Array<[string, string]>]> = [
  ["absolute left and top place on a canvas", "position: absolute; left: 10px; top: 4px", [
    ["Canvas.Left", "10"],
    ["Canvas.Top", "4"]
  ]],
  ["inset expands to the four sides", "position: absolute; inset: 8px auto auto 2px", [
    ["Canvas.Left", "2"],
    ["Canvas.Top", "8"]
  ]],
  ["fixed is absolute", "position: fixed; top: 1px", [["Canvas.Top", "1"]]],
  ["auto is no offset", "position: absolute; left: auto; top: 3px", [["Canvas.Top", "3"]]],
  ["relative offsets move without relayout", "position: relative; left: 5px; bottom: 2px", [["Translation", "5,-2,0"]]],
  ["static sets nothing", "position: static", []]
];

for (const [name, declarations, expected] of positionRows) {
  test(`position: ${name}`, () => {
    assert.deepEqual(
      setters({
        elementType: null,
        declarations
      }), expected
    );
  });
}

test("position's reasons are build errors", () => {
  const cases: Array<[string, RegExp]> = [
    ["position: absolute; right: 4px", /canvas places by canvas-left and canvas-top/u],
    ["position: sticky", /sticky has no WinUI meaning/u],
    ["position: relative; left: 1px; translate: 2px", /Translation, which translate also sets/u],
    ["position: absolute; left: 50%", /left: expected a length in px/u]
  ];
  for (const [declarations, pattern] of cases) {
    assert.match(
      lower({
        elementType: null,
        declarations
      }).errors.join(), pattern, declarations
    );
  }
});

test("minmax and fit-content tracks carry their bounds", () => {
  const result = lower({
    elementType: "grid",
    declarations: "grid-template-columns: minmax(100px, 1fr) minmax(auto, 2fr) minmax(50px, 300px) fit-content(200px) min-content; grid-template-rows: minmax(0, auto)"
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.writes, [
    ["columns", "*:100:,2*,Auto:50:300,Auto::200,Auto"],
    ["rows", "Auto:0:"]
  ]);
});

test("grid-area expands to its longhands", () => {
  const result = lower({
    elementType: null,
    declarations: "grid-area: 2 / 3 / span 2 / span 4"
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.setters, [
    ["Grid.Column", "2"],
    ["Grid.ColumnSpan", "4"],
    ["Grid.Row", "1"],
    ["Grid.RowSpan", "2"]
  ]);
  assert.match(
    lower({
      elementType: null,
      declarations: "grid-area: header"
    }).errors.join(), /named grid areas have no WinUI meaning/u
  );
});

test("grid-gap is an unknown property, as every legacy name is", () => {
  const result = lower({
    elementType: "grid",
    declarations: "grid-gap: 4px"
  });
  assert.match(result.errors.join(), /grid-gap has no WinUI meaning/u);
});

test("logical properties are the left-to-right, top-to-bottom physical ones", () => {
  assert.deepEqual(
    setters({
      elementType: null,
      declarations: "margin-inline: 4px 8px; padding-block-start: 2px; inline-size: 100px; min-block-size: 20px; max-inline-size: 300px"
    }), [
      ["Margin", "4,0,8,0"],
      ["Padding", "0,2,0,0"],
      ["Width", "100"],
      ["MinHeight", "20"],
      ["MaxWidth", "300"]
    ]
  );
});

test("sizes WinUI cannot say are build errors", () => {
  const cases: Array<[string, RegExp]> = [
    ["box-sizing: content-box", /content-box has no WinUI meaning/u],
    ["width: 50%", /width: expected a length in px/u],
    ["width: calc(100% - 8px * 2px)", /expected a length in px/u]
  ];
  for (const [declarations, pattern] of cases) {
    assert.match(
      lower({
        elementType: null,
        declarations
      }).errors.join(), pattern, declarations
    );
  }
});

test("offsets without a position warn", () => {
  assert.match(
    lower({
      elementType: null,
      declarations: "left: 1px"
    }).warnings.join(), /ignored without position/u
  );
});

const rows: Array<[string, string | null, string, Array<[string, string]>]> = [
  ["margin, CSS side order to a Thickness", null, "margin: 0 12px", [["Margin", "12,0,12,0"]]],
  ["margin, one value", null, "margin: 8px", [["Margin", "8,8,8,8"]]],
  ["padding, two values", null, "padding: 12px 16px", [["Padding", "16,12,16,12"]]],
  ["padding, three values", null, "padding: 1px 2px 3px", [["Padding", "2,1,2,3"]]],
  ["padding, four values", null, "padding: 1px 2px 3px 4px", [["Padding", "4,1,2,3"]]],
  ["padding, one side", null, "padding-left: 4px", [["Padding", "4,0,0,0"]]],
  ["padding in px", null, "padding: 8px", [["Padding", "8,8,8,8"]]],
  ["gap on a vertical stack", "stack-panel", "gap: 6px", [["Spacing", "6"]]],
  ["gap on a horizontal stack takes the column gap", "stack-panel", "display: flex; gap: 2px 8px", [
    ["Orientation", "Horizontal"],
    ["Spacing", "8"]
  ]],
  ["gap on a column flex takes the row gap", "stack-panel", "display: flex; flex-direction: column; gap: 2px 8px", [
    ["Orientation", "Vertical"],
    ["Spacing", "2"]
  ]],
  ["gap on a grid", "grid", "gap: 4px 8px", [
    ["RowSpacing", "4"],
    ["ColumnSpacing", "8"]
  ]],
  ["flex-direction alone", "stack-panel", "flex-direction: row", [["Orientation", "Horizontal"]]],
  ["align-self to VerticalAlignment", null, "align-self: center", [["VerticalAlignment", "Center"]]],
  ["align-self end", null, "align-self: end", [["VerticalAlignment", "Bottom"]]],
  ["justify-self start", null, "justify-self: start", [["HorizontalAlignment", "Left"]]],
  ["justify-self right", null, "justify-self: right", [["HorizontalAlignment", "Right"]]],
  ["place-self", null, "place-self: center start", [
    ["VerticalAlignment", "Center"],
    ["HorizontalAlignment", "Left"]
  ]],
  ["width, height", null, "width: 120px; height: 32px", [
    ["Width", "120"],
    ["Height", "32"]
  ]],
  ["auto is NaN", null, "width: auto", [["Width", "NaN"]]],
  ["100% fills as the parent allows", null, "width: 100%; height: 100%", [
    ["Width", "NaN"],
    ["Height", "NaN"]
  ]],
  ["calc of lengths", null, "width: calc(100px - 2 * 8px); min-height: calc(16px + 4px)", [
    ["Width", "84"],
    ["MinHeight", "20"]
  ]],
  ["border-box is what WinUI does", null, "box-sizing: border-box", []],
  ["min and max", null, "min-width: 0; min-height: 68px; max-width: none; max-height: 300px", [
    ["MinWidth", "0"],
    ["MinHeight", "68"],
    ["MaxWidth", "Infinity"],
    ["MaxHeight", "300"]
  ]],
  ["opacity", null, "opacity: 0.5", [["Opacity", "0.5"]]],
  ["opacity as a percentage", null, "opacity: 40%", [["Opacity", "0.4"]]],
  ["color to Foreground", null, "color: #0af", [["Foreground", "#00AAFF"]]],
  ["color from a WinUI brush", null, "color: var(--text-fill-color-secondary)", [["Foreground", "{ThemeResource TextFillColorSecondaryBrush}"]]],
  ["stroke and stroke-width on a shape", "rectangle", "stroke: var(--accent-fill-color-default); stroke-width: 2px", [
    ["Stroke", "{ThemeResource AccentFillColorDefaultBrush}"],
    ["StrokeThickness", "2"]
  ]],
  ["background-color", null, "background-color: rgb(0 0 0 / 50%)", [["Background", "#80000000"]]],
  ["background to a brush", null, "background: transparent", [["Background", "#00FFFFFF"]]],
  ["background none", null, "background: none", [["Background", "#00FFFFFF"]]],
  ["background-image linear gradient", null, "background-image: linear-gradient(to right, #0af, transparent)", [[
    "Background",
    "<LinearGradientBrush StartPoint=\"0,0.5\" EndPoint=\"1,0.5\"><GradientStop Color=\"#00AAFF\" Offset=\"0\"/><GradientStop Color=\"#0000AAFF\" Offset=\"1\"/></LinearGradientBrush>"
  ]]],
  ["background shorthand with a gradient", null, "background: linear-gradient(180deg, red 20%, blue)", [[
    "Background",
    "<LinearGradientBrush StartPoint=\"0.5,0\" EndPoint=\"0.5,1\"><GradientStop Color=\"#FF0000\" Offset=\"0.2\"/><GradientStop Color=\"#0000FF\" Offset=\"1\"/></LinearGradientBrush>"
  ]]],
  ["background-image radial gradient", null, "background-image: radial-gradient(closest-side at 30% 70%, red, blue)", [[
    "Background",
    "<RadialGradientBrush Center=\"0.3,0.7\" GradientOrigin=\"0.3,0.7\" RadiusX=\"0.3\" RadiusY=\"0.3\"><GradientStop Color=\"#FF0000\" Offset=\"0\"/><GradientStop Color=\"#0000FF\" Offset=\"1\"/></RadialGradientBrush>"
  ]]],
  ["background-image none sets nothing", null, "background-image: none; opacity: 1", [["Opacity", "1"]]],
  ["a gradient replaces background-color", null, "background-color: red; background-image: linear-gradient(red, blue)", [[
    "Background",
    "<LinearGradientBrush StartPoint=\"0.5,0\" EndPoint=\"0.5,1\"><GradientStop Color=\"#FF0000\" Offset=\"0\"/><GradientStop Color=\"#0000FF\" Offset=\"1\"/></LinearGradientBrush>"
  ]]],
  ["border shorthand", null, "border: 1px solid red", [
    ["BorderThickness", "1,1,1,1"],
    ["BorderBrush", "#FF0000"]
  ]],
  ["border none", null, "border: none", [["BorderThickness", "0,0,0,0"]]],
  ["one side's border", null, "border-bottom: 2px solid blue", [
    ["BorderThickness", "0,0,0,2"],
    ["BorderBrush", "#0000FF"]
  ]],
  ["border-width and border-color", null, "border-width: 1px 2px; border-style: solid; border-color: green", [
    ["BorderThickness", "2,1,2,1"],
    ["BorderBrush", "#008000"]
  ]],
  ["border-radius, one value", null, "border-radius: 4px", [["CornerRadius", "4,4,4,4"]]],
  ["border-radius, corners clockwise from top left", null, "border-radius: 1px 2px 3px 4px", [["CornerRadius", "1,2,3,4"]]],
  ["border-radius from a WinUI resource", null, "border-radius: var(--control-corner-radius)", [["CornerRadius", "{ThemeResource ControlCornerRadius}"]]],
  ["one corner", null, "border-top-left-radius: 8px", [["CornerRadius", "8,0,0,0"]]],
  ["font-size", null, "font-size: 14px", [["FontSize", "14"]]],
  ["font-weight number", null, "font-weight: 600", [["FontWeight", "SemiBold"]]],
  ["font-weight keyword", null, "font-weight: bold", [["FontWeight", "Bold"]]],
  ["font-weight rounds to the nearest", null, "font-weight: 340", [["FontWeight", "SemiLight"]]],
  ["font-style", null, "font-style: italic", [["FontStyle", "Italic"]]],
  ["font-family with generics", null, "font-family: \"Segoe UI Variable\", monospace", [["FontFamily", "Segoe UI Variable, Consolas"]]],
  ["line-height in px fixes the line", null, "line-height: 20px", [
    ["LineHeight", "20"],
    ["LineStackingStrategy", "BlockLineHeight"]
  ]],
  ["font shorthand", null, "font: italic 600 14px/20px \"Segoe UI\"", [
    ["FontStyle", "Italic"],
    ["FontWeight", "SemiBold"],
    ["FontSize", "14"],
    ["LineHeight", "20"],
    ["LineStackingStrategy", "BlockLineHeight"],
    ["FontFamily", "Segoe UI"]
  ]],
  ["letter-spacing in thousandths of an em", null, "letter-spacing: 50", [["CharacterSpacing", "50"]]],
  ["text-align", null, "text-align: center", [["TextAlignment", "Center"]]],
  ["text-wrap", null, "text-wrap: nowrap", [["TextWrapping", "NoWrap"]]],
  ["white-space", null, "white-space: normal", [["TextWrapping", "Wrap"]]],
  ["text-overflow", null, "text-overflow: ellipsis", [["TextTrimming", "CharacterEllipsis"]]],
  ["text-decoration", null, "text-decoration: underline", [["TextDecorations", "Underline"]]],
  ["visibility hidden collapses", null, "visibility: hidden", [["Visibility", "Collapsed"]]],
  ["display none collapses", null, "display: none", [["Visibility", "Collapsed"]]],
  ["display none wins over visible", null, "visibility: visible; display: none", [["Visibility", "Collapsed"]]],
  ["display block adds nothing", null, "display: block", []],
  ["display flex is a horizontal stack", "stack-panel", "display: flex", [["Orientation", "Horizontal"]]],
  ["display grid on a grid", "grid", "display: grid", []],
  ["pointer-events", null, "pointer-events: none", [["IsHitTestVisible", "False"]]],
  ["z-index", null, "z-index: 3", [["Canvas.ZIndex", "3"]]],
  ["translate", null, "translate: 0 4px", [["Translation", "0,4,0"]]],
  ["scale", null, "scale: 1.1", [["Scale", "1.1,1.1,1"]]],
  ["rotate", null, "rotate: 45deg", [["Rotation", "45"]]],
  ["transform: one function", null, "transform: rotate(45deg)", [["RenderTransform", "<RotateTransform Angle=\"45\"/>"]]],
  ["transform: translate", null, "transform: translate(10px, 4px)", [["RenderTransform", "<TranslateTransform X=\"10\" Y=\"4\"/>"]]],
  ["transform: translate with one length", null, "transform: translate(10px)", [["RenderTransform", "<TranslateTransform X=\"10\" Y=\"0\"/>"]]],
  ["transform: scale with one factor", null, "transform: scale(1.5)", [["RenderTransform", "<ScaleTransform ScaleX=\"1.5\" ScaleY=\"1.5\"/>"]]],
  ["transform: skew in degrees", null, "transform: skew(45deg, 5deg)", [["RenderTransform", "<SkewTransform AngleX=\"45\" AngleY=\"5\"/>"]]],
  ["transform: matrix", null, "transform: matrix(1, 0, 0, 1, 20, 10)", [["RenderTransform", "<MatrixTransform Matrix=\"1,0,0,1,20,10\"/>"]]],
  ["transform: a list acts right to left", null, "transform: translate(10px, 0) rotate(90deg) scale(2)", [[
    "RenderTransform",
    "<TransformGroup><ScaleTransform ScaleX=\"2\" ScaleY=\"2\"/><RotateTransform Angle=\"90\"/><TranslateTransform X=\"10\" Y=\"0\"/></TransformGroup>"
  ]]],
  ["transform none sets nothing", null, "transform: none", []],
  ["elevation is a ThemeShadow lifted by its depth", null, "-winui-elevation: 16px", [
    ["Shadow", "<ThemeShadow/>"],
    ["Translation", "0,0,16"]
  ]],
  ["box-shadow depth is its blur", null, "box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3)", [
    ["Shadow", "<ThemeShadow/>"],
    ["Translation", "0,0,8"]
  ]],
  ["box-shadow without blur uses its larger offset", null, "box-shadow: 3px -6px red", [
    ["Shadow", "<ThemeShadow/>"],
    ["Translation", "0,0,6"]
  ]],
  ["box-shadow none casts nothing", null, "box-shadow: none", []],
  ["elevation wins over box-shadow", null, "box-shadow: 0 0 4px red; -winui-elevation: 16px", [
    ["Shadow", "<ThemeShadow/>"],
    ["Translation", "0,0,16"]
  ]],
  ["elevation keeps the x and y of translate", null, "translate: 4px 8px; -winui-elevation: 32px", [
    ["Shadow", "<ThemeShadow/>"],
    ["Translation", "4,8,32"]
  ]],
  ["backdrop blur is an acrylic tinted by the background", null, "background-color: rgba(255, 0, 0, 0.5); backdrop-filter: blur(20px)", [[
    "Background",
    "<AcrylicBrush TintColor=\"#FF0000\" TintOpacity=\"0.502\" FallbackColor=\"#FF0000\"/>"
  ]]],
  ["backdrop blur of an opaque color", null, "background-color: #123456; backdrop-filter: blur(4px)", [[
    "Background",
    "<AcrylicBrush TintColor=\"#123456\" TintOpacity=\"1\" FallbackColor=\"#123456\"/>"
  ]]],
  ["backdrop blur with no color is an untinted acrylic", null, "backdrop-filter: blur(4px)", [["Background", "<AcrylicBrush/>"]]],
  ["backdrop none sets nothing", null, "backdrop-filter: none", []],
  ["border without a width is CSS's medium", null, "border: solid red", [
    ["BorderThickness", "3,3,3,3"],
    ["BorderBrush", "#FF0000"]
  ]],
  ["outline is the focus visual", null, "outline: 2px solid #0af", [
    ["FocusVisualPrimaryThickness", "2,2,2,2"],
    ["FocusVisualPrimaryBrush", "#00AAFF"],
    ["FocusVisualSecondaryThickness", "0,0,0,0"]
  ]],
  ["outline none removes the focus visual", null, "outline: none", [
    ["FocusVisualPrimaryThickness", "0,0,0,0"],
    ["FocusVisualSecondaryThickness", "0,0,0,0"]
  ]],
  ["outline-offset pushes the focus visual outward", null, "outline: 1px solid red; outline-offset: 3px", [
    ["FocusVisualPrimaryThickness", "1,1,1,1"],
    ["FocusVisualPrimaryBrush", "#FF0000"],
    ["FocusVisualMargin", "-3,-3,-3,-3"],
    ["FocusVisualSecondaryThickness", "0,0,0,0"]
  ]],
  ["outline-color alone", null, "outline-color: red", [
    ["FocusVisualPrimaryBrush", "#FF0000"],
    ["FocusVisualSecondaryThickness", "0,0,0,0"]
  ]],
  ["grid-column with a span", "grid", "grid-column: 2 / span 2", [
    ["Grid.Column", "1"],
    ["Grid.ColumnSpan", "2"]
  ]],
  ["grid-row from line to line", "grid", "grid-row: 1 / 3", [
    ["Grid.Row", "0"],
    ["Grid.RowSpan", "2"]
  ]],
  ["span alone", "grid", "grid-column: span 3", [["Grid.ColumnSpan", "3"]]],
  ["overflow on a scroll viewer", "scroll-viewer", "overflow-y: auto; overflow-x: hidden", [
    ["HorizontalScrollBarVisibility", "Disabled"],
    ["VerticalScrollBarVisibility", "Auto"]
  ]],
  ["transition on opacity", null, "transition: opacity 200ms", [["OpacityTransition", "<ScalarTransition Duration=\"0:0:0.200\"/>"]]],
  ["transitions in a list", null, "transition: opacity 0.2s, translate 100ms, background-color 1s", [
    ["OpacityTransition", "<ScalarTransition Duration=\"0:0:0.200\"/>"],
    ["TranslationTransition", "<Vector3Transition Duration=\"0:0:0.100\"/>"],
    ["BackgroundTransition", "<BrushTransition Duration=\"0:0:1.000\"/>"]
  ]],
  ["user-select none", null, "user-select: none", [["IsTextSelectionEnabled", "False"]]],
  ["user-select text", null, "user-select: text", [["IsTextSelectionEnabled", "True"]]],
  ["object-fit cover", null, "object-fit: cover", [["Stretch", "UniformToFill"]]],
  ["object-fit contain", null, "object-fit: contain", [["Stretch", "Uniform"]]],
  ["word-break break-all", null, "word-break: break-all", [["TextWrapping", "Wrap"]]],
  ["word-break keep-all", null, "word-break: keep-all", [["TextWrapping", "WrapWholeWords"]]],
  ["line-clamp wraps, trims and counts", null, "line-clamp: 3", [
    ["TextWrapping", "Wrap"],
    ["TextTrimming", "CharacterEllipsis"],
    ["MaxLines", "3"]
  ]],
  ["-webkit-line-clamp", null, "-webkit-line-clamp: 2", [
    ["TextWrapping", "Wrap"],
    ["TextTrimming", "CharacterEllipsis"],
    ["MaxLines", "2"]
  ]],
  ["line-clamp none", null, "line-clamp: none", [["MaxLines", "0"]]],
  ["text-overflow clip wins over the clamp's ellipsis", null, "line-clamp: 2; text-overflow: clip", [
    ["TextWrapping", "Wrap"],
    ["MaxLines", "2"],
    ["TextTrimming", "Clip"]
  ]]
];

function sortedRows(rows: Array<[string, string]>) {
  return rows.toSorted((left, right) => left.join().localeCompare(right.join()));
}

for (const [name, elementType, declarations, expected] of rows) {
  test(`${name}: ${declarations}`, () => {
    // The order of setters in a Style does not matter.
    assert.deepEqual(
      sortedRows(
        setters({
          elementType,
          declarations
        })
      ), sortedRows(expected)
    );
  });
}

test("a later declaration beats an earlier one, and !important beats a later one", () => {
  assert.deepEqual(
    setters({
      elementType: null,
      declarations: "padding: 1px; padding: 2px"
    }), [["Padding", "2,2,2,2"]]
  );
  assert.deepEqual(
    setters({
      elementType: null,
      declarations: "opacity: 1 !important; opacity: 0.5"
    }), [["Opacity", "1"]]
  );
});

test("grid templates are written to the grid, not set by a Style", () => {
  const result = lower({
    elementType: "grid",
    declarations: "grid-template-columns: auto 1fr 2fr 120px; grid-template-rows: repeat(2, auto)"
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.writes, [
    ["columns", "Auto,*,2*,120"],
    ["rows", "Auto,Auto"]
  ]);
  assert.deepEqual(
    lower({
      elementType: "grid",
      declarations: "grid-template-columns: none"
    }).writes, [["columns", ""]]
  );
});

const originRows: Array<[string, string, Array<[string, string]>]> = [
  ["scale pivots at the centre by default, as CSS does", "scale: 1.1", [["origin", "50%,50%"]]],
  ["rotate pivots at the centre by default", "rotate: 10deg", [["origin", "50%,50%"]]],
  ["translate needs no pivot", "translate: 4px 0", []],
  ["keywords", "scale: 2; transform-origin: left top", [["origin", "0%,0%"]]],
  ["keywords in either order", "scale: 2; transform-origin: bottom right", [["origin", "100%,100%"]]],
  ["one keyword leaves the other axis centred", "rotate: 5deg; transform-origin: top", [["origin", "50%,0%"]]],
  ["one length is the horizontal one", "scale: 2; transform-origin: 12px", [["origin", "12px,50%"]]],
  ["percentages and lengths mix", "scale: 2; transform-origin: 25% 8px", [["origin", "25%,8px"]]],
  ["an origin with nothing to pivot is still written", "transform-origin: center", [["origin", "50%,50%"]]]
];

for (const [name, declarations, expected] of originRows) {
  test(`transform-origin, ${name}: ${declarations}`, () => {
    const result = lower({
      elementType: null,
      declarations
    });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.writes, expected);
  });
}

test("a transform-origin that is not a pair of positions fails the build", () => {
  for (const declarations of ["transform-origin: 1 2", "transform-origin: left right", "transform-origin: 1px 2px 3px", "transform-origin: sideways"]) {
    const result = lower({
      elementType: null,
      declarations
    });
    assert.match(result.errors.join(" "), /transform-origin: expected/u, declarations);
  }
});

test("a transform pivots about the centre, or transform-origin", () => {
  assert.deepEqual(
    lower({
      elementType: null,
      declarations: "transform: rotate(10deg)"
    }).writes, [["render-origin", "50%,50%"]]
  );
  assert.deepEqual(
    lower({
      elementType: null,
      declarations: "transform: rotate(10deg); scale: 2; transform-origin: top left"
    }).writes, [["origin", "0%,0%"]]
  );
  assert.deepEqual(
    lower({
      elementType: null,
      declarations: "transform: rotate(10deg); scale: 2"
    }).writes, [["origin", "50%,50%"]]
  );
});

test("elevation and a backdrop blur warn what WinUI cannot do", () => {
  const elevation = lower({
    elementType: null,
    declarations: "-winui-elevation: 8px"
  });
  assert.deepEqual(elevation.errors, []);
  assert.match(elevation.warnings.join(" "), /-winui-elevation: a ThemeShadow draws with no receivers on Windows 11 and later/u);
  const backdrop = lower({
    elementType: null,
    declarations: "backdrop-filter: blur(10px)"
  });
  assert.match(backdrop.warnings.join(" "), /the blur radius is ignored/u);
  assert.match(backdrop.warnings.join(" "), /no literal background-color/u);
});

test("a transition on a transform WinUI cannot animate says so", () => {
  const result = lower({
    elementType: null,
    declarations: "transform: skew(10deg); transition: transform 200ms, opacity 200ms"
  });
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join(" "), /transition: transform animates only a list of translate, rotate and scale/u);
  assert.deepEqual(result.setters.map(([property]) => property).filter(property => !property.endsWith("Transition")), ["RenderTransform"]);
});

test("a transformed element with a transition is lowered to the properties WinUI animates", () => {
  const result = lower({
    elementType: null,
    declarations: "transform: translate(4px, 8px) rotate(10deg) scale(1.5); transition: transform 200ms"
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.setters.filter(([property]) => !property.endsWith("Transition")), [
    ["Translation", "4,8,0"],
    ["Scale", "1.5,1.5,1"],
    ["Rotation", "10"]
  ]);
});

test("a transform out of translate, rotate, scale order stays a RenderTransform", () => {
  const result = lower({
    elementType: null,
    declarations: "transform: scale(2) translate(4px); transition: all 1s"
  });
  assert.deepEqual(result.setters.map(([property]) => property).includes("RenderTransform"), true);
});

test("an outline makes the control use the system's focus visuals", () => {
  assert.deepEqual(
    lower({
      elementType: "button",
      declarations: "outline: 2px solid red"
    }).writes, [["focusVisuals", "true"]]
  );
  assert.deepEqual(
    lower({
      elementType: "button",
      declarations: "outline: none"
    }).writes, []
  );
});

test("-winui-based-on names a WinUI style", () => {
  assert.equal(
    lower({
      elementType: "text-block",
      declarations: "-winui-based-on: BodyTextBlockStyle"
    }).basedOn, "BodyTextBlockStyle"
  );
});

test("cursor is ignored with a warning, not an error", () => {
  const result = lower({
    elementType: null,
    declarations: "cursor: pointer; opacity: 1"
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0] ?? "", /^t\.svelte:1:\d+: warning: cursor ignored/u);
  assert.deepEqual(result.setters, [["Opacity", "1"]]);
});

test("a gradient warns where WinUI cannot keep it exact, and when it replaces a color", () => {
  const result = lower({
    elementType: null,
    declarations: "background-color: red; background-image: linear-gradient(45deg, red, blue)"
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0] ?? "", /^t\.svelte:1:\d+: warning: background-image: 45deg is exact on a square element only/u);
  assert.match(result.warnings[1] ?? "", /warning: background-color ignored \(a WinUI Background is one brush/u);
  assert.deepEqual(result.setters.map(([property]) => property), ["Background"]);
});

test("a transition WinUI cannot animate warns and is dropped", () => {
  const result = lower({
    elementType: null,
    declarations: "transition: color 1s, opacity 1s ease-out"
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 2);
  assert.deepEqual(result.setters.map(([property]) => property), ["OpacityTransition"]);
});

test("a box-shadow transition animates the Z of Translation, a shadow's depth", () => {
  const result = lower({
    elementType: null,
    declarations: "transition: box-shadow 150ms"
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.setters, [["TranslationTransition", "<Vector3Transition Duration=\"0:0:0.150\"/>"]]);
});

test("a border-color transition is a write the runtime animates, with the colors written out", () => {
  const result = lower({
    elementType: null,
    declarations: "border-color: #ff0000; transition: border-color 1s ease-out 50ms"
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  const [[target, value] = ["", ""]] = result.writes;
  assert.equal(target, "border-color-transition");
  assert.deepEqual(JSON.parse(value), {
    color: "#FF0000",
    durationMs: 1000,
    delayMs: 50,
    easing: "ease-out"
  });
});

test("a border-color transition without a color written out warns and is dropped", () => {
  const result = lower({
    elementType: null,
    declarations: "border-color: var(--edge); transition: border-color 1s"
  });
  assert.deepEqual(result.writes, []);
  assert.match(result.warnings.join(), /border-color is animated between colors written out/u);
});

test("text-transform writes the transform the runtime shows the text with", () => {
  for (const word of ["uppercase", "lowercase", "capitalize"]) {
    const result = lower({
      elementType: "text-block",
      declarations: `text-transform: ${word}`
    });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.writes, [["text-transform", word]]);
  }

  const none = lower({
    elementType: "text-block",
    declarations: "text-transform: none"
  });
  assert.deepEqual(none.writes, []);
  assert.deepEqual(none.errors, []);
});

test("a text-transform WinUI cannot show is a build error", () => {
  const result = lower({
    elementType: "text-block",
    declarations: "text-transform: full-width"
  });
  assert.match(result.errors.join(), /text-transform: expected none, uppercase, lowercase or capitalize/u);
});

const failures: Array<[string, string | null, string, RegExp]> = [
  ["a property WinUI has no counterpart for", null, "float: left", /^t\.svelte:1:6: float has no WinUI meaning \(WinUI has no float/u],
  ["an inset shadow", null, "box-shadow: inset 0 0 4px red", /box-shadow: inset has no WinUI meaning/u],
  ["a box-shadow without an offset", null, "box-shadow: red", /box-shadow: expected offset-x offset-y/u],
  ["an unknown property", null, "frobnicate: 1", /frobnicate has no WinUI meaning \(WinUI has no property that corresponds to it\)/u],
  ["flex sizing of a child", null, "flex: 1", /flex has no WinUI meaning \(is lowered by the component build into the children of a <stack-panel> or <grid>/u],
  ["align-items on a container", null, "align-items: center", /align-items has no WinUI meaning \(is lowered by the component build into the children of a <stack-panel> or <grid>/u],
  ["a length without a unit", null, "width: 12", /width: expected a length in px/u],
  ["a percentage length", null, "width: 50%", /width: expected a length in px/u],
  ["a bad color", null, "color: sparkly", /color: expected a color/u],
  ["an image background", null, "background: url(a.png)", /^t\.svelte:1:6: background-image: expected linear-gradient\(\) or radial-gradient\(\), found "url\(a\.png\)" \(an image cannot be a Background in a Style; use an Image element\)/u],
  ["a gradient with one stop", null, "background-image: linear-gradient(red)", /^t\.svelte:1:6: background-image: a gradient needs at least two color stops/u],
  ["a gradient stop in px", null, "background: linear-gradient(red 10px, blue)", /background-image: "10px" is not a stop position/u],
  ["a gradient stop from var()", null, "background-image: linear-gradient(var(--a), blue)", /background-image: var\(--a\) cannot be a gradient stop/u],
  ["a conic gradient", null, "background: conic-gradient(red, blue)", /background-image: conic-gradient has no WinUI meaning/u],
  ["a repeating gradient", null, "background-image: repeating-linear-gradient(red, blue 10%)", /background-image: repeating-linear-gradient has no WinUI meaning/u],
  ["layered images", null, "background-image: linear-gradient(red, blue), linear-gradient(blue, red)", /background-image: several images have no WinUI meaning/u],
  ["a unitless line height", null, "line-height: 1.5", /a multiple of the font size has no WinUI meaning/u],
  ["opacity out of range", null, "opacity: 2", /opacity: expected a number or percentage from 0 to 1/u],
  ["a dashed border", null, "border: 1px dashed red", /border: dashed has no WinUI meaning \(WinUI draws solid lines only/u],
  ["border without a style", null, "border: 1px red", /border: expected a style/u],
  ["elliptical corners", null, "border-radius: 10px / 20px", /elliptical corners/u],
  ["gap on a border", "border", "gap: 4px", /gap has no WinUI meaning on <border>/u],
  ["display flex on a grid", "grid", "display: flex", /display: flex has no WinUI meaning on <grid>/u],
  ["display grid on a stack", "stack-panel", "display: grid", /display: grid has no WinUI meaning on <stack-panel>/u],
  ["auto-fill in a template", "grid", "grid-template-columns: repeat(auto-fill, 100px)", /repeat\(auto-fill, \.\.\.\) has no WinUI equivalent: write explicit tracks/u],
  ["minmax with a percentage", "grid", "grid-template-columns: minmax(10%, 1fr)", /found "10%"/u],
  ["overflow on a border", "border", "overflow: hidden", /overflow-x: hidden has no WinUI meaning on <border>/u],
  ["letter spacing in px", null, "letter-spacing: 2px", /expected normal or a unitless number/u],
  ["a backdrop filter other than blur", null, "backdrop-filter: saturate(2)", /backdrop-filter: saturate\(2\) has no WinUI meaning \(only blur\(\) has/u],
  ["a blur radius that is not a length", null, "backdrop-filter: blur(big)", /backdrop-filter: expected a blur radius in px, found "big"/u],
  ["an elevation that is not a length", null, "-winui-elevation: high", /-winui-elevation: expected a length in px/u],
  ["a 3D transform", null, "transform: rotateX(45deg)", /transform: rotateX\(45deg\) has no WinUI meaning \(a RenderTransform is two-dimensional/u],
  ["an unknown transform function", null, "transform: wobble(3)", /transform: wobble\(3\) has no WinUI meaning \(WinUI has no such transform/u],
  ["a transform length in a percentage", null, "transform: translate(50%)", /transform: translate\(\) expected a length in px, found "50%"/u],
  ["a transform with too many arguments", null, "transform: scale(1, 2, 3)", /transform: scale\(\) takes 1 or 2 argument/u],
  ["a matrix with five numbers", null, "transform: matrix(1, 0, 0, 1, 5)", /transform: matrix\(\) takes 6 argument/u],
  ["a dashed outline", null, "outline: 2px dashed red", /outline: dashed has no WinUI meaning \(WinUI draws solid lines only/u],
  ["an outline without a style", null, "outline: 2px red", /outline: expected a style \(none, solid, auto\)/u],
  ["an unknown base style", null, "-winui-based-on: NopeStyle", /NopeStyle is not a style WinUI defines/u]
];

for (const [name, elementType, declarations, pattern] of failures) {
  test(`fails the build: ${name}`, () => {
    const result = lower({
      elementType,
      declarations
    });
    assert.ok(result.errors.length > 0, `no error for ${declarations}`);
    assert.match(result.errors.join("\n"), pattern);
  });
}

test("clip-path inset becomes a write of the four insets", () => {
  const result = lower({
    elementType: null,
    declarations: "clip-path: inset(4px 10%)"
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.writes, [["clip", "4px,10%,4px,10%"]]);
});

test("a clip-path other than inset fails the build and says why", () => {
  const circle = lower({
    elementType: null,
    declarations: "clip-path: circle(50%)"
  });
  assert.match(circle.errors.join(), /UIElement\.Clip is a RectangleGeometry: only inset\(\) has a WinUI meaning/u);
  const rounded = lower({
    elementType: null,
    declarations: "clip-path: inset(0 round 8px)"
  });
  assert.match(rounded.errors.join(), /no round/u);
});

test("aspect-ratio becomes a write of the ratio", () => {
  assert.deepEqual(
    lower({
      elementType: null,
      declarations: "aspect-ratio: 16 / 9"
    }).writes, [["aspect", String(16 / 9)]]
  );
  assert.deepEqual(
    lower({
      elementType: null,
      declarations: "aspect-ratio: auto"
    }).writes, []
  );
  assert.match(
    lower({
      elementType: null,
      declarations: "aspect-ratio: wide"
    }).errors.join(), /aspect-ratio: expected auto/u
  );
});

test("filter and mix-blend-mode fail the build with their reason", () => {
  assert.match(
    lower({
      elementType: null,
      declarations: "filter: blur(4px)"
    }).errors.join(), /filter has no WinUI meaning \(WinUI has no filter/u
  );
  assert.match(
    lower({
      elementType: null,
      declarations: "mix-blend-mode: multiply"
    }).errors.join(), /no blend modes/u
  );
});

test("a calc of px reaches the sheet as the px it comes to", () => {
  const translation = translateStyleSheet({
    file: "t.svelte",
    css: ".t { width: calc(160px + 80px); height: 12px }",
    resources
  });
  const declarations = translation.sheet.rules[0]?.declarations.map(declaration => [declaration.property, declaration.value]);
  assert.deepEqual(declarations, [["width", "240px"], ["height", "12px"]]);
});
