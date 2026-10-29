import { computeDeclarations, matchingRules, resolveBuiltVariable, styleXaml } from "./cascade.ts";
import { loadWinuiCatalogue } from "./catalogue.ts";
import { lowerDeclarations } from "./properties.ts";
import { errorsOf, formatDiagnostic, translateStyleSheet } from "./translate.ts";
import { parseSelectorList } from "#src/css/parse/selectors.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const resources = loadWinuiCatalogue();

function translate({ css, map }: {
  css: string;
  map?: { mappings: string };
}) {
  return translateStyleSheet({
    file: "card.svelte",
    css,
    map,
    resources
  });
}

function errors(css: string) {
  return errorsOf(translate({ css })).map(formatDiagnostic);
}

test("selectors: classes, a type, a state and Svelte's scope", () => {
  const [result] = parseSelectorList("text-block.title.svelte-abc:hover");
  assert.deepEqual(result, {
    isValid: true,
    selector: {
      elementType: "text-block",
      classes: ["title", "svelte-abc"],
      notClasses: [],
      state: "hover",
      specificity: 4,
      isRoot: false
    }
  });
});

test("selectors: :where() adds its classes at no specificity", () => {
  const [result] = parseSelectorList(".card:where(.svelte-abc)");
  assert.equal(result?.isValid && result.selector.specificity, 1);
  assert.deepEqual(result?.isValid && result.selector.classes, ["card", "svelte-abc"]);
});

test("selectors: a list is several selectors", () => {
  assert.equal(parseSelectorList(".a, .b").length, 2);
});

test("selectors: every state WinUI reports", () => {
  for (const state of ["hover", "active", "focus", "focus-visible", "disabled", "checked"]) {
    const [result] = parseSelectorList(`.a:${state}`);
    assert.equal(result?.isValid && result.selector.state, state);
  }
});

test("selectors: a combinator says why it is not supported", () => {
  for (const selector of [".a .b", ".a > .b", ".a + .b", ".a ~ .b"]) {
    const [result] = parseSelectorList(selector);
    assert.equal(result?.isValid, false);
    assert.match(result?.isValid === false ? result.reason : "", /descendant, child and sibling selectors have no WinUI meaning/u);
  }
});

test("selectors: attributes, ids, other pseudo-classes and two states are rejected", () => {
  assert.equal(parseSelectorList("[a]")[0]?.isValid, false);
  assert.equal(parseSelectorList("#a")[0]?.isValid, false);
  assert.equal(parseSelectorList(".a:first-child")[0]?.isValid, false);
  assert.equal(parseSelectorList(".a::before")[0]?.isValid, false);
  assert.equal(parseSelectorList(".a:hover:focus")[0]?.isValid, false);
});

test("a sheet becomes rules in source order, one per selector", () => {
  const { sheet, diagnostics } = translate({ css: ".card.svelte-x { padding: 12px 16px }\n.a, text-block.b { opacity: .5 }" });
  assert.deepEqual(diagnostics, []);
  assert.equal(sheet.id, "card.svelte");
  assert.deepEqual(sheet.rules.map(rule => [rule.elementType, rule.classes, rule.order]), [
    [null, ["card", "svelte-x"], 0],
    [null, ["a"], 1],
    ["text-block", ["b"], 2]
  ]);
});

test("a rule's shorthands are stored as longhands", () => {
  const { sheet } = translate({ css: ".a { padding: 1px 2px; border: 1px solid red }" });
  assert.deepEqual(sheet.rules[0]?.declarations.map(declaration => declaration.property), [
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-style",
    "border-color"
  ]);
});

test("custom properties on :root become explicit light, dark and high contrast dictionaries", () => {
  const { sheet, diagnostics } = translate(
    {
      css: `
:root { --accent: #0af; --gap: 8px }
@media (prefers-color-scheme: dark) { :root { --accent: #fa0 } }
.a { color: var(--accent) }`
    }
  );
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(sheet.rules.length, 1);
  const xaml = sheet.resourcesXaml ?? "";
  assert.doesNotMatch(xaml, /x:Key="Default"/u);
  assert.match(xaml, /<ResourceDictionary x:Key="Light">/u);
  assert.match(xaml, /<ResourceDictionary x:Key="Dark">/u);
  assert.match(xaml, /<ResourceDictionary x:Key="HighContrast">/u);
  assert.match(xaml, /<Color x:Key="Accent">#00AAFF<\/Color>/u);
  assert.match(xaml, /<SolidColorBrush x:Key="AccentBrush" Color="\{StaticResource Accent\}"\/>/u);
  assert.match(xaml, /<Color x:Key="Accent">#FFAA00<\/Color>/u);
  assert.match(xaml, /<x:Double x:Key="Gap">8<\/x:Double>/u);
});

test("a sheet with one value per custom property keeps a single Default dictionary", () => {
  const { sheet } = translate({ css: ":root { --accent: #0af }" });
  assert.match(sheet.resourcesXaml ?? "", /<ResourceDictionary x:Key="Default">/u);
  assert.doesNotMatch(sheet.resourcesXaml ?? "", /x:Key="(Light|Dark|HighContrast)"/u);
});

test("@media (forced-colors: active) declares the high contrast values, over the defaults", () => {
  const { sheet, diagnostics } = translate({
    css: ":root { --accent: #0af; --card-border: red; --button-background: #123 }\n@media (forced-colors: active) { :root { --accent: var(--system-color-highlight-color); --button-background: CanvasText } }"
  });
  assert.deepEqual(diagnostics, []);
  const xaml = sheet.resourcesXaml ?? "";
  const highContrast = /<ResourceDictionary x:Key="HighContrast">([\s\S]*?)<\/ResourceDictionary>/u.exec(xaml)?.[1] ?? "";
  assert.match(highContrast, /<StaticResource x:Key="Accent" ResourceKey="SystemColorHighlightColor"\/>/u);
  assert.match(highContrast, /<SolidColorBrush x:Key="AccentBrush" Color="\{ThemeResource SystemColorHighlightColor\}"\/>/u);
  assert.match(highContrast, /<SolidColorBrush x:Key="ButtonBackground" Color="\{ThemeResource SystemColorWindowTextColor\}"\/>/u);
  assert.match(highContrast, /<Color x:Key="CardBorder">#FF0000<\/Color>/u);
  const light = /<ResourceDictionary x:Key="Light">([\s\S]*?)<\/ResourceDictionary>/u.exec(xaml)?.[1] ?? "";
  assert.match(light, /<Color x:Key="Accent">#00AAFF<\/Color>/u);
  assert.match(light, /<SolidColorBrush x:Key="ButtonBackground" Color="#112233"\/>/u);
});

test("a custom property only forced colors declare is an error, and so is a style rule there", () => {
  assert.match(errors("@media (forced-colors: active) { :root { --x: red } }").join(), /--x is declared for forced-colors only/u);
  assert.match(errors("@media (forced-colors: active) { .a { color: red } }").join(), /color has no WinUI meaning here/u);
});

test("a custom property declared for light and dark both needs no default", () => {
  const { diagnostics } = translate({
    css: "@media (prefers-color-scheme: light) { :root { --x: red } }\n@media (prefers-color-scheme: dark) { :root { --x: blue } }"
  });
  assert.deepEqual(diagnostics, []);
});

test("a custom property of a class is a resource of that rule, not of the app", () => {
  const { sheet, diagnostics } = translate({ css: ".a { --tone: red; color: var(--tone) }" });
  assert.deepEqual(diagnostics, []);
  assert.equal(sheet.resourcesXaml, null);
  assert.deepEqual(sheet.rules[0]?.declarations.map(declaration => declaration.property), ["color"]);
  const xaml = sheet.rules[0]?.resourcesXaml ?? "";
  assert.match(xaml, /<ResourceDictionary x:Key="Default">/u);
  assert.match(xaml, /<Color x:Key="Tone">#FF0000<\/Color>/u);
  assert.match(xaml, /<SolidColorBrush x:Key="ToneBrush"/u);
});

test("a custom property of a class can differ by color scheme, and :root stays the app's", () => {
  const { sheet, diagnostics } = translate({
    css: ":root { --accent: #0af }\n.a { --button-background: #111 }\n@media (prefers-color-scheme: dark) { .a { --button-background: #eee } }"
  });
  assert.deepEqual(diagnostics, []);
  assert.match(sheet.resourcesXaml ?? "", /Accent/u);
  assert.doesNotMatch(sheet.resourcesXaml ?? "", /ButtonBackground/u);
  const [light, dark] = sheet.rules.map(rule => rule.resourcesXaml ?? "");
  assert.match(light ?? "", /x:Key="Default"/u);
  assert.match(dark ?? "", /x:Key="Dark"/u);
  assert.doesNotMatch(dark ?? "", /x:Key="Default"/u);
  assert.match(dark ?? "", /Color="#EEEEEE"/u);
});

test("a custom property on a state rule is an error that names the resource to override", () => {
  assert.match(errors(".a:hover { --x: red }").join(), /--x has no WinUI meaning in a :hover rule/u);
});

test("a custom property of a key WinUI defines keeps WinUI's kind", () => {
  const { sheet, diagnostics } = translate({
    css: ".a { --button-background-pointer-over: red; --control-corner-radius: 6px; --button-padding: 4px; --system-accent-color: #0af }"
  });
  assert.deepEqual(diagnostics, []);
  const xaml = sheet.rules[0]?.resourcesXaml ?? "";
  assert.match(xaml, /<SolidColorBrush x:Key="ButtonBackgroundPointerOver" Color="#FF0000"\/>/u);
  assert.doesNotMatch(xaml, /<Color x:Key="ButtonBackgroundPointerOver"/u);
  assert.match(xaml, /<CornerRadius x:Key="ControlCornerRadius">6<\/CornerRadius>/u);
  assert.match(xaml, /<Thickness x:Key="ButtonPadding">4,4,4,4<\/Thickness>/u);
  assert.match(xaml, /<Color x:Key="SystemAccentColor">#00AAFF<\/Color>/u);
});

test("a custom property whose value cannot be the kind WinUI gives the key is an error", () => {
  assert.match(errors(".a { --button-background-pointer-over: 4px }").join(), /--button-background-pointer-over: ButtonBackgroundPointerOver is a WinUI Brush resource, and "4px" cannot be one/u);
  assert.match(errors(".a { --control-corner-radius: red }").join(), /ControlCornerRadius is a WinUI CornerRadius resource/u);
});

test("a custom property declared for dark only is an error", () => {
  const result = errors("@media (prefers-color-scheme: dark) { :root { --x: red } }");
  assert.equal(result.length, 1);
  assert.match(result[0] ?? "", /--x is declared for dark only/u);
});

test("a custom property must be a color or a length", () => {
  assert.match(errors(":root { --x: bold }").join(), /--x: expected a color or a length in px, found "bold"/u);
});

test("var(): a WinUI name is checked, a typo gets a suggestion", () => {
  const result = errors(".a { background: var(--card-background-fill-colour-default) }");
  assert.equal(result.length, 1);
  assert.match(result[0] ?? "", /^card\.svelte:1:6: background-color: --card-background-fill-colour-default is not a WinUI resource/u);
  assert.match(result[0] ?? "", /did you mean --card-background-fill-color-default/u);
});

test("var(): a color used where a brush is needed is explained", () => {
  assert.match(errors(".a { padding: var(--control-corner-radius) }").join(), /--control-corner-radius is a WinUI CornerRadius resource \(ControlCornerRadius\), and a Thickness is needed here/u);
});

test("var(): brushes and thicknesses and radii resolve to ThemeResource", () => {
  const { sheet, diagnostics } = translate({ css: ".a { padding: var(--button-padding); border-radius: var(--control-corner-radius); color: var(--text-fill-color-primary) }" });
  assert.deepEqual(diagnostics, []);
  assert.equal(sheet.rules.length, 1);
});

test("var(): a custom property of another sheet is unknown here", () => {
  assert.match(errors(".a { color: var(--elsewhere) }").join(), /--elsewhere is not a WinUI resource, nor a custom property this stylesheet declares/u);
});

test("what a sheet cannot say is an error with its position", () => {
  const result = errors(".a { color: red }\n.b {\n  box-shadow: 0 0 2px red;\n}");
  assert.deepEqual(result, ["card.svelte:3:3: box-shadow has no WinUI meaning (a WinUI shadow is a ThemeShadow, which takes no blur, offset, spread or color: use -winui-elevation, its depth in px)"]);
});

test("positions are mapped back to the .svelte file", () => {
  // Generated line 1 maps to line 10, column 0 (AAUA: +0,+0,+10,+0 is "AAUA" with U=10).
  const result = translate({
    css: "box-shadow: x;\n.a { box-shadow: y }",
    map: {
      mappings: "AAUA;AAAA"
    }
  });
  const messages = result.diagnostics.map(formatDiagnostic);
  assert.match(messages.join("\n"), /card\.svelte:11:/u);
});

test("descendant selectors, nesting, @keyframes and other @media are errors", () => {
  assert.match(errors(".a .b { color: red }").join(), /descendant, child and sibling selectors have no WinUI meaning/u);
  assert.match(errors(".a { color: red; .b { color: blue } }").join(), /descendant, child and sibling selectors have no WinUI meaning/u);
  assert.match(errors(".a { @container (min-width: 1px) { color: blue } }").join(), /@container has no WinUI meaning/u);
  assert.match(errors("@keyframes spin { to { opacity: 0 } }").join(), /@keyframes has no WinUI meaning/u);
  assert.match(errors("@media (orientation: landscape) { .a { color: red } }").join(), /@media \(orientation: landscape\) has no WinUI meaning/u);
  assert.match(errors("@import 'a.css';").join(), /@import has no WinUI meaning/u);
});

test("a style rule cannot change with the color scheme", () => {
  assert.match(errors("@media (prefers-color-scheme: dark) { .a { color: red } }").join(), /color has no WinUI meaning here \(a Style cannot depend on the color scheme/u);
});

test(":root cannot style an element", () => {
  assert.match(errors(":root { color: red }").join(), /color has no WinUI meaning \(:root styles no element/u);
});

test("a syntax error is reported, not thrown", () => {
  assert.equal(errors(".a { color: red }\n}").length, 1);
});

// The cascade.

function stylesFor({ css, facts, inline = "" }: {
  css: string;
  facts: {
    elementType: string;
    classes: string[];
    states?: string[];
  };
  inline?: unknown;
}) {
  const { sheet } = translate({ css });
  const ranked = sheet.rules.map(rule => ({
    rule,
    id: String(rule.order),
    rank: rule.order
  }));
  const matched = matchingRules({
    rules: ranked,
    facts: {
      elementType: facts.elementType,
      classes: new Set(facts.classes),
      states: new Set(facts.states?.flatMap(state => (state === "hover" ? ["hover" as const] : [])) ?? [])
    }
  });
  const inlineRule = translate({ css: `.i { ${inline} }` }).sheet.rules[0]?.declarations ?? [];
  const lowered = lowerDeclarations({
    computed: computeDeclarations({
      matched,
      inline: inlineRule
    }),
    options: {
      elementType: facts.elementType,
      resolveVariable: resolveBuiltVariable,
      hasStyle: () => true,
      report() {}
    }
  });
  return lowered.setters.map(entry => [entry.property, entry.kind === "setter" ? entry.value : entry.xaml]);
}

test("cascade: every class must be on the element; a type-only rule matches the type", () => {
  const css = ".a.b { opacity: 0.1 }\ntext-block { opacity: 0.2 }";
  assert.deepEqual(
    stylesFor({
      css,
      facts: {
        elementType: "border",
        classes: ["a"]
      }
    }), []
  );
  assert.deepEqual(
    stylesFor({
      css,
      facts: {
        elementType: "border",
        classes: ["a", "b"]
      }
    }), [["Opacity", "0.1"]]
  );
  assert.deepEqual(
    stylesFor({
      css,
      facts: {
        elementType: "text-block",
        classes: []
      }
    }), [["Opacity", "0.2"]]
  );
});

test("cascade: higher specificity wins whatever the order, then the later rule", () => {
  const css = ".a.b { opacity: 0.1 }\n.a { opacity: 0.2 }\n.b { opacity: 0.3 }";
  assert.deepEqual(
    stylesFor({
      css,
      facts: {
        elementType: "border",
        classes: ["a", "b"]
      }
    }), [["Opacity", "0.1"]]
  );
  assert.deepEqual(
    stylesFor({
      css,
      facts: {
        elementType: "border",
        classes: ["a"]
      }
    }), [["Opacity", "0.2"]]
  );
});

test("cascade: a state rule applies only while its state is active", () => {
  const css = ".a { opacity: 1 }\n.a:hover { opacity: 0.5 }";
  assert.deepEqual(
    stylesFor({
      css,
      facts: {
        elementType: "border",
        classes: ["a"]
      }
    }), [["Opacity", "1"]]
  );
  assert.deepEqual(
    stylesFor({
      css,
      facts: {
        elementType: "border",
        classes: ["a"],
        states: ["hover"]
      }
    }), [["Opacity", "0.5"]]
  );
});

test("cascade: the element's own style beats every rule", () => {
  assert.deepEqual(
    stylesFor({
      css: ".a { opacity: 1 !important; width: 10px }",
      facts: {
        elementType: "border",
        classes: ["a"]
      },
      inline: "width: 20px; opacity: 0"
    }), [["Opacity", "1"], ["Width", "20"]]
  );
});

test("a Style as XAML: based on, setters, element-form setters", () => {
  const xaml = styleXaml({
    key: "K",
    elementType: "text-block",
    lowered: {
      basedOn: "CaptionTextBlockStyle",
      setters: [
        {
          kind: "setter",
          property: "Foreground",
          value: "{ThemeResource TextFillColorSecondaryBrush}"
        },
        {
          kind: "content",
          property: "OpacityTransition",
          xaml: "<ScalarTransition Duration=\"0:0:0.200\"/>"
        },
        {
          kind: "setter",
          property: "FontFamily",
          value: "A & \"B\""
        }
      ],
      writes: []
    }
  });
  assert.equal(
    xaml, [
      "<Style x:Key=\"K\" TargetType=\"TextBlock\" BasedOn=\"{StaticResource CaptionTextBlockStyle}\">",
      "  <Setter Property=\"Foreground\" Value=\"{ThemeResource TextFillColorSecondaryBrush}\"/>",
      "  <Setter Property=\"OpacityTransition\"><Setter.Value><ScalarTransition Duration=\"0:0:0.200\"/></Setter.Value></Setter>",
      "  <Setter Property=\"FontFamily\" Value=\"A &amp; &quot;B&quot;\"/>",
      "</Style>"
    ].join("\n")
  );
});

test("nested rules flatten with & into top-level rules", () => {
  const { sheet, diagnostics } = translateStyleSheet({
    file: "t.svelte",
    css: ".a, .b { color: red; &:hover { color: blue } &.c { margin: 0 } }",
    resources
  });
  assert.deepEqual(diagnostics.map(formatDiagnostic), []);
  const shapes = sheet.rules.map(rule => [rule.classes.join("."), rule.state, rule.declarations[0]?.property]);
  assert.deepEqual(shapes, [
    ["a", null, "color"],
    ["b", null, "color"],
    ["a", "hover", "color"],
    ["b", "hover", "color"],
    ["a.c", null, "margin-top"],
    ["b.c", null, "margin-top"]
  ]);
});

test("rules under a width @media keep the bounds, and a custom property under one is refused", () => {
  const { sheet, diagnostics } = translateStyleSheet({
    file: "t.svelte",
    css: ".a { opacity: 1 }\n@media (min-width: 600px) and (max-width: 900px) { .a { opacity: 0.5 } }\n@media (min-width: 1px) { :root { --x: red } }",
    resources
  });
  assert.deepEqual(sheet.rules.map(rule => rule.media ?? null), [
    null,
    {
      minWidth: 600,
      maxWidth: 900,
      minHeight: null,
      maxHeight: null
    }
  ]);
  assert.match(diagnostics.map(formatDiagnostic).join(), /custom property of :root cannot depend on the window's size/u);
});

test(":not(.class) excludes elements that have the class", () => {
  const { sheet, diagnostics } = translateStyleSheet({
    file: "t.svelte",
    css: ".a:not(.busy, .off) { opacity: 1 }",
    resources
  });
  assert.deepEqual(diagnostics, []);
  const [rule] = sheet.rules;
  assert.deepEqual(rule?.notClasses, ["busy", "off"]);
  function facts(classes: string[]) {
    return {
      elementType: "border",
      classes: new Set(classes),
      states: new Set<never>()
    };
  }
  assert.ok(rule);
  const ranked = [{
    rule,
    id: "t#0",
    rank: 0
  }];
  assert.equal(
    matchingRules({
      rules: ranked,
      facts: facts(["a"])
    }).length, 1
  );
  assert.equal(
    matchingRules({
      rules: ranked,
      facts: facts(["a", "off"])
    }).length, 0
  );
});

test("structural pseudo-classes say a Style cannot see the siblings", () => {
  assert.match(errors(".a:first-child { opacity: 1 }").join(), /:first-child has no WinUI meaning \(a Style cannot see/u);
});

test(":not() takes classes only", () => {
  assert.match(errors(".a:not(border) { opacity: 1 }").join(), /:not\(\) takes classes/u);
  assert.match(errors(".a:not(:hover) { opacity: 1 }").join(), /:not\(\) takes classes/u);
});

test("an at-rule inside a rule styles that rule's selector", () => {
  const { sheet, diagnostics } = translateStyleSheet({
    file: "t.svelte",
    css: ".a { opacity: 1; @media (min-width: 600px) { opacity: 0.5; &:hover { opacity: 0.2 } } }",
    resources
  });
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(sheet.rules.map(rule => [rule.classes.join(), rule.state, rule.media?.minWidth ?? null]), [
    ["a", null, null],
    ["a", null, 600],
    ["a", "hover", 600]
  ]);
});

test("modern colors are resolved to sRGB at build time, in rules and custom properties", () => {
  const { sheet, diagnostics } = translateStyleSheet({
    file: "t.svelte",
    css: ".a { background-color: hwb(0 0% 0%); color: color-mix(in srgb, #ff0000, #0000ff) }",
    resources
  });
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(sheet.rules[0]?.declarations.map(declaration => declaration.value), ["#FF0000", "#800080"]);
});
