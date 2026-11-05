import { createNativeMenu, NativeMenuEntryKind } from "./native.ts";
import type { NativeMenu, NativeMenuEntry } from "./native.ts";
import { removeTrayIconsAtExit } from "#src/tray/exit-hook.js";
import { createTrayNative } from "#src/tray/native.js";
import type { TrayNative } from "#src/tray/native.js";
import { createTrayIconWith } from "#src/tray/tray-core.js";
import type { TrayIconOptions, TrayScheduler } from "#src/tray/tray-core.js";

const FIRST_COMMAND_ID = 1;

/** A command in the menu: its text and what choosing it does. */
export interface StandaloneMenuCommand {
  readonly kind: typeof NativeMenuEntryKind.COMMAND;
  readonly label: string;

  /** Runs when the user chooses the command. */
  readonly onselect: () => void;

  /** Default true; false shows the command grayed and unchoosable. */
  readonly isEnabled?: boolean;
}

/** A line between groups of commands. */
export interface StandaloneMenuSeparator {
  readonly kind: typeof NativeMenuEntryKind.SEPARATOR;
}

/** A line of the menu a right click opens. */
export type StandaloneMenuItem = StandaloneMenuCommand | StandaloneMenuSeparator;

/** What `createStandaloneTray` takes beyond the icon's own options. */
export interface StandaloneTrayOptions extends Omit<TrayIconOptions, "oncontextmenu"> {
  /** The commands of the menu a right click opens; none means a right click does nothing. */
  readonly menu?: readonly StandaloneMenuItem[] | undefined;
}

/** What `createStandaloneTray` takes beyond the options: a test's stand-ins. */
export interface StandaloneTraySeams {
  /** The Win32 calls of the icon; the real ones by default. */
  readonly native?: TrayNative;

  /** The popup menu; Windows' own by default. */
  readonly nativeMenu?: NativeMenu;

  /** The timer that polls the pointer; Node's `setInterval` by default. */
  readonly schedule?: TrayScheduler;
}

function scheduleWithNode({ milliseconds, onTick }: Parameters<TrayScheduler>[0]) {
  const timer = setInterval(onTick, milliseconds);
  return () => clearInterval(timer);
}

function entriesOf(items: readonly StandaloneMenuItem[]) {
  let nextId = FIRST_COMMAND_ID;
  const handlers = new Map<number, () => void>();
  const entries = items.map(item => {
    const isSeparator = item.kind === NativeMenuEntryKind.SEPARATOR;
    if (isSeparator) {
      return item;
    }

    const id = nextId++;
    handlers.set(id, item.onselect);
    const entry: NativeMenuEntry = {
      kind: NativeMenuEntryKind.COMMAND,
      id,
      label: item.label,
      isEnabled: item.isEnabled ?? true
    };
    return entry;
  });
  return {
    entries,
    handlers
  };
}

/**
 * A notification-area icon and its menu in a process with no window, no app
 * and no WinUI: the process can be plain Node, kept alive by the icon, and
 * starts or signals the full app from a click (see `activateOrLaunch` in
 * `winui-svelte/app`). The menu is Windows' own popup menu, made on a right
 * click and gone when it closes, so an idle tray holds nothing for it. Call
 * it from the thread that keeps running; the icon is removed on `remove`
 * and at process exit.
 */
export function createStandaloneTray(options: StandaloneTrayOptions & StandaloneTraySeams) {
  const native = options.native ?? createTrayNative();
  let menu = options.nativeMenu;

  function showMenu({ x, y }: {
    x: number;
    y: number;
  }) {
    const { entries, handlers } = entriesOf(options.menu ?? []);
    menu ??= createNativeMenu();
    const owner = native.createOwnerWindow();
    try {
      native.focusWindow(owner);
      const chosen = menu.choose({
        owner,
        point: {
          x,
          y
        },
        entries
      });
      handlers.get(chosen)?.();
    } finally {
      native.destroyWindow(owner);
    }
  }

  const hasMenu = (options.menu ?? []).length > 0;
  removeTrayIconsAtExit();
  return createTrayIconWith({
    ...options,
    native,
    schedule: options.schedule ?? scheduleWithNode,
    now: Date.now,
    oncontextmenu: hasMenu ? event => showMenu(event) : undefined
  });
}
