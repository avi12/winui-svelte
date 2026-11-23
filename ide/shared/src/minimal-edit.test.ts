import { minimalEdit } from "./minimal-edit.ts";
import { reportSummary, SkipReason } from "./report.ts";
import { applyEdits } from "./text-edit.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("the edit between two texts is what differs, and applying it gives the second", () => {
  const before = "<A class=\"x\" visibility=\"Collapsed\" />\n";
  const after = "<A class=\"x\" />\n\n<style>\n</style>\n";
  const edit = minimalEdit({
    before,
    after
  });
  assert.equal(
    applyEdits({
      text: before,
      edits: [edit]
    }), after
  );
  assert.equal(before.slice(0, edit.start), "<A class=\"x\" ");
});

test("equal texts give an empty edit at the end", () => {
  const edit = minimalEdit({
    before: "same",
    after: "same"
  });
  assert.deepEqual(edit, {
    start: 4,
    end: 4,
    text: ""
  });
});

test("the summary names the counts and what was skipped", () => {
  assert.equal(
    reportSummary({
      attributes: 3,
      changedFiles: 2,
      skipped: new Map()
    }), "3 attributes converted in 2 files"
  );
  assert.equal(
    reportSummary({
      attributes: 0,
      changedFiles: 0,
      skipped: new Map([[SkipReason.NO_DEPENDENCY, 4], [SkipReason.NOTHING_TO_CONVERT, 1]])
    }), "0 attributes converted in 0 files, skipped 4 (no winui-svelte dependency); 1 (nothing to convert)"
  );
});
