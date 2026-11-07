import type { ShellBackend, ShortcutProperties } from "./backend.ts";
import { SUCCESS } from "./kinds.ts";
import type { RegistryBackend } from "#src/app/activation/registry.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The shell verbs over fakes: what they check before calling Windows, and what
// they pass to it. The real calls are in native.test.ts.

const { registerAppPath, unregisterAppPath } = await import("./app-paths.ts");
const { openWith } = await import("./open-with.ts");
const { createShortcut, readShortcut } = await import("./shortcut.ts");
const { trash } = await import("./trash.ts");

function reasonOf(result: {
  ok: boolean;
  reason?: string;
}) {
  return result.ok ? "" : result.reason;
}

function fakeBackend() {
  const recycled: string[][] = [];
  const written: Array<ShortcutProperties & { path: string }> = [];
  const backend = {
    recycle(paths) {
      recycled.push([...paths]);
      return SUCCESS;
    },
    writeShortcut: options => written.push(options),
    readShortcut: () => ({
      target: "C:\\a.exe",
      arguments: "",
      workingDirectory: "",
      iconPath: "",
      iconIndex: 0,
      description: ""
    })
  } satisfies ShellBackend;
  return {
    backend,
    recycled,
    written
  };
}

async function withTempFile(use: (file: string) => void | Promise<void>) {
  const directory = mkdtempSync(path.join(tmpdir(), "wsv-unit-"));
  const file = path.join(directory, "a.txt");
  writeFileSync(file, "x");
  try {
    await use(file);
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
}

test("trash recycles existing full paths and nothing else", () => withTempFile(file => {
  const { backend, recycled } = fakeBackend();
  assert.deepEqual(
    trash({
      paths: [file],
      backend
    }), SUCCESS
  );
  assert.deepEqual(recycled, [[file]]);
  const cases = [
    [[], "invalid"],
    [["relative.txt"], "invalid"],
    [["\\\\?\\C:\\x"], "invalid"],
    [[`${file}\0`], "invalid"],
    [[file, `${file}.missing`], "not-found"]
  ] as const;
  for (const [paths, reason] of cases) {
    assert.equal(
      reasonOf(
        trash({
          paths,
          backend
        })
      ), reason
    );
  }

  assert.equal(recycled.length, 1);
}));

test("createShortcut quotes arguments and refuses to overwrite", () => withTempFile(file => {
  const { backend, written } = fakeBackend();
  const link = path.join(path.dirname(file), "s.lnk");
  const result = createShortcut({
    path: link,
    target: file,
    arguments: ["a b", "c\"d"],
    workingDirectory: path.dirname(file),
    icon: {
      path: file
    },
    description: "hi",
    backend
  });
  assert.deepEqual(result, SUCCESS);
  assert.equal(written[0]?.arguments, "\"a b\" \"c\\\"d\"");
  assert.equal(written[0]?.iconIndex, 0);
  writeFileSync(link, "x");
  assert.equal(
    reasonOf(
      createShortcut({
        path: link,
        target: file,
        backend
      })
    ), "exists"
  );
  assert.equal(
    createShortcut({
      path: link,
      target: file,
      shouldOverwrite: true,
      backend
    }).ok, true
  );
}));

test("createShortcut and readShortcut check their paths", () => {
  const { backend, written } = fakeBackend();
  const bad = [
    {
      path: "s.lnk",
      target: "C:\\a.exe"
    },
    {
      path: "C:\\s.txt",
      target: "C:\\a.exe"
    },
    {
      path: "C:\\s.lnk",
      target: "a.exe"
    },
    {
      path: "C:\\s.lnk",
      target: "C:\\a.exe",
      workingDirectory: "x"
    },
    {
      path: "C:\\s.lnk",
      target: "C:\\a.exe",
      icon: {
        path: "x.ico"
      }
    }
  ];
  for (const options of bad) {
    assert.equal(
      reasonOf(
        createShortcut({
          ...options,
          backend
        })
      ), "invalid"
    );
  }

  assert.equal(written.length, 0);
  assert.equal(
    reasonOf(
      readShortcut({
        path: "C:\\wsv-no-such-folder\\s.lnk",
        backend
      })
    ), "not-found"
  );
});

test("readShortcut gives the icon only when there is one", () => withTempFile(file => {
  const { backend } = fakeBackend();
  const link = path.join(path.dirname(file), "s.lnk");
  writeFileSync(link, "x");
  const result = readShortcut({
    path: link,
    backend
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.icon : null, undefined);
}));

test("openWith shows the picker for an existing file only", () => withTempFile(async file => {
  const shown: string[] = [];
  const backend = {
    showPicker(path: string) {
      shown.push(path);
      return Promise.resolve(shown.length === 1);
    }
  };
  assert.deepEqual(
    await openWith({
      path: file,
      backend
    }), SUCCESS
  );
  assert.equal(
    reasonOf(
      await openWith({
        path: file,
        backend
      })
    ), "aborted"
  );
  assert.equal(
    reasonOf(
      await openWith({
        path: "a.txt",
        backend
      })
    ), "invalid"
  );
  assert.equal(
    reasonOf(
      await openWith({
        path: `${file}.missing`,
        backend
      })
    ), "not-found"
  );
  assert.equal(
    reasonOf(
      await openWith({
        path: file,
        backend: {
          showPicker: () => Promise.reject(new Error("no picker"))
        }
      })
    ), "failed"
  );
  assert.equal(shown.length, 2);
}));

function memoryRegistry(initial: Record<string, Record<string, string>> = {}) {
  const keys = new Map<string, Map<string, string>>();
  for (const [key, values] of Object.entries(initial)) {
    keys.set(key.toLowerCase(), new Map(Object.entries(values)));
  }

  const registry = {
    setString({ key, name, value }) {
      const values = keys.get(key.toLowerCase()) ?? new Map<string, string>();
      values.set(name, value);
      keys.set(key.toLowerCase(), values);
    },
    readString: ({ key, name }) => keys.get(key.toLowerCase())?.get(name),
    hasKey: key => keys.has(key.toLowerCase()),
    deleteTree: key => keys.delete(key.toLowerCase()),
    deleteValue() {},
    deleteKeyIfEmpty: () => false
  } satisfies RegistryBackend;
  return {
    registry,
    keys
  };
}

const APP_KEY = "software\\microsoft\\windows\\currentversion\\app paths\\mytool.exe";

test("registerAppPath writes a marked key, replaces its own and removes it", () => {
  const { registry, keys } = memoryRegistry();
  assert.deepEqual(
    registerAppPath({
      name: "mytool",
      program: "C:\\Tools\\mytool.exe",
      registry
    }), SUCCESS
  );
  const values = keys.get(APP_KEY);
  assert.equal(values?.get(""), "C:\\Tools\\mytool.exe");
  assert.equal(values?.get("Path"), "C:\\Tools");
  assert.equal(values?.get("WinuiSvelte"), "1");
  assert.equal(
    registerAppPath({
      name: "mytool",
      program: "D:\\mytool.exe",
      registry
    }).ok, true
  );
  assert.deepEqual(
    unregisterAppPath({
      name: "mytool",
      registry
    }), SUCCESS
  );
  assert.equal(keys.size, 0);
  assert.equal(
    reasonOf(
      unregisterAppPath({
        name: "mytool",
        registry
      })
    ), "not-found"
  );
});

test("registerAppPath leaves another program's key alone and rejects bad input", () => {
  const { registry, keys } = memoryRegistry({
    [APP_KEY]: {
      "": "C:\\other.exe"
    }
  });
  assert.equal(
    reasonOf(
      registerAppPath({
        name: "mytool",
        program: "C:\\mytool.exe",
        registry
      })
    ), "owned-by-another"
  );
  assert.equal(
    reasonOf(
      unregisterAppPath({
        name: "mytool",
        registry
      })
    ), "owned-by-another"
  );
  assert.equal(keys.get(APP_KEY)?.get(""), "C:\\other.exe");
  const bad = [
    {
      name: "..\\x",
      program: "C:\\x.exe"
    },
    {
      name: "cmd",
      program: "C:\\x.exe"
    },
    {
      name: "tool.exe",
      program: "C:\\x.exe"
    },
    {
      name: "tool",
      program: "x.exe"
    },
    {
      name: "tool",
      program: "C:\\x.bat"
    }
  ];
  for (const options of bad) {
    assert.equal(
      reasonOf(
        registerAppPath({
          ...options,
          registry
        })
      ), "invalid"
    );
  }
});
