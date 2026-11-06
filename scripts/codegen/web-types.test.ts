import { webTypesSchema } from "./web-types-schema.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// The web-types file WebStorm reads for the attributes of a component written
// as markup (`glyph=""`): the generated file holds WinUI's documentation of
// each class and of its own props, and each class names its parent.

const PACKAGE_FOLDER = path.resolve(import.meta.dirname, "../..");
const { html: { elements }, css, js } = webTypesSchema.parse(
  JSON.parse(readFileSync(path.join(PACKAGE_FOLDER, "web-types.json"), "utf8"))
).contributions;

test("a component's element carries its own props' documentation and extends its parent", () => {
  const fontIcon = elements.find(element => element.name === "FontIcon");
  assert.equal(fontIcon?.extends, "/html/elements/IconElement");
  const glyph = fontIcon?.attributes.find(attribute => attribute.name === "glyph");
  assert.match(glyph?.description ?? "", /character code that identifies the icon glyph/u);
  assert.match(glyph?.description ?? "", /Accepts an icon glyph: a Fluent name/u);
});

test("glyph names the exported GlyphInput type, so the editor can show it and offer the icon names", () => {
  const fontIcon = elements.find(element => element.name === "FontIcon");
  const glyph = fontIcon?.attributes.find(attribute => attribute.name === "glyph");
  assert.deepEqual(glyph?.value?.type, [{
    module: "winui-svelte/components",
    name: "FluentGlyphName"
  }, "string", "number", "number[]"]);
});

test("the hand-written Window has an element whose backdrop names the closed set the editor offers", () => {
  const window = elements.find(element => element.name === "Window");
  const backdrop = window?.attributes.find(attribute => attribute.name === "backdrop");
  assert.deepEqual(backdrop?.value?.type, ["enum", {
    module: "winui-svelte/enums",
    name: "Backdrop"
  }]);
  assert.match(backdrop?.description ?? "", /material behind the content/u);
  const isBorderless = window?.attributes.find(attribute => attribute.name === "isBorderless");
  assert.equal(isBorderless?.value?.kind, "expression");
  assert.equal(window?.attributes.some(attribute => attribute.name === "handle"), false);
});

test("a prop names its type beside its name", () => {
  const opacity = elements.find(element => element.name === "UIElement")?.attributes.find(attribute => attribute.name === "opacity");
  assert.equal(opacity?.value?.type, "number");
  assert.match(opacity?.description ?? "", /Type: `number`/u);
});

test("a prop is written once, on the class that declares it", () => {
  const holders = elements.filter(element => element.attributes.some(attribute => attribute.name === "visibility"));
  assert.deepEqual(holders.map(element => element.name), ["UIElement"]);
});

test("the package names the file, and ships it", () => {
  const manifest = z.object({
    "web-types": z.string(),
    files: z.array(z.string())
  }).parse(JSON.parse(readFileSync(path.join(PACKAGE_FOLDER, "package.json"), "utf8")));
  assert.equal(manifest["web-types"], "./web-types.json");
  assert.ok(manifest.files.includes("web-types.json"));
});

test("a property a shorthand sets names that shorthand", () => {
  const border = elements.find(element => element.name === "Border");
  function noteOf(name: string) {
    return border?.attributes.find(attribute => attribute.name === name)?.description ?? "";
  }

  assert.match(noteOf("padding"), /Also settable in CSS as `padding`/u);
  assert.match(noteOf("cornerRadius"), /Also settable in CSS as `border-radius`/u);
  assert.match(noteOf("borderThickness"), /Also settable in CSS as `border-width`/u);
});

test("an enum prop offers its member names and also takes the member's number", () => {
  const visibility = elements.find(element => element.name === "UIElement")?.attributes.find(attribute => attribute.name === "visibility");
  assert.deepEqual(visibility?.value?.type, ["enum", {
    module: "winui-svelte/enums",
    name: "VisibilityName"
  }, "number"]);
  assert.deepEqual(visibility?.values?.map(value => value.name), ["Visible", "Collapsed"]);
});

test("an enum prop completes the values the editors' data set lists, so that backdrop=\"mi\" offers mica", () => {
  const window = elements.find(element => element.name === "Window");
  const backdrop = window?.attributes.find(attribute => attribute.name === "backdrop");
  assert.deepEqual(backdrop?.values?.map(value => value.name), [
    "acrylic",
    "acrylicBase",
    "acrylicThin",
    "mica",
    "micaAlt",
    "none",
    "transparent"
  ]);
  const clickMode = elements.flatMap(element => element.attributes).find(attribute => attribute.name === "clickMode");
  assert.match(clickMode?.values?.[0]?.description ?? "", /^Specifies that the Click event/u);
});

test("the web events are contributions to the JavaScript namespace, the attachment helpers are not", () => {
  assert.equal(js?.events.some(event => event.name === "drop"), true);
  assert.equal(js !== undefined && "symbols" in js, false);
});

// WebStorm drops a web-types file that does not follow its schema, and every
// component hover with it: a css property's `values` are plain strings.
test("a css property lists its values as plain strings", () => {
  const fontFamily = css.properties.find(property => property.name === "font-family");
  assert.ok(fontFamily?.values?.includes("\"Segoe UI\""));
});

test("an attached property a class takes as a prop carries the owner's documentation", () => {
  const uiElement = elements.find(element => element.name === "UIElement");
  const automationId = uiElement?.attributes.find(attribute => attribute.name === "automationId");
  assert.match(automationId?.description ?? "", /AutomationProperties\.AutomationId/u);
});

test("a boolean prop is an expression, not an HTML boolean attribute that takes its own name", () => {
  const isEnabled = elements.find(element => element.name === "Control")?.attributes.find(attribute => attribute.name === "isEnabled");
  assert.equal(isEnabled?.value?.kind, "expression");
});
