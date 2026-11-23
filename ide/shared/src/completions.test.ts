import { entriesOf } from "./completions.ts";
import { previewOfSpot } from "./spot-preview.ts";
import { SpotKind } from "./spots.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const FOREGROUND = "#ffffff";

function spot({ kind, text }: {
  kind: SpotKind;
  text: string;
}) {
  return {
    kind,
    start: 0,
    end: text.length,
    text
  };
}

test("the color names are offered with their hex as the swatch", async () => {
  const entries = await entriesOf({
    spot: spot({
      kind: SpotKind.COLOR,
      text: ""
    }),
    foreground: FOREGROUND
  });
  const red = entries.find(entry => entry.label === "red");
  assert.equal(red?.color, "#ff0000");
  assert.equal(red?.markdown, undefined);
});

test("the Fluent icons are offered with their code point and a glyph preview", async () => {
  const entries = await entriesOf({
    spot: spot({
      kind: SpotKind.GLYPH,
      text: ""
    }),
    foreground: FOREGROUND
  });
  const save = entries.find(entry => entry.label === "Save");
  assert.equal(save?.detail, "U+E74E");
  assert.match(save?.markdown ?? "", /^!\[Save\]\(data:image\/svg\+xml;base64,/u);
});

test("a spot previews what its text means, and nothing while it means nothing", () => {
  assert.match(
    previewOfSpot({
      spot: spot({
        kind: SpotKind.COLOR,
        text: "red"
      }),
      foreground: FOREGROUND
    }) ?? "", /#ff0000/u
  );
  assert.equal(
    previewOfSpot({
      spot: spot({
        kind: SpotKind.COLOR,
        text: "notacolor"
      }),
      foreground: FOREGROUND
    }), undefined
  );
  assert.equal(
    previewOfSpot({
      spot: spot({
        kind: SpotKind.FONT,
        text: ""
      }),
      foreground: FOREGROUND
    }), undefined
  );
  assert.match(
    previewOfSpot({
      spot: spot({
        kind: SpotKind.FONT,
        text: "Arial"
      }),
      foreground: FOREGROUND
    }) ?? "", /\*\*Arial\*\*/u
  );
});
