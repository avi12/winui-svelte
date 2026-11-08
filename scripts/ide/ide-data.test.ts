import { readIdeData } from "./ide-data.ts";
import { handledMembers } from "#src/css/translate/handled-members.js";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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

// The picture previews read only `pictureProps`, so a member typed with the alias
// must be in it, and nothing in it may name a member that is gone.

const SOURCE_FOLDER = path.join(PACKAGE_FOLDER, "src");
const PICTURE_ALIAS = "PictureSource";
const sources = readdirSync(SOURCE_FOLDER, {
  recursive: true,
  encoding: "utf8"
})
  .filter(file => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.endsWith(".d.svelte.ts"))
  .map(file => ({
    file,
    text: readFileSync(path.join(SOURCE_FOLDER, file), "utf8")
  }));

function aliasesOfPicture() {
  const aliases = new Set([PICTURE_ALIAS]);
  const declaration = /export type (\w+)\s*=\s*([^;]*);/gu;
  for (const { text } of sources) {
    for (const [, name, body] of text.matchAll(declaration)) {
      const isPicture = name !== undefined && body !== undefined && [...aliases].some(alias => new RegExp(String.raw`\b${alias}\b`, "u").test(body));
      if (isPicture) {
        aliases.add(name);
      }
    }
  }

  return aliases;
}

test("every member typed with PictureSource, directly or through an alias of it, is in the picture data", () => {
  const aliases = [...aliasesOfPicture()].join("|");
  const member = new RegExp(String.raw`^\s*(?:readonly\s+)?(\w+)\??:\s*[^;{]*\b(?:${aliases})\b`, "gmu");
  const listed = new Set(data.pictureProps.map(prop => prop.name));
  const written = sources.flatMap(({ text }) => [...text.matchAll(member)].map(match => match[1] ?? ""));
  assert.equal(written.length > 0, true);
  for (const name of written) {
    assert.equal(listed.has(name), true, `${name} is typed with PictureSource but not in pictureProps`);
  }
});

test("every picture prop in the data still names its owner and a member of it", () => {
  for (const { owner, name } of data.pictureProps) {
    const ownerSource = sources.find(({ text }) => new RegExp(String.raw`(?:interface|type)\s+${owner}\b`, "u").test(text));
    assert.notEqual(ownerSource, undefined, `${owner} is gone`);
    assert.match(ownerSource?.text ?? "", new RegExp(String.raw`\b${name}\??:`, "u"), `${owner}.${name} is gone`);
  }
});

test("picture data lists the components that take the tray and window pictures, and the taskbar variants", () => {
  const icon = data.pictureProps.find(prop => prop.owner === "MenuLabelledItem" && prop.name === "icon");
  assert.deepEqual(icon?.components, ["TrayMenuItem", "TrayMenuOperations", "TrayMenuProgress", "TrayMenuSubmenu"]);
  assert.deepEqual(icon?.forms, ["string", "pixels"]);
  assert.deepEqual(data.pictureProps.find(prop => prop.owner === "TrayIconOptions")?.forms, ["string", "pair"]);
  assert.equal(data.pictureProps.find(prop => prop.owner === "ImageProps")?.components[0], "Image");
  assert.deepEqual(data.pictureVariants, [
    {
      name: "forDarkTaskbar",
      theme: "dark"
    },
    {
      name: "forLightTaskbar",
      theme: "light"
    }
  ]);
});
