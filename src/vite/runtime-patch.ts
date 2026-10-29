import path from "node:path";

// Svelte's client runtime assumes a browser's events: one argument per
// handler, and a root listener that routes the delegated ones (here every
// event is listened to on its control). WinUI raises
// (sender, args) on the control itself, so the runtime is read with these
// edits, in memory, wherever it is loaded (the Vite plugin, the Node loader).
// An edit whose anchor is gone fails loudly: it means a Svelte release the
// package has not been checked against.

interface Edit {
  readonly from: string;
  readonly to: string;
}

interface FilePatch {
  readonly file: string;
  readonly edits: readonly Edit[];
}

const patches: readonly FilePatch[] = [
  {
    file: "dom/elements/events.js",
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
    file: "render.js",
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
    file: "dom/elements/attributes.js",
    edits: [
      {
        from: "function handle(evt) {\n\t\t\t\t\tcurrent[key].call(this, evt);",
        to: "function handle(...args) {\n\t\t\t\t\tcurrent[key].apply(this, args);"
      }
    ]
  }
];

const RUNTIME_FOLDER = ["svelte", "src", "internal", "client"].join("/");

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
  for (const { from, to } of patch.edits) {
    const isAnchorMissing = !patched.includes(from);
    if (isAnchorMissing) {
      throw new Error(`winui-svelte cannot read this Svelte: ${patch.file} no longer has "${from}". Install a Svelte release within the peer range.`);
    }

    patched = patched.replace(from, () => to);
  }

  return patched;
}
