import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// The props the WebStorm plugin shows each font family of, in their own face

const TABLE_FILE = path.resolve(import.meta.dirname, "../../ide/webstorm/src/main/resources/font-family-props.json");
const table = z.object({ attributes: z.record(z.string(), z.array(z.string())) })
  .parse(JSON.parse(readFileSync(TABLE_FILE, "utf8")));

test("a text component's fontFamily is a FontFamilyInput, and a prop of another type is not listed", () => {
  assert.deepEqual(table.attributes["TextBlock"], ["fontFamily"]);
  assert.equal(table.attributes["Border"], undefined);
});
