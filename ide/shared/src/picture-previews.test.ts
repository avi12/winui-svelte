import raw from "../../picture-previews.spec.json" with { type: "json" };
import { pictureBindings } from "./picture-bindings.ts";
import {
  bestFrameIndex,
  iconFrames,
  imageSizeOf,
  pictureCaption,
  singleFrameIcon
} from "./picture-image.ts";
import { pictureTargetOf } from "./picture-paths.ts";
import { isFetchableUrl, redirectTarget, sniffExtension } from "./picture-remote-policy.ts";
import { expressionSpots, keySpots, plainSpots } from "./picture-spots.ts";
import type { PictureNames } from "./picture-spots.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

// The logic spec both editors implement: ide/picture-previews.spec.json holds the inputs and the answers, and the
// WebStorm plugin's PicturePreviewSpecTest runs the same cases.

const spec = z.object({
  resolutions: z.array(
    z.object({
      value: z.string(),
      file: z.string(),
      root: z.string(),
      expected: z.object({
        kind: z.string(),
        extension: z.string(),
        candidates: z.array(z.string())
      })
    })
  ),
  headers: z.array(
    z.object({
      name: z.string(),
      extension: z.string(),
      hex: z.string().optional(),
      text: z.string().optional(),
      expected: z.object({
        width: z.number(),
        height: z.number(),
        frames: z.array(z.tuple([z.number(), z.number()])),
        best: z.number().optional()
      })
    })
  ),
  spots: z.array(
    z.object({
      kind: z.enum(["plain", "expression", "keys"]),
      attribute: z.string(),
      text: z.string(),
      bindings: z.record(z.string(), z.string()).optional(),
      expected: z.array(
        z.object({
          value: z.string(),
          variant: z.string(),
          text: z.string().optional()
        })
      )
    })
  ),
  bindings: z.array(
    z.object({
      name: z.string(),
      text: z.string(),
      expected: z.record(z.string(), z.string())
    })
  ),
  remoteUrls: z.array(
    z.object({
      url: z.string(),
      expected: z.boolean()
    })
  ),
  redirects: z.array(
    z.object({
      from: z.string(),
      location: z.string(),
      expected: z.string().nullable()
    })
  ),
  sniffs: z.array(
    z.object({
      name: z.string(),
      contentType: z.string(),
      urlExtension: z.string(),
      hex: z.string().optional(),
      text: z.string().optional(),
      expected: z.string()
    })
  )
}).parse(raw.cases);
const names = {
  names: new Set(["icon", "image", "forLightTaskbar", "forDarkTaskbar"]),
  variants: new Map<string, "light" | "dark">([["forLightTaskbar", "light"], ["forDarkTaskbar", "dark"]])
} satisfies PictureNames;
const START = 7;

function bytesOf(header: (typeof spec.headers)[number]) {
  return header.text === undefined ? Uint8Array.from(Buffer.from(header.hex ?? "", "hex")) : new TextEncoder().encode(header.text);
}

test("a picture value resolves to the places to look, a data URI, a remote URL or nothing", () => {
  for (const { value, file, root, expected } of spec.resolutions) {
    assert.deepEqual(
      pictureTargetOf({
        value,
        file,
        root
      }), expected, value
    );
  }
});

test("the size of a picture is read from its first bytes, and an .ico lists its frames", () => {
  for (const header of spec.headers) {
    const size = imageSizeOf({
      extension: header.extension,
      bytes: bytesOf(header)
    });
    assert.equal(size.width, header.expected.width, header.name);
    assert.equal(size.height, header.expected.height, header.name);
    assert.deepEqual(size.frames.map(frame => [frame.width, frame.height]), header.expected.frames, header.name);
  }
});

test("the best frame of an .ico is the largest and a single-frame file holds only it", () => {
  const header = spec.headers.find(candidate => candidate.name === "ico");
  const bytes = bytesOf(
    header ?? spec.headers[0] ?? {
      name: "",
      extension: "",
      expected: {
        width: 0,
        height: 0,
        frames: []
      }
    }
  );
  const frames = iconFrames(bytes);
  const best = bestFrameIndex(frames);
  assert.equal(best, header?.expected.best);
  const single = iconFrames(
    singleFrameIcon({
      bytes,
      index: best
    })
  );
  assert.deepEqual(single.map(frame => [frame.width, frame.height]), [[256, 256]]);
});

test("a caption names the picture, its pixel size, file size and frames", () => {
  const caption = pictureCaption({
    name: "tray.ico",
    size: {
      width: 256,
      height: 256,
      frames: iconFrames(Uint8Array.from(Buffer.from(spec.headers.find(header => header.name === "ico")?.hex ?? "", "hex")))
    },
    byteSize: 4300
  });
  assert.equal(caption, "tray.ico: 256 x 256 px, 4.2 KB, frames 16, 256, 32");
});

function spotsOfCase({ kind, attribute, text, bindings }: (typeof spec.spots)[number]) {
  const known = new Map(Object.entries(bindings ?? {}));
  const isPlain = kind === "plain";
  if (isPlain) {
    return plainSpots({
      attribute,
      value: text,
      start: START,
      names
    });
  }

  const isExpression = kind === "expression";
  if (isExpression) {
    return expressionSpots({
      attribute,
      expression: text,
      start: START,
      names,
      bindings: known
    });
  }

  return keySpots({
    text,
    names,
    bindings: known
  });
}

test("the pictures written in an attribute, an expression or an object key are found with their taskbar", () => {
  for (const found of spec.spots) {
    const spots = spotsOfCase(found);
    assert.deepEqual(
      spots.map(spot => ({
        value: spot.value,
        variant: spot.variant
      })), found.expected.map(({ value, variant }) => ({
        value,
        variant
      })), found.text
    );
    const offset = found.kind === "keys" ? 0 : START;
    for (const [i, spot] of spots.entries()) {
      const written = found.expected[i]?.text ?? spot.value;
      assert.equal(found.text.slice(spot.start - offset, spot.end - offset).trim(), written, found.text);
    }
  }
});

test("the names a file binds to a picture are its image imports, constants and new URL constants", () => {
  for (const found of spec.bindings) {
    assert.deepEqual(Object.fromEntries(pictureBindings(found.text)), found.expected, found.name);
  }
});

test("only http and https URLs without credentials or a link-local host are fetchable", () => {
  for (const { url, expected: isFetchable } of spec.remoteUrls) {
    assert.equal(isFetchableUrl(url), isFetchable, url);
  }

  assert.equal(isFetchableUrl(`https://example.com/${"a".repeat(3000)}.png`), false);
});

test("a redirect is followed only to a fetchable URL and never from https to http", () => {
  for (const { from, location, expected } of spec.redirects) {
    assert.equal(
      redirectTarget({
        from,
        location
      }) ?? null, expected, location
    );
  }
});

test("a fetched picture is named by its first bytes, then its content type, then its URL", () => {
  for (const found of spec.sniffs) {
    const bytes = found.text === undefined ? Uint8Array.from(Buffer.from(found.hex ?? "", "hex")) : new TextEncoder().encode(found.text);
    assert.equal(
      sniffExtension({
        bytes,
        contentType: found.contentType,
        urlExtension: found.urlExtension
      }), found.expected, found.name
    );
  }
});
