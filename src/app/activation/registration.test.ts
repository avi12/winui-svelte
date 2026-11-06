import { commandLineOf, quoteArgument } from "./command.ts";
import type { RegistryBackend, ValueAddress } from "./registry.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The registrations over a fake registry in memory: what is written, what is
// refused, and that unregistering takes away exactly what was added.

const registration = await import("./registration.ts");
const {
  addFileTypes,
  addProtocol,
  disableLaunchAtLogin,
  enableLaunchAtLogin,
  readLaunchAtLogin,
  removeFileTypes,
  removeProtocol,
  STARTUP_ARGUMENT
} = registration;
const { normalizeExtension, normalizeScheme, requireIdentifier } = await import("./scheme.ts");

const COMMAND = {
  program: "C:\\Program Files\\nodejs\\node.exe",
  arguments: ["C:\\apps\\notes\\main.js"]
};
const CLASSES = "Software\\Classes";
const NODE = "\"C:\\Program Files\\nodejs\\node.exe\"";

function createFakeRegistry() {
  const values = new Map<string, Map<string, string>>();
  function normal(key: string) {
    return key.toLowerCase();
  }
  function ensure(key: string) {
    const parts = key.split("\\");
    for (let length = 1; length <= parts.length; length++) {
      const prefix = normal(parts.slice(0, length).join("\\"));
      if (!values.has(prefix)) {
        values.set(prefix, new Map());
      }
    }
  }
  function children(key: string) {
    return [...values.keys()].filter(other => other.startsWith(`${normal(key)}\\`));
  }
  return {
    values,
    setString({ key, name, value }: ValueAddress & { value: string }) {
      ensure(key);
      values.get(normal(key))?.set(normal(name), value);
    },
    readString({ key, name }: ValueAddress) {
      return values.get(normal(key))?.get(normal(name));
    },
    hasKey: (key: string) => values.has(normal(key)),
    deleteTree(key: string) {
      for (const other of [normal(key), ...children(key)]) {
        values.delete(other);
      }
    },
    deleteValue({ key, name }: ValueAddress) {
      values.get(normal(key))?.delete(normal(name));
    },
    deleteKeyIfEmpty(key: string) {
      const isEmpty = (values.get(normal(key))?.size ?? 1) === 0 && children(key).length === 0;
      if (isEmpty) {
        values.delete(normal(key));
      }

      return isEmpty;
    }
  } satisfies RegistryBackend & { values: Map<string, Map<string, string>> };
}

test("a protocol registers under the user's classes with the app's command", () => {
  const registry = createFakeRegistry();
  addProtocol({
    scheme: "Note",
    registry,
    command: COMMAND
  });
  assert.equal(
    registry.readString({
      key: `${CLASSES}\\note`,
      name: "URL Protocol"
    }), ""
  );
  assert.equal(
    registry.readString({
      key: `${CLASSES}\\note\\shell\\open\\command`,
      name: ""
    }),
    `${NODE} C:\\apps\\notes\\main.js "%1"`
  );
  assert.equal(
    removeProtocol({
      scheme: "note",
      registry
    }), true
  );
  assert.equal(registry.hasKey(`${CLASSES}\\note`), false);
});

test("a scheme that is reserved or malformed is a SecurityError", () => {
  for (const scheme of ["http", "HTTPS", "file", "ms-settings", "mailto", "a", "1abc", "no way", "x".repeat(65), "no_underscore"]) {
    assert.throws(() => normalizeScheme(scheme), { name: "SecurityError" }, scheme);
  }
  assert.equal(normalizeScheme("Web+Note"), "web+note");
});

test("an executable extension or a malformed one is refused", () => {
  for (const extension of [".exe", ".BAT", ".js", "note", ".", ".a b", ".ps1"]) {
    assert.throws(() => normalizeExtension(extension), { name: "SecurityError" }, extension);
  }
  assert.equal(normalizeExtension(".Note"), ".note");
});

test("a class another program owns is neither overwritten nor removed", () => {
  const registry = createFakeRegistry();
  registry.setString({
    key: `${CLASSES}\\note`,
    name: "",
    value: "URL:other app"
  });
  assert.throws(() => addProtocol({
    scheme: "note",
    registry,
    command: COMMAND
  }), { name: "InvalidStateError" });
  assert.equal(
    removeProtocol({
      scheme: "note",
      registry
    }), false
  );
  assert.equal(
    registry.readString({
      key: `${CLASSES}\\note`,
      name: ""
    }), "URL:other app"
  );
});

test("file types add the app to Open with and unregistering prunes the empty keys", () => {
  const registry = createFakeRegistry();
  addFileTypes({
    id: "dev.example.notes",
    extensions: [".note", ".NOTES"],
    description: "A note",
    registry,
    command: COMMAND
  });
  assert.equal(
    registry.readString({
      key: `${CLASSES}\\dev.example.notes.note`,
      name: ""
    }), "A note"
  );
  assert.equal(
    registry.readString({
      key: `${CLASSES}\\.note\\OpenWithProgids`,
      name: "dev.example.notes.note"
    }), ""
  );
  assert.equal(
    registry.readString({
      key: `${CLASSES}\\.notes\\OpenWithProgids`,
      name: "dev.example.notes.notes"
    }), ""
  );
  assert.deepEqual(
    removeFileTypes({
      id: "dev.example.notes",
      extensions: [".note", ".notes", ".gone"],
      registry
    }), [".note", ".notes"]
  );
  assert.equal(registry.hasKey(`${CLASSES}\\.note`), false);
  assert.equal(registry.hasKey(`${CLASSES}\\dev.example.notes.note`), false);
});

test("an extension that already has other values keeps its key", () => {
  const registry = createFakeRegistry();
  registry.setString({
    key: `${CLASSES}\\.note`,
    name: "",
    value: "Other.note"
  });
  addFileTypes({
    id: "dev.example.notes",
    extensions: [".note"],
    registry,
    command: COMMAND
  });
  removeFileTypes({
    id: "dev.example.notes",
    extensions: [".note"],
    registry
  });
  assert.equal(
    registry.readString({
      key: `${CLASSES}\\.note`,
      name: ""
    }), "Other.note"
  );
});

test("launch at login maps to a Run value and back", () => {
  const registry = createFakeRegistry();
  assert.deepEqual(
    readLaunchAtLogin({
      id: "dev.example.notes",
      registry
    }), {
      isEnabled: false,
      commandLine: undefined
    }
  );
  enableLaunchAtLogin({
    id: "dev.example.notes",
    arguments: ["--tray", "two words"],
    registry,
    command: COMMAND
  });
  const state = readLaunchAtLogin({
    id: "dev.example.notes",
    registry
  });
  assert.equal(state.isEnabled, true);
  assert.equal(state.commandLine, `${NODE} C:\\apps\\notes\\main.js ${STARTUP_ARGUMENT} --tray "two words"`);
  disableLaunchAtLogin({
    id: "dev.example.notes",
    registry
  });
  assert.equal(
    readLaunchAtLogin({
      id: "dev.example.notes",
      registry
    }).isEnabled, false
  );
});

test("an identifier with a path or a quote in it is refused", () => {
  for (const id of ["", "a\\b", "a\"b", "..\\x", " lead"]) {
    assert.throws(() => requireIdentifier(id), TypeError, id);
  }
});

test("arguments are quoted so that CommandLineToArgvW reads them back", () => {
  assert.equal(quoteArgument("plain"), "plain");
  assert.equal(quoteArgument("a b"), "\"a b\"");
  assert.equal(quoteArgument("say \"hi\""), "\"say \\\"hi\\\"\"");
  assert.equal(quoteArgument("C:\\dir with space\\"), "\"C:\\dir with space\\\\\"");
  assert.equal(quoteArgument(""), "\"\"");
  assert.throws(() => quoteArgument("a\nb"), /control/u);
  assert.throws(() => commandLineOf({
    command: {
      program: "C:\\a\"b.exe",
      arguments: []
    }
  }), /quote/u);
});
