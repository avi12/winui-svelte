import { readList, readRecord } from "./json-shape.ts";
import type { Json } from "#src/messaging/json.js";
import { z } from "zod";

// The class list `winapp` generates bindings for (package.json's
// winapp.jsBindings.additionalWinmds), and how an app's list takes in the
// classes this package needs. Shared by the generator, which keeps this
// repository's list current, and the `setup` command of an app that uses the
// package.

const bindingEntrySchema = z.object({
  namespace: z.string(),
  // Absent: every class of the namespace.
  classes: z.exactOptional(z.array(z.string()))
});

/** One namespace in the class list: some of its classes, or all of them. */
export type BindingEntry = z.infer<typeof bindingEntrySchema>;

/** A WinUI class, by the namespace it lives in and its own name. */
export interface ClassName {
  namespace: string;
  name: string;
}

// Listed after every other namespace. winapp adds to the bindings it made
// before, and fails (`Retained JavaScript module ... does not export its
// projected type`) when the system backdrop controllers are listed first: they
// reach Windows.System.DispatcherQueue, which Microsoft.UI.Dispatching shares
// a name with, and the names winapp gives the two then differ from the
// retained ones. Last, the run adds the files and keeps the names.
const TRAILING_NAMESPACES = new Set(["Microsoft.UI.Composition.SystemBackdrops"]);

function compareNamespaces(left: BindingEntry, right: BindingEntry) {
  const trailing = Number(TRAILING_NAMESPACES.has(left.namespace)) - Number(TRAILING_NAMESPACES.has(right.namespace));
  return trailing || left.namespace.localeCompare(right.namespace);
}

/** The entries of a parsed list; what is not an entry is left out. */
function bindingEntriesOf(list: Json[]) {
  return list.flatMap(item => {
    const entry = bindingEntrySchema.safeParse(item);
    return entry.success ? [entry.data] : [];
  });
}

/**
 * `existing` with the wanted classes added; the ones already there stay. The
 * result is sorted by namespace (the system backdrops last, see
 * TRAILING_NAMESPACES), and each namespace's classes by name.
 */
export function mergedEntries({ existing, wanted }: {
  existing: BindingEntry[];
  wanted: ClassName[];
}) {
  const byNamespace = new Map<string, Set<string>>();
  const wholeNamespaces: BindingEntry[] = [];
  for (const entry of existing) {
    const { classes } = entry;
    const isWholeNamespace = classes === undefined;
    if (isWholeNamespace) {
      wholeNamespaces.push(entry);
    } else {
      byNamespace.set(entry.namespace, new Set([...byNamespace.get(entry.namespace) ?? [], ...classes]));
    }
  }

  for (const type of wanted) {
    byNamespace.set(type.namespace, new Set([...byNamespace.get(type.namespace) ?? [], type.name]));
  }

  const entries = [...byNamespace.entries()].map(([namespace, classes]) => ({
    namespace,
    classes: [...classes].sort((left, right) => left.localeCompare(right))
  }));
  return [...entries, ...wholeNamespaces].sort(compareNamespaces);
}

/**
 * package.json's text with the wanted classes in winapp.jsBindings, in the
 * file's own line endings. The list must exist (an app starts it); the rest
 * of the file is kept as it is.
 *
 * @throws when package.json has no `winapp.jsBindings.additionalWinmds`
 */
export function packageJsonWithBindings({ original, wanted }: {
  original: string;
  wanted: ClassName[];
}) {
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const root = readRecord(JSON.parse(original));
  const winapp = readRecord(root?.["winapp"]);
  const bindings = readRecord(winapp?.["jsBindings"]);
  const list = readList(bindings?.["additionalWinmds"]);
  const hasAdditionalWinmds =
    root !== undefined && winapp !== undefined && bindings !== undefined && list !== undefined;
  if (!hasAdditionalWinmds) {
    throw new Error("package.json has no winapp.jsBindings.additionalWinmds");
  }

  // Each level is a copy with its keys in their order, so putting it back
  // keeps the file's layout.
  bindings["additionalWinmds"] = mergedEntries({
    existing: bindingEntriesOf(list),
    wanted
  });
  winapp["jsBindings"] = bindings;
  root["winapp"] = winapp;
  return `${JSON.stringify(root, null, 2).replaceAll("\n", newline)}${newline}`;
}
