import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Svelte's client runtime assumes a browser's events: one argument per
// handler, and a root listener that routes the delegated ones (here every
// event is listened to on its control). WinUI raises
// (sender, args) on the control itself, so the runtime is read with these
// edits, in memory, wherever it is loaded (the Vite plugin, the Node loader).
// A media query has no WinUI to ask, and svelte/motion makes one as it loads,
// before the DOM is installed: it matches nothing, and nothing changes.
// An anchor is matched by its tokens, whatever the whitespace between them
// (Svelte re-indents a function when it wraps it in a block). One that is gone
// fails loudly, naming the file and the Svelte release: it is a release the
// package has not been checked against (`pnpm check:svelte-matrix`).

interface Edit {
  readonly from: string;
  readonly to: string;
  /** The edit is for releases that still have the anchor; a release without it needs none. */
  readonly isOptional?: boolean;
}

interface FilePatch {
  readonly file: string;
  readonly edits: readonly Edit[];
}

const patches: readonly FilePatch[] = [
  {
    file: "reactivity/media-query.js",
    edits: [
      {
        from: "const q = window.matchMedia(final_query);",
        to: "const q = globalThis.window?.matchMedia?.(final_query) ?? { matches: false, addEventListener() {}, removeEventListener() {} };"
      }
    ]
  },
  {
    file: "internal/client/dom/elements/events.js",
    edits: [
      {
        from: "function target_handler(/** @type {Event} */ event) {",
        to: "function target_handler(...args) {"
      },
      {
        from: "handle_event_propagation.call(dom, event);",
        to: ""
      },
      {
        from: "if (!event.cancelBubble) {",
        to: "{"
      },
      {
        from: "return handler?.call(this, event);",
        to: "return handler?.apply(this, args);"
      },
      {
        from: "export function handle_event_propagation(event) {",
        to: "export function handle_event_propagation() {}\nfunction unused_handle_event_propagation(event) {"
      },
      {
        from: "(element[event_symbol] ??= {})[event_name] = handler;",
        to: [
          "var listeners = (element[event_symbol] ??= {});",
          "if (listeners[event_name]) element.removeEventListener(event_name, listeners[event_name]);",
          "listeners[event_name] = handler == null ? undefined : create_event(event_name, element, handler);"
        ].join("\n\t")
      }
    ]
  },
  {
    file: "internal/client/render.js",
    edits: [
      {
        from: "var event_handle = (events) => {",
        to: "var event_handle = (events) => { return;"
      },
      {
        from: "for (var event_name of registered_events) {",
        to: "for (var event_name of []) {"
      }
    ]
  },
  {
    file: "internal/client/dom/operations.js",
    edits: [
      {
        from: "document.createElementNS(namespace ?? NAMESPACE_HTML, tag, options)",
        to: "document.createElement(tag)",
        isOptional: true
      }
    ]
  },
  {
    file: "internal/client/dom/elements/attributes.js",
    edits: [
      {
        from: "function handle(evt) {\n\t\t\t\t\tcurrent[key].call(this, evt);",
        to: "function handle(...args) {\n\t\t\t\t\tcurrent[key].apply(this, args);"
      }
    ]
  }
];

const RUNTIME_FOLDER = ["svelte", "src"].join("/");

const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/gu;
const WHITESPACE_RUN = /\s+/u;

function anchorOf(text: string) {
  const tokens = text.trim().split(WHITESPACE_RUN).map(token => token.replaceAll(REGEXP_SPECIAL, String.raw`\$&`));
  return new RegExp(tokens.join(String.raw`\s+`), "u");
}

function versionOf(filename: string) {
  const location = filename.replace(/[?#].*$/u, "");
  const file = location.startsWith("file:") ? fileURLToPath(location) : location;
  const folder = file.slice(0, file.lastIndexOf(path.join("svelte", "src")) + "svelte".length);
  try {
    const manifest = z.object({
      version: z.string()
    }).parse(JSON.parse(readFileSync(path.join(folder, "package.json"), "utf8")));
    return manifest.version;
  } catch {
    return "unknown";
  }
}

function patchOf(filename: string) {
  const normalized = filename.replaceAll(path.sep, "/").replace(/[?#].*$/u, "");
  return patches.find(({ file }) => normalized.endsWith(`/${RUNTIME_FOLDER}/${file}`));
}

/**
 * Whether Svelte's client runtime file at `filename` is one the package reads
 * with edits.
 */
export function isPatchedRuntime(filename: string) {
  return patchOf(filename) !== undefined;
}

/**
 * The runtime file's source with the package's edits applied.
 *
 * @param options - The file's path, and its source as Svelte ships it.
 * @returns The edited source.
 * @throws {Error} When an edit's anchor is not in the source.
 */
export function patchSvelteRuntime({ filename, source }: {
  filename: string;
  source: string;
}) {
  const patch = patchOf(filename);
  if (!patch) {
    return source;
  }

  let patched = source;
  for (const { from, to, isOptional } of patch.edits) {
    const anchor = anchorOf(from);
    const isAnchorMissing = !anchor.test(patched);
    const isSkipped = isAnchorMissing && isOptional;
    if (isSkipped) {
      continue;
    }

    if (isAnchorMissing) {
      throw new Error(`winui-svelte cannot read Svelte ${versionOf(filename)}: src/${patch.file} no longer has "${from.replaceAll(/\s+/gu, " ")}". This Svelte release is outside the range the package is checked against (see "Svelte versions" in CONTRIBUTING.md); install one inside the peer range, or add the release to the matrix.`);
    }

    patched = patched.replace(anchor, () => to);
  }

  return patched;
}

/** The files of Svelte's runtime (relative to its `src` folder) the package reads with edits. */
export function patchedRuntimeFiles() {
  return patches.map(({ file }) => file);
}
