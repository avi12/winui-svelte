import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { test } from "node:test";

// The real registry under HKEY_CURRENT_USER with names no app uses: a
// protocol, a file type and a startup entry are registered, read back with
// reg.exe (a second witness, apart from the Win32 layer under test), removed,
// and checked gone. A failing assertion still cleans up, and nothing is
// injected: only registry keys are written and removed.

const { createWindowsRegistry } = await import("./native.ts");
const { installProtocolHandlers } = await import("./protocol-handlers.ts");
const { getLaunchAtLogin, launchAtLogin, registerFileTypes, unregisterFileTypes } = await import("./login.ts");

const REG = path.join(process.env["SystemRoot"] ?? "C:\\Windows", "System32", "reg.exe");
const COMMAND = {
  program: process.execPath,
  arguments: ["C:\\never\\run\\main.js"]
};

function query(key: string) {
  try {
    return execFileSync(REG, ["query", `HKCU\\${key}`, "/s"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return undefined;
  }
}

test("a protocol, a file type and a startup entry register, read back and leave nothing", () => {
  const suffix = randomBytes(5).toString("hex");
  const scheme = `wsvtest${suffix}`;
  const extension = `.wsv${suffix}`;
  const id = `dev.winui-svelte.test.${suffix}`;
  const registry = createWindowsRegistry();
  const uninstall = installProtocolHandlers({
    registry,
    command: COMMAND
  });
  try {
    navigator.registerProtocolHandler(scheme, "https://example.com/%s");
    const protocol = query(`Software\\Classes\\${scheme}`);
    assert.match(protocol ?? "", /URL Protocol/u);
    assert.match(protocol ?? "", /main\.js "%1"/u);

    registerFileTypes({
      id,
      extensions: [extension],
      description: "winui-svelte test file",
      registry,
      command: COMMAND
    });
    assert.match(query(`Software\\Classes\\${id}${extension}\\shell\\open\\command`) ?? "", /main\.js "%1"/u);
    assert.match(query(`Software\\Classes\\${extension}\\OpenWithProgids`) ?? "", new RegExp(`${id}${extension}`, "u"));

    launchAtLogin({
      id,
      isEnabled: true,
      arguments: ["--quiet"],
      registry,
      command: COMMAND
    });
    assert.match(query("Software\\Microsoft\\Windows\\CurrentVersion\\Run") ?? "", new RegExp(`${id.replaceAll(".", "\\.")}\\s+REG_SZ.*--winui-svelte-startup --quiet`, "u"));
    const state = getLaunchAtLogin({
      id,
      registry
    });
    assert.equal(state.isEnabled, true);

    navigator.unregisterProtocolHandler(scheme, "https://example.com/%s");
    assert.deepEqual(
      unregisterFileTypes({
        id,
        extensions: [extension],
        registry
      }), [extension]
    );
    launchAtLogin({
      id,
      isEnabled: false,
      registry
    });

    assert.equal(query(`Software\\Classes\\${scheme}`), undefined);
    assert.equal(query(`Software\\Classes\\${id}${extension}`), undefined);
    assert.equal(query(`Software\\Classes\\${extension}`), undefined, "the empty extension key is pruned");
    assert.doesNotMatch(query("Software\\Microsoft\\Windows\\CurrentVersion\\Run") ?? "", new RegExp(id.replaceAll(".", "\\."), "u"));
    assert.equal(
      getLaunchAtLogin({
        id,
        registry
      }).isEnabled, false
    );
  } finally {
    uninstall();
    registry.deleteTree(`Software\\Classes\\${scheme}`);
    registry.deleteTree(`Software\\Classes\\${id}${extension}`);
    registry.deleteTree(`Software\\Classes\\${extension}`);
    registry.deleteValue({
      key: "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
      name: id
    });
  }
});

test("a scheme that exists and is not ours is refused and left untouched", () => {
  const scheme = `wsvtest${randomBytes(5).toString("hex")}`;
  const key = `Software\\Classes\\${scheme}`;
  const registry = createWindowsRegistry();
  const uninstall = installProtocolHandlers({
    registry,
    command: COMMAND
  });
  try {
    registry.setString({
      key,
      name: "",
      value: "URL:someone else"
    });
    assert.throws(() => navigator.registerProtocolHandler(scheme, "https://example.com/%s"), { name: "InvalidStateError" });
    navigator.unregisterProtocolHandler(scheme, "https://example.com/%s");
    assert.equal(
      registry.readString({
        key,
        name: ""
      }), "URL:someone else"
    );
  } finally {
    uninstall();
    registry.deleteTree(key);
  }
  assert.equal(registry.hasKey(key), false);
});
