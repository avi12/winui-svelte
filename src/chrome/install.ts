import type { ChromeAction } from "./action/chrome-action.ts";
import type { ChromeCommands } from "./commands/chrome-commands.ts";
import type { ChromeContextMenus } from "./context-menus/chrome-context-menus.ts";
import type { ChromeI18n } from "./i18n/chrome-i18n.ts";
import type { ChromeNotifications } from "./notifications/chrome-notifications.ts";
import type { ChromePermissions } from "./permissions/chrome-permissions.ts";
import type { Runtime } from "./runtime/runtime.ts";
import type { ChromeStorage } from "./storage/chrome-storage.ts";
import type { createChromeSystem } from "./system/create-chrome-system.ts";
import type { ChromeWindows } from "./windows/chrome-windows.ts";
import type * as schedule from "#src/app/schedule/index.js";
import type { Downloads } from "#src/downloads/chrome-downloads.js";

/** `chrome.alarms`: the calls and events of `winui-svelte/app/schedule`, so `import * as alarms` is one. */
export type ChromeAlarms = Pick<typeof schedule, "clear" | "clearAll" | "create" | "get" | "getAll" | "onAlarm">;

/** `chrome.system`: what `createChromeSystem` returns (`cpu`, `memory`, `storage` and `display`). */
export type ChromeSystem = ReturnType<typeof createChromeSystem>;

/**
 * The namespaces of `globalThis.chrome`. Each is optional: an app gives the
 * ones it uses, and the global holds exactly those. More namespaces are
 * added here as they are mirrored.
 */
export interface ChromeGlobal {
  readonly storage?: ChromeStorage;
  readonly runtime?: Runtime;
  readonly permissions?: ChromePermissions;
  readonly contextMenus?: ChromeContextMenus;
  readonly commands?: ChromeCommands;
  readonly action?: ChromeAction;
  readonly notifications?: ChromeNotifications;
  readonly i18n?: ChromeI18n;
  readonly alarms?: ChromeAlarms;
  readonly downloads?: Downloads;
  readonly system?: ChromeSystem;
  readonly windows?: ChromeWindows;
}

const globalScope: Record<string, unknown> = globalThis;

/**
 * Defines `globalThis.chrome` with the namespace instances the app passes, so
 * code written for a Chrome extension (`chrome.storage.local.get(...)`) runs
 * unchanged. Only the namespaces given are present, so the bundle holds only
 * what the app imported to make them. A `chrome` object that is already there
 * keeps its other members.
 *
 * @param namespaces - The instances, for example `{ storage: new ChromeStorage(), i18n }`.
 * @returns The function that puts the previous `globalThis.chrome` back.
 */
export function installChromeApis(namespaces: ChromeGlobal) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const existing: unknown = previous?.value;
  const isObject = typeof existing === "object" && existing !== null;
  const base = isObject ? existing : {};
  Object.defineProperty(globalThis, "chrome", {
    value: {
      ...base,
      ...namespaces
    },
    configurable: true,
    writable: true,
    enumerable: false
  });
  return () => {
    const isPrevious = previous !== undefined;
    if (isPrevious) {
      Object.defineProperty(globalThis, "chrome", previous);
      return;
    }

    delete globalScope["chrome"];
  };
}
