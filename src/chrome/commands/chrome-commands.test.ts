/* eslint-disable @typescript-eslint/naming-convention -- Chrome's own manifest keys */
import type { HotkeyEvent } from "#src/app/hotkeys/index.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// chrome.commands over a fake hotkey registrar: no real hotkey is registered.

const { ChromeCommands } = await import("./chrome-commands.ts");
const { parseShortcut } = await import("./shortcut.ts");
const { HotkeyConflictError } = await import("#src/app/hotkeys/errors.js");

const PRESS: HotkeyEvent = {
  keys: "control+shift+g",
  key: "g",
  modifiers: ["control", "shift"],
  ctrlKey: true,
  altKey: false,
  shiftKey: true,
  metaKey: false
};

type Options = Parameters<NonNullable<ConstructorParameters<typeof ChromeCommands>[0]["register"]>>[0];

function fakeRegistrar(conflicts: readonly string[] = []) {
  const registered: Options[] = [];
  const state = { unregistered: 0 };
  return {
    registered,
    state,
    register(options: Options) {
      const keys = typeof options.keys === "string" ? options.keys : `${(options.keys.modifiers ?? []).join("+")}+${options.keys.key}`;
      if (conflicts.includes(keys)) {
        throw new HotkeyConflictError("taken");
      }

      registered.push(options);
      return {
        id: registered.length,
        keys,
        isRegistered: true,
        unregister() {
          state.unregistered += 1;
        }
      };
    }
  };
}

test("shortcuts map to Windows hotkeys", () => {
  assert.equal(parseShortcut("Ctrl+Shift+Y").display, "Ctrl+Shift+Y");
  assert.deepEqual(parseShortcut("Ctrl+Shift+Y").chord, {
    modifiers: ["control", "shift"],
    key: "y"
  });
  assert.equal(parseShortcut("MacCtrl+Comma").display, "Ctrl+Comma");
  assert.equal(parseShortcut("Command+Alt+5").chord.key, "digit5");
  assert.equal(parseShortcut("Ctrl+Up").chord.key, "arrowup");
  assert.equal(parseShortcut("MediaPlayPause").chord.key, "mediaplaypause");
  assert.equal(parseShortcut("ctrl+f5").display, "Ctrl+F5");
  assert.throws(() => parseShortcut("Hyper+Y"), /not a modifier/u);
  assert.throws(() => parseShortcut("Ctrl+Banana"), /not a key/u);
});

test("getAll lists names, descriptions and shortcuts once started", async () => {
  const registrar = fakeRegistrar();
  const commands = new ChromeCommands({
    commands: {
      toggle: {
        suggested_key: {
          default: "Ctrl+Shift+Y",
          mac: "Command+Shift+Y"
        },
        description: "Toggle"
      },
      windowsOnly: {
        suggested_key: {
          default: "Ctrl+Q",
          windows: "Alt+Q"
        }
      },
      macOnly: {
        suggested_key: {
          mac: "Command+M"
        }
      },
      plain: {}
    },
    register: registrar.register
  });
  assert.deepEqual((await commands.getAll()).map(command => command.shortcut), ["", "", "", ""]);
  assert.deepEqual(commands.start(), []);
  assert.deepEqual(await commands.getAll(), [
    {
      name: "toggle",
      description: "Toggle",
      shortcut: "Ctrl+Shift+Y"
    },
    {
      name: "windowsOnly",
      description: "",
      shortcut: "Alt+Q"
    },
    {
      name: "macOnly",
      description: "",
      shortcut: ""
    },
    {
      name: "plain",
      description: "",
      shortcut: ""
    }
  ]);
  assert.equal(registrar.registered.length, 2);
  commands.start();
  assert.equal(registrar.registered.length, 2);
});

test("a press fires onCommand with the name", () => {
  const registrar = fakeRegistrar();
  const commands = new ChromeCommands({
    commands: {
      go: {
        suggested_key: "Ctrl+Shift+G"
      }
    },
    register: registrar.register
  });
  const heard: string[] = [];
  commands.onCommand.addListener(name => heard.push(name));
  commands.start();
  const [registration] = registrar.registered;
  registration?.onpressed(PRESS);
  assert.deepEqual(heard, ["go"]);
});

test("_execute_action runs the action click, not onCommand", () => {
  const registrar = fakeRegistrar();
  const clicks: number[] = [];
  const commands = new ChromeCommands({
    commands: {
      _execute_action: {
        suggested_key: "Ctrl+Shift+A"
      }
    },
    onExecuteAction: () => clicks.push(1),
    register: registrar.register
  });
  const heard: string[] = [];
  commands.onCommand.addListener(name => heard.push(name));
  commands.start();
  registrar.registered[0]?.onpressed(PRESS);
  assert.deepEqual(clicks, [1]);
  assert.deepEqual(heard, []);
});

test("a clash leaves the shortcut unassigned and is reported", async () => {
  const registrar = fakeRegistrar(["control+shift+k"]);
  const commands = new ChromeCommands({
    commands: {
      clash: {
        suggested_key: "Ctrl+Shift+K"
      },
      fine: {
        suggested_key: "Ctrl+Shift+J"
      }
    },
    register: registrar.register
  });
  const failures = commands.start();
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.name, "clash");
  assert.deepEqual((await commands.getAll()).map(command => command.shortcut), ["", "Ctrl+Shift+J"]);
});

test("stop gives the shortcuts back", async () => {
  const registrar = fakeRegistrar();
  const commands = new ChromeCommands({
    commands: {
      go: {
        suggested_key: "Ctrl+Shift+G"
      }
    },
    register: registrar.register
  });
  commands.start();
  commands.stop();
  assert.equal(registrar.state.unregistered, 1);
  assert.equal((await commands.getAll())[0]?.shortcut, "");
});

test("a bad manifest throws at construction", () => {
  assert.throws(() => new ChromeCommands({
    commands: {
      bad: {
        suggested_key: "Ctrl+Nope"
      }
    }
  }), /bad suggested_key/u);
  assert.throws(() => new ChromeCommands({
    commands: {
      bad: {
        // @ts-expect-error -- a description must be a string; the schema refuses it at run time
        description: 5
      }
    }
  }));
});
