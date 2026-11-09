import {
  bindDll,
  DWORD_BYTES,
  NO_ADDRESS,
  WIDE_CHAR_BYTES,
  withMemory
} from "#src/win32-calls.js";

// Explorer's address bar and navigation pane drag a folder as "Shell IDList
// Array" (a parent folder and the items in it, as shell item ids), with no
// plain list of paths. This turns that list into the paths of the items that
// are in the file system.

const MAX_PATH_CHARS = 260;
const WIDE_NULL = "\0";

let cachedCalls: ReturnType<typeof makeCalls> | undefined;

function makeCalls() {
  return bindDll({
    dll: "shell32.dll",
    functions: {
      combineIds: ["ILCombine", ["pointer", "pointer"], "pointer"],
      pathOfIds: ["SHGetPathFromIDListW", ["pointer", "pointer"], "i32"],
      freeIds: ["ILFree", ["pointer"], "i32"]
    }
  });
}

function callsOf() {
  cachedCalls ??= makeCalls();
  return cachedCalls;
}

function pathOfIds(ids: bigint) {
  return withMemory({
    size: MAX_PATH_CHARS * WIDE_CHAR_BYTES,
    alignment: WIDE_CHAR_BYTES,
    use(buffer) {
      const isPath = callsOf().pathOfIds(ids, buffer) !== 0;
      if (!isPath) {
        return "";
      }

      const text = buffer.readBytes(0, MAX_PATH_CHARS * WIDE_CHAR_BYTES).toString("utf16le");
      return text.slice(0, text.indexOf(WIDE_NULL));
    }
  });
}

/**
 * The file system paths a "Shell IDList Array" names: the items of its parent
 * folder that are files or folders (a virtual item, such as This PC, has none).
 *
 * @param bytes - The block: the item count, then the offset of the parent
 *     folder's ids and of each item's ids.
 * @returns The paths, in the order of the items.
 */
export function pathsOfShellIdList(bytes: Buffer) {
  const itemCount = bytes.readUInt32LE(0);
  return withMemory({
    size: bytes.length,
    alignment: DWORD_BYTES,
    use(memory) {
      memory.writeBytes(0, bytes);
      const parent = memory.pointer(bytes.readUInt32LE(DWORD_BYTES)).address;
      const paths: string[] = [];
      for (let iItem = 1; iItem <= itemCount; iItem += 1) {
        const item = memory.pointer(bytes.readUInt32LE(DWORD_BYTES + iItem * DWORD_BYTES)).address;
        const combined = callsOf().combineIds(parent, item);
        const isCombined = combined !== NO_ADDRESS;
        if (isCombined) {
          paths.push(pathOfIds(combined));
          callsOf().freeIds(combined);
        }
      }

      return paths.filter(path => path !== "");
    }
  });
}
