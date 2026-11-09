import { pathsOfShellIdList } from "./shell-items.ts";
import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { bindDll, DWORD_BYTES } from "#src/win32-calls.js";
import assert from "node:assert/strict";
import nodePath from "node:path";
import { test } from "node:test";

// A "Shell IDList Array" as Explorer's address bar makes it, built here from the
// shell's own ids for a real folder: the parent's ids, then the folder's own
// (relative to the parent), behind the header of offsets.

const { createIds, lastId, sizeOfIds } = bindDll({
  dll: "shell32.dll",
  functions: {
    createIds: ["ILCreateFromPathW", ["pointer"], "pointer"],
    lastId: ["ILFindLastID", ["pointer"], "pointer"],
    sizeOfIds: ["ILGetSize", ["pointer"], "u32"]
  }
});
const BYTE_ALIGNMENT = 1;
const ITEM_COUNT = 1;
const HEADER_BYTES = DWORD_BYTES * (ITEM_COUNT + 2);

function bytesOfIds(ids: bigint) {
  const size = sizeOfIds(ids);
  return DynComRawMemory.fromUnsafeAddress(ids, size, BYTE_ALIGNMENT).readBytes(0, size);
}

function shellIdListOf(folder: string) {
  const parent = bytesOfIds(createIds(nodePath.dirname(folder)));
  const item = bytesOfIds(lastId(createIds(folder)));
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt32LE(ITEM_COUNT, 0);
  header.writeUInt32LE(HEADER_BYTES, DWORD_BYTES);
  header.writeUInt32LE(HEADER_BYTES + parent.length, DWORD_BYTES * 2);
  return Buffer.concat([header, parent, item]);
}

test("a shell id list of a folder gives the folder's path", () => {
  const folder = nodePath.resolve(import.meta.dirname);
  assert.deepEqual(pathsOfShellIdList(shellIdListOf(folder)), [folder]);
});
