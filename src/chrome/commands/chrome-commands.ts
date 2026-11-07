import { commandsSchema, EXECUTE_ACTION_COMMANDS } from "./command-types.ts";
import type { Command, CommandDefinition, CommandFailure } from "./command-types.ts";
import { parseShortcut } from "./shortcut.ts";
import type { ParsedShortcut } from "./shortcut.ts";
import { registerHotkey } from "#src/app/hotkeys/index.js";
import type { Hotkey, HotkeyOptions } from "#src/app/hotkeys/index.js";
import { ChromeEvent } from "#src/downloads/chrome-event.js";

/** What `ChromeCommands` takes. */
export interface ChromeCommandsOptions {
  /** The manifest's `commands` key: names, descriptions and `suggested_key`. */
  readonly commands: Readonly<Record<string, CommandDefinition>>;

  /**
   * Run for `_execute_action` (and its older names) instead of `onCommand`, as
   * Chrome treats those as a click on the action; pass the action's click.
   */
  readonly onExecuteAction?: (() => void) | undefined;

  /** Registers a hotkey; `registerHotkey` of `winui-svelte/app/hotkeys` by default, a test gives a fake. */
  readonly register?: ((options: HotkeyOptions) => Hotkey) | undefined;
}

interface Entry {
  readonly name: string;
  readonly description: string;
  readonly shortcut: ParsedShortcut | null;
}

function suggestedKeyOf(definition: CommandDefinition) {
  const key = definition.suggested_key;
  const isPlain = key === undefined || typeof key === "string";
  if (isPlain) {
    return key;
  }

  return key.windows ?? key.default;
}

function entryOf({ name, definition }: {
  name: string;
  definition: CommandDefinition;
}) {
  const suggested = suggestedKeyOf(definition);
  const hasShortcut = suggested !== undefined && suggested !== "";
  let shortcut: ParsedShortcut | null = null;
  if (hasShortcut) {
    try {
      shortcut = parseShortcut(suggested);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`The command "${name}" has a bad suggested_key: ${reason}`, { cause: error });
    }
  }

  return {
    name,
    description: definition.description ?? "",
    shortcut
  };
}

/**
 * `chrome.commands` for a Windows app: the commands of a manifest's `commands`
 * key, each with a `suggested_key`, as global hotkeys. Chrome keeps most
 * shortcuts inside the browser; a native app has no such scope, so every
 * shortcut with a key is system-wide (the `global` flag is accepted and
 * changes nothing). Of the per-platform keys, `windows` then `default` is
 * used; `Command` and `MacCtrl` mean Ctrl. Nothing is registered until
 * `start()`, which belongs on the UI thread.
 */
export class ChromeCommands {
  /** Fires with the command's name each time its shortcut is pressed. */
  readonly onCommand = new ChromeEvent<(command: string) => void>();
  private readonly entries: readonly Entry[];
  private readonly onExecuteAction: (() => void) | undefined;
  private readonly register: (options: HotkeyOptions) => Hotkey;
  private readonly hotkeys = new Map<string, Hotkey>();

  /**
   * Reads the commands and checks every shortcut; registers nothing.
   *
   * @param options - The commands and, for a test, the hotkey registrar.
   * @throws Error When the commands are not a manifest's `commands` or a `suggested_key` is not a shortcut.
   */
  constructor(options: ChromeCommandsOptions) {
    const commands = commandsSchema.parse(options.commands);
    this.entries = Object.entries(commands).map(([name, definition]) => entryOf({
      name,
      definition
    }));
    this.onExecuteAction = options.onExecuteAction;
    this.register = options.register ?? registerHotkey;
  }

  /**
   * Registers the shortcuts that are not yet. A shortcut another app owns, or
   * Windows reserves, is left unassigned (its `getAll` shortcut is empty), as
   * Chrome does with a clash; none throws.
   *
   * @returns The commands whose shortcut was refused.
   */
  start() {
    const failures: CommandFailure[] = [];
    for (const entry of this.entries) {
      const isPending = entry.shortcut !== null && !this.hotkeys.has(entry.name);
      if (isPending) {
        const failure = this.tryRegister(entry);
        const isRefused = failure !== null;
        if (isRefused) {
          failures.push(failure);
        }
      }
    }

    return failures;
  }

  /** Gives every shortcut back; `start()` registers them again. */
  stop() {
    for (const hotkey of this.hotkeys.values()) {
      hotkey.unregister();
    }

    this.hotkeys.clear();
  }

  /**
   * The commands, each with the shortcut it holds now.
   *
   * @returns One entry per command, in the manifest's order.
   */
  getAll() {
    return Promise.resolve(
      this.entries.map(entry => ({
        name: entry.name,
        description: entry.description,
        shortcut: this.hotkeys.has(entry.name) ? entry.shortcut?.display ?? "" : ""
      } satisfies Command))
    );
  }

  private tryRegister(entry: Entry) {
    const { shortcut } = entry;
    const hasShortcut = shortcut !== null;
    if (!hasShortcut) {
      return null;
    }

    try {
      const hotkey = this.register({
        keys: shortcut.chord,
        onpressed: () => this.press(entry.name)
      });
      this.hotkeys.set(entry.name, hotkey);
      return null;
    } catch (error) {
      return {
        name: entry.name,
        error: error instanceof Error ? error : new Error(String(error))
      } satisfies CommandFailure;
    }
  }

  private press(name: string) {
    const isExecuteAction = EXECUTE_ACTION_COMMANDS.has(name) && this.onExecuteAction !== undefined;
    if (isExecuteAction) {
      this.onExecuteAction?.();
      return;
    }

    this.onCommand.dispatch(name);
  }
}
