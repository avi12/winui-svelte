import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// The house rule: the prose of the Markdown docs has no full stops. A sentence
// ends without a period; code, tables, links and numbers keep theirs.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const FENCE = /^\s*(```|~~~)/u;
const CODE_SPAN = /`[^`]*`/gu;
const LINK_TARGET = /\]\([^)]*\)/gu;
const SENTENCE_BOUNDARY = /[a-z)\]"'*_]\.\s+[A-Z"*_([]/u;

function markdownFiles() {
  const listed = execFileSync("git", ["ls-files", "*.md"], {
    cwd: PACKAGE_ROOT,
    encoding: "utf8"
  });
  return listed.split("\n").filter(file => file !== "");
}

function proseLines(file: string) {
  const lines = readFileSync(path.join(PACKAGE_ROOT, file), "utf8").split(/\r?\n/u);
  let isInCode = false;
  const prose: {
    number: number;
    text: string;
  }[] = [];
  for (const [i, line] of lines.entries()) {
    const isFence = FENCE.test(line);
    isInCode = isFence ? !isInCode : isInCode;
    const isSkipped = isFence || isInCode || line.trim() === "" || line.trimStart().startsWith("|") || line.trimStart().startsWith("<");
    if (!isSkipped) {
      prose.push({
        number: i + 1,
        text: line.replace(CODE_SPAN, "").replace(LINK_TARGET, "]").trimEnd()
      });
    }
  }

  return prose;
}

test("the prose of the Markdown docs has no full stops", () => {
  const offences = markdownFiles().flatMap(file => proseLines(file)
    .filter(({ text }) => (text.endsWith(".") && !text.endsWith("...")) || SENTENCE_BOUNDARY.test(text))
    .map(({ number, text }) => `${file}:${number}: ${text.slice(0, 80)}`));
  assert.deepEqual(offences, []);
});
