import { isJsonObject, PatchOperation } from "./protocol.ts";
import type { Json, PatchOp, PathSegment } from "./protocol.ts";

// For a host written in JavaScript (Node, Electron): the patch that turns one
// value into the next. A Rust host does the same with its own diff and sends
// the same operations.

/**
 * What one step of the walk compares: the value at `path` before and after,
 * and the operations collected so far.
 */
interface Comparison<Previous, Next = Previous> {
  path: PathSegment[];
  previous: Previous;
  next: Next;
  ops: PatchOp[];
}

// An element read by index may be missing as far as the types go, though the
// walk only reads within bounds.
function isSame({ left, right }: {
  left: Json | undefined;
  right: Json | undefined;
}) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffArrays({ path, previous, next, ops }: Comparison<Json[]>) {
  let prefix = 0;
  const shortest = Math.min(previous.length, next.length);
  while (prefix < shortest && isSame({
    left: previous[prefix],
    right: next[prefix]
  })) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < shortest - prefix
    && isSame({
      left: previous[previous.length - 1 - suffix],
      right: next[next.length - 1 - suffix]
    })
  ) {
    suffix++;
  }

  const removed = previous.slice(prefix, previous.length - suffix);
  const inserted = next.slice(prefix, next.length - suffix);
  const hasSameLength = removed.length === inserted.length;
  if (hasSameLength) {
    // Same length: the elements changed in place, so only they signal.
    for (const [offset, item] of inserted.entries()) {
      diffValues({
        path: [...path, prefix + offset],
        previous: removed[offset],
        next: item,
        ops
      });
    }
  } else {
    ops.push({
      op: PatchOperation.splice,
      path,
      start: prefix,
      deleteCount: removed.length,
      items: inserted
    });
  }
}

function diffRecords({ path, previous, next, ops }: Comparison<Record<string, Json>>) {
  for (const key of Object.keys(previous)) {
    if (!Object.hasOwn(next, key)) {
      ops.push({
        op: PatchOperation.remove,
        path: [...path, key]
      });
    }
  }

  for (const [key, value] of Object.entries(next)) {
    const before = Object.hasOwn(previous, key) ? previous[key] : undefined;
    const isAdded = before === undefined;
    if (isAdded) {
      ops.push({
        op: PatchOperation.set,
        path: [...path, key],
        value
      });
    } else {
      diffValues({
        path: [...path, key],
        previous: before,
        next: value,
        ops
      });
    }
  }
}

function diffValues({ path, previous, next, ops }: Comparison<Json | undefined, Json>) {
  const isUnchanged = isSame({
    left: previous,
    right: next
  });
  if (isUnchanged) {
    return;
  }

  const isArrayPair = Array.isArray(previous) && Array.isArray(next);
  const isRecordPair = isJsonObject(previous) && isJsonObject(next);
  if (isArrayPair) {
    diffArrays({
      path,
      previous,
      next,
      ops
    });
  } else if (isRecordPair) {
    diffRecords({
      path,
      previous,
      next,
      ops
    });
  } else {
    ops.push({
      op: PatchOperation.set,
      path,
      value: next
    });
  }
}

/**
 * The operations that turn `previous` into `next`, for a host to send as a
 * patch: arrays of the same length change element by element, an array whose
 * length changed is spliced, and records change key by key. `[]` when they are
 * equal.
 */
export function diff({ previous, next }: {
  previous: Json;
  next: Json;
}) {
  const ops: PatchOp[] = [];
  diffValues({
    path: [],
    previous,
    next,
    ops
  });
  return ops;
}
