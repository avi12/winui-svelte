import { DataKind } from "./accept.ts";
import { copyOf, pathsOfDropFiles, sourceOfReader } from "./ole-data-object.ts";
import type { OleReader } from "./ole-data-object.ts";
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

const DROPFILES_HEADER_BYTES = 20;
const WIDE_FLAG_OFFSET = 16;

function dropFiles({ paths, isWide }: {
  paths: string[];
  isWide: boolean;
}) {
  const header = Buffer.alloc(DROPFILES_HEADER_BYTES);
  header.writeUInt32LE(DROPFILES_HEADER_BYTES, 0);
  header.writeUInt32LE(isWide ? 1 : 0, WIDE_FLAG_OFFSET);
  const body = Buffer.from(`${paths.join("\0")}\0\0`, isWide ? "utf16le" : "latin1");
  return Buffer.concat([header, body]);
}

test("the paths of a DROPFILES block are read, wide or ANSI", () => {
  const paths = ["C:/one", "C:/two three/four"];
  assert.deepEqual(
    pathsOfDropFiles(
      dropFiles({
        paths,
        isWide: true
      })
    ), paths
  );
  assert.deepEqual(
    pathsOfDropFiles(
      dropFiles({
        paths,
        isWide: false
      })
    ), paths
  );
});

test("a copy of a reader keeps answering after the live reader is gone", async () => {
  let isAlive = true;
  const live: OleReader = {
    has: kind => isAlive && (kind === DataKind.file || kind === DataKind.text),
    text: () => "dragged text",
    html: () => "",
    uri: () => "",
    paths: () => [path.join(import.meta.dirname, "ole-data-object.test.ts")]
  };
  const source = sourceOfReader(copyOf(live));
  isAlive = false;
  assert.equal(source.has(DataKind.file), true);
  assert.equal(source.has(DataKind.html), false);
  assert.equal(await source.readText(), "dragged text");
  const [file] = await source.readFiles();
  assert.equal(file?.name, "ole-data-object.test.ts");
  assert.deepEqual(source.formats(), []);
});
