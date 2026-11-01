import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// The web-types file WebStorm reads for the attributes of a component written
// as markup (`glyph=""`): the generated file holds WinUI's documentation of
// each class and of its own props, and each class names its parent.

const PACKAGE_FOLDER = path.resolve(import.meta.dirname, "../..");
const typeReferenceSchema = z.union([z.string(), z.object({
  module: z.string(),
  name: z.string()
})]);
const webTypesSchema = z.object({
  contributions: z.object({
    html: z.object({
      elements: z.array(
        z.object({
          name: z.string(),
          extends: z.string().optional(),
          attributes: z.array(
            z.object({
              name: z.string(),
              description: z.string().optional(),
              value: z.object({
                type: z.union([z.string(), z.array(typeReferenceSchema)])
              }).optional()
            })
          )
        })
      )
    })
  })
});

const { elements } = webTypesSchema.parse(JSON.parse(readFileSync(path.join(PACKAGE_FOLDER, "web-types.json"), "utf8"))).contributions.html;

test("a component's element carries its own props' documentation and extends its parent", () => {
  const fontIcon = elements.find(element => element.name === "FontIcon");
  assert.equal(fontIcon?.extends, "/html/elements/IconElement");
  const glyph = fontIcon?.attributes.find(attribute => attribute.name === "glyph");
  assert.match(glyph?.description ?? "", /character code that identifies the icon glyph/u);
  assert.match(glyph?.description ?? "", /Accepts an icon glyph: a name of Segoe Fluent Icons/u);
});

test("glyph names the exported GlyphInput type, so the editor can show it and offer the icon names", () => {
  const fontIcon = elements.find(element => element.name === "FontIcon");
  const glyph = fontIcon?.attributes.find(attribute => attribute.name === "glyph");
  assert.deepEqual(glyph?.value?.type, [{
    module: "winui-svelte/components",
    name: "FluentGlyphName"
  }, "string", "number", "number[]"]);
});

test("a prop names its type beside its name", () => {
  const visibility = elements.find(element => element.name === "UIElement")?.attributes.find(attribute => attribute.name === "visibility");
  assert.equal(visibility?.value?.type, "Visibility");
  assert.match(visibility?.description ?? "", /Type: `Visibility`/u);
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
