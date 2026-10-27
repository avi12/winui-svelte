import { isJsonObject, PatchOperation } from "./protocol.ts";
import type { Json, PatchOp, PathSegment } from "./protocol.ts";

// Applies a host's changes to a value in place, so a reactive proxy (a
// `$state` object) only signals the properties that really changed: a
// binding reading `view.cards[2].title` re-runs when that title does, not
// when its neighbour does. Works on any plain object; it knows nothing of
// Svelte.

/** A patch that cannot be applied to the value it was sent for. */
export class PatchError extends Error {}

// Names that would reach an object's prototype instead of its data.
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** What a state is kept in: the root can be replaced, so it sits in a holder. */
export interface Holder {
  current: Json | undefined;
}

function keyOf(segment: PathSegment) {
  const key = String(segment);
  const isForbidden = FORBIDDEN_KEYS.has(key);
  if (isForbidden) {
    throw new PatchError(`path segment "${key}" is not allowed`);
  }

  return key;
}

function indexIn({ segment, limit }: {
  segment: PathSegment;
  limit: number;
}) {
  const isInRange = typeof segment === "number" && segment >= 0 && segment <= limit;
  if (!isInRange) {
    throw new PatchError(`array index ${String(segment)} is outside 0..${limit}`);
  }

  return segment;
}

function childOf({ container, segment }: {
  container: Json | undefined;
  segment: PathSegment;
}) {
  if (Array.isArray(container)) {
    return container[indexIn({
      segment,
      limit: container.length - 1
    })];
  }

  if (isJsonObject(container)) {
    const key = keyOf(segment);
    return Object.hasOwn(container, key) ? container[key] : undefined;
  }

  throw new PatchError(`cannot step into a ${typeof container}`);
}

function follow({ root, path }: {
  root: Json | undefined;
  path: PathSegment[];
}) {
  let current = root;
  for (const segment of path) {
    current = childOf({
      container: current,
      segment
    });

    const isMissing = current === undefined;
    if (isMissing) {
      throw new PatchError(`nothing at ${JSON.stringify(path)}`);
    }
  }

  return current;
}

function reconcileArray({ previous, next }: {
  previous: Json[];
  next: Json[];
}) {
  for (const [index, value] of next.entries()) {
    previous[index] = reconcile({
      previous: previous[index],
      next: value
    });
  }

  previous.length = next.length;
  return previous;
}

function reconcileRecord({ previous, next }: {
  previous: Record<string, Json>;
  next: Record<string, Json>;
}) {
  for (const key of Object.keys(previous)) {
    if (!Object.hasOwn(next, key)) {
      delete previous[key];
    }
  }

  for (const [key, value] of Object.entries(next)) {
    previous[keyOf(key)] = reconcile({
      previous: Object.hasOwn(previous, key) ? previous[key] : undefined,
      next: value
    });
  }

  return previous;
}

/**
 * `next` merged into `previous`: equal parts keep their identity (and so
 * their reactivity), differing parts are assigned. Returns what to store.
 */
export function reconcile({ previous, next }: {
  previous: Json | undefined;
  next: Json;
}) {
  const isArrayPair = Array.isArray(previous) && Array.isArray(next);
  if (isArrayPair) {
    return reconcileArray({
      previous,
      next
    });
  }

  const isRecordPair = isJsonObject(previous) && isJsonObject(next);
  if (isRecordPair) {
    return reconcileRecord({
      previous,
      next
    });
  }

  return next;
}

function setAt({ holder, path, value }: {
  holder: Holder;
  path: PathSegment[];
  value: Json;
}) {
  const last = path.at(-1);
  const isRoot = last === undefined;
  if (isRoot) {
    holder.current = reconcile({
      previous: holder.current,
      next: value
    });
    return;
  }

  const parent = follow({
    root: holder.current,
    path: path.slice(0, -1)
  });
  if (Array.isArray(parent)) {
    const index = indexIn({
      segment: last,
      limit: parent.length
    });
    parent[index] = reconcile({
      previous: parent[index],
      next: value
    });
  } else if (isJsonObject(parent)) {
    const key = keyOf(last);
    parent[key] = reconcile({
      previous: Object.hasOwn(parent, key) ? parent[key] : undefined,
      next: value
    });
  } else {
    throw new PatchError(`cannot set inside a ${typeof parent}`);
  }
}

function removeAt({ holder, path }: {
  holder: Holder;
  path: PathSegment[];
}) {
  const last = path.at(-1);
  const isRoot = last === undefined;
  if (isRoot) {
    throw new PatchError("the root cannot be removed");
  }

  const parent = follow({
    root: holder.current,
    path: path.slice(0, -1)
  });
  if (Array.isArray(parent)) {
    parent.splice(
      indexIn({
        segment: last,
        limit: parent.length - 1
      }), 1
    );
  } else if (isJsonObject(parent)) {
    delete parent[keyOf(last)];
  } else {
    throw new PatchError(`cannot remove inside a ${typeof parent}`);
  }
}

function spliceAt({ holder, operation }: {
  holder: Holder;
  operation: Extract<PatchOp, { op: typeof PatchOperation.splice }>;
}) {
  const target = follow({
    root: holder.current,
    path: operation.path
  });
  if (!Array.isArray(target)) {
    throw new PatchError(`splice needs an array at ${JSON.stringify(operation.path)}`);
  }

  const isStartInRange = operation.start <= target.length;
  if (!isStartInRange) {
    throw new PatchError(`splice start ${operation.start} is past the end (${target.length})`);
  }

  target.splice(operation.start, operation.deleteCount, ...operation.items);
}

/**
 * Applies a host's operations to `holder`, in order. One that fails throws a
 * `PatchError` and leaves the earlier ones applied: the host answers by
 * sending a snapshot.
 */
export function applyOps({ holder, ops }: {
  holder: Holder;
  ops: PatchOp[];
}) {
  for (const operation of ops) {
    switch (operation.op) {
      case PatchOperation.set: {
        setAt({
          holder,
          path: operation.path,
          value: operation.value
        });
        break;
      }
      case PatchOperation.remove: {
        removeAt({
          holder,
          path: operation.path
        });
        break;
      }
      case PatchOperation.splice: {
        spliceAt({
          holder,
          operation
        });
        break;
      }
      default: {
        throw new PatchError("unknown patch operation");
      }
    }
  }
}
