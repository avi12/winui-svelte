import { readIdeData } from "./ide-data.ts";
import { handledMembers } from "#src/css/translate/handled-members.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// The data set both editors read: what it names has to be what the library
// really has, and the two CSS data files can name nothing the translation
// does not handle.

const PACKAGE_FOLDER = path.resolve(import.meta.dirname, "../..");
const data = readIdeData();

const vscodeCssDataSchema = z.object({ properties: z.array(z.object({ name: z.string() })) });
const mappingsSchema = z.object({ attributes: z.record(z.string(), z.object({ cssProperty: z.string() })) });

function jsonOf(...segments: string[]) {
  return JSON.parse(readFileSync(path.join(PACKAGE_FOLDER, ...segments), "utf8"));
}

test("a color resource has the custom property that names it and its light and dark swatch", () => {
  const card = data.resources.find(resource => resource.name === "CardBackgroundFillColorDefault");
  assert.equal(card?.property, "--card-background-fill-color-default");
  assert.equal(card?.kind, "Color");
  assert.equal(card?.light, "#ffffffb3");
  assert.equal(card?.dark, "#ffffff0d");
});

test("a resource that is no color has no swatch, and a style is not offered", () => {
  const radius = data.resources.find(resource => resource.name === "ControlCornerRadius");
  assert.equal(radius?.kind, "CornerRadius");
  assert.equal(radius?.light, undefined);
  assert.equal(data.resources.some(resource => resource.kind === "Style"), false);
});

test("a closed set lists its members, a WinUI enum by number", () => {
  const backdrop = data.enums.find(set => set.name === "Backdrop");
  assert.equal(backdrop?.isNumeric, false);
  assert.deepEqual(backdrop?.members.map(member => member.value), [
    "acrylic",
    "acrylicBase",
    "acrylicThin",
    "mica",
    "micaAlt",
    "none",
    "transparent"
  ]);
  const clickMode = data.enums.find(set => set.name === "ClickMode");
  assert.equal(clickMode?.isNumeric, true);
  assert.match(clickMode?.members[0]?.description ?? "", /^Specifies that the Click event/u);
});

test("every attachment helper and web event of an entry point is listed with the entry point to import it from", () => {
  const dropzone = data.attachments.find(attachment => attachment.name === "dropzone");
  assert.equal(dropzone?.module, "winui-svelte/data-transfer");
  assert.equal(data.attachments.find(attachment => attachment.name === "control")?.module, "winui-svelte");
  assert.deepEqual(data.webEvents.map(event => event.name).toSorted(), [
    "drag",
    "dragend",
    "dragenter",
    "dragleave",
    "dragover",
    "dragstart",
    "drop"
  ]);
  assert.equal(data.webEvents.every(event => event.enabledBy === "enableDragEvents"), true);
});

test("the translate keys are the properties the translation handles", () => {
  assert.deepEqual(data.translateKeys, [...handledMembers()].toSorted());
});

test("both CSS data files name only properties the translation handles", () => {
  const handled = new Set(data.translateKeys);
  const vscode = vscodeCssDataSchema.parse(jsonOf("src", "css", "validate", "vscode-css-data.json"));
  for (const { name } of vscode.properties) {
    assert.equal(handled.has(name), true, `vscode-css-data.json names ${name}`);
  }

  const mappings = mappingsSchema.parse(jsonOf("ide", "webstorm", "src", "main", "resources", "winui-css-mappings.json"));
  for (const [prop, { cssProperty }] of Object.entries(mappings.attributes)) {
    assert.equal(handled.has(cssProperty), true, `winui-css-mappings.json maps ${prop} to ${cssProperty}`);
  }
});

test("the CSS previews draw the library's own easings, shadow depths and unsupported properties", () => {
  const ease = data.easings.find(easing => easing.name === "ease");
  assert.deepEqual(ease?.points, [0.25, 0.1, 0.25, 1]);
  assert.equal(data.easings.find(easing => easing.name === "step-end")?.kind, "steps");
  assert.deepEqual(data.shadowDepths.map(shadow => shadow.depth), [4, 16, 32, 128]);
  assert.match(data.unsupportedProperties.find(property => property.name === "float")?.reason ?? "", /grid/u);
});

test("a window material has the light and dark color of its base", () => {
  const mica = data.materials.find(material => material.name === "mica");
  assert.equal(mica?.light, "#f3f3f3");
  assert.equal(mica?.dark, "#202020");
  assert.equal(data.materials.find(material => material.name === "acrylic")?.isTranslucent, true);
});
