import { Destination } from "./attribute-rewriter.ts";
import { PreviewFeature } from "./css-previews.ts";
import { Command, Setting } from "./ids.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// What package.json contributes must name what the code registers and reads

const manifest = z.object({
  contributes: z.object({
    commands: z.array(z.object({ command: z.string() })),
    configuration: z.object({
      properties: z.record(
        z.string(), z.object({
          enum: z.array(z.string()).optional(),
          default: z.unknown().optional()
        })
      )
    })
  })
}).parse(JSON.parse(readFileSync(path.join(import.meta.dirname, "../package.json"), "utf8")));

test("the commands the manifest contributes are the ones the code registers", () => {
  assert.deepEqual(
    manifest.contributes.commands.map(entry => entry.command).toSorted(),
    Object.values(Command).toSorted()
  );
});

test("the destination setting offers the destinations the code understands", () => {
  const setting = manifest.contributes.configuration.properties[`${Setting.SECTION}.${Setting.DESTINATION}`];
  assert.deepEqual(setting?.enum, Object.values(Destination));
});

test("every setting the code reads is contributed, and the resource hints are on by default", () => {
  for (const setting of [Setting.DESTINATION, Setting.RESOURCE_HINTS]) {
    const key = `${Setting.SECTION}.${setting}`;
    assert.equal(key in manifest.contributes.configuration.properties, true, key);
  }

  const hints = manifest.contributes.configuration.properties[`${Setting.SECTION}.${Setting.RESOURCE_HINTS}`];
  assert.equal(hints?.default, true);
});

test("every preview has a setting that is on by default, and the media environment has its own", () => {
  const { properties } = manifest.contributes.configuration;
  for (const feature of Object.values(PreviewFeature)) {
    assert.equal(properties[`${Setting.SECTION}.${Setting.PREVIEWS}.${feature}`]?.default, true, feature);
  }

  for (const setting of ["theme", "reducedMotion", "width", "height"]) {
    assert.equal(`${Setting.SECTION}.${Setting.MEDIA}.${setting}` in properties, true, setting);
  }
});
