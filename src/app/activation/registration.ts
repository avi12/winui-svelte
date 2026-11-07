import { commandLineOf } from "./command.ts";
import type { ProgramCommand } from "./command.ts";
import type { RegistryBackend } from "./registry.ts";
import { normalizeExtension, normalizeScheme, requireIdentifier } from "./scheme.ts";
import { DomErrorName, domException } from "#src/web-apis/dom-exception.js";

// What the package writes under HKEY_CURRENT_USER so that Windows starts the
// app: the protocol and file type classes, and the startup entry. Every key
// it creates carries OWNER_VALUE, and it overwrites or deletes only keys that
// carry it, so it never touches another program's registration.

/** The argument the startup entry adds; an activation that has it is a `startup` one. */
export const STARTUP_ARGUMENT = "--winui-svelte-startup";

const CLASSES = "Software\\Classes";
const RUN_KEY = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
/** The value every key this package creates carries. */
export const OWNER_VALUE = "WinuiSvelte";
/** What `OWNER_VALUE` holds. */
export const OWNED = "1";
const OPEN_COMMAND = "shell\\open\\command";
const OPEN_WITH_PROGIDS = "OpenWithProgids";
const URL_PROTOCOL_VALUE = "URL Protocol";
const DEFAULT_VALUE = "";

/** What every registration takes. */
export interface RegistrationContext {
  /** Stands in for the registry; the tests give one. */
  readonly registry: RegistryBackend;

  /** What Windows starts; this process's own Node and entry script by default. */
  readonly command: ProgramCommand;
}

/** The startup entry as it stands. */
export interface LaunchAtLoginState {
  /** Whether the entry exists. The user can still switch it off in Settings, Apps, Startup; that switch is not read. */
  readonly isEnabled: boolean;

  /** The command line Windows runs at sign-in, or `undefined` when there is no entry. */
  readonly commandLine: string | undefined;
}

/**
 * Whether this package created a key: it carries the marker value.
 *
 * @param options - The registry and the key.
 * @returns True when the key has the marker.
 */
export function isOwned({ registry, key }: {
  registry: RegistryBackend;
  key: string;
}) {
  return registry.readString({
    key,
    name: OWNER_VALUE
  }) === OWNED;
}

function requireFree({ registry, key, label }: {
  registry: RegistryBackend;
  key: string;
  label: string;
}) {
  const isTaken = registry.hasKey(key) && !isOwned({
    registry,
    key
  });
  if (isTaken) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: `${label} is already registered by another program`
    });
  }
}

function writeClass({ registry, key, description, commandLine }: {
  registry: RegistryBackend;
  key: string;
  description: string;
  commandLine: string;
}) {
  registry.setString({
    key,
    name: DEFAULT_VALUE,
    value: description
  });
  registry.setString({
    key,
    name: OWNER_VALUE,
    value: OWNED
  });
  registry.setString({
    key: `${key}\\${OPEN_COMMAND}`,
    name: DEFAULT_VALUE,
    value: commandLine
  });
}

/**
 * Makes `scheme:` links start the app: writes the class under
 * `HKEY_CURRENT_USER\Software\Classes\<scheme>` with a command that ends in
 * the link as one quoted argument.
 *
 * @param options - The scheme, a name for it and the registry and command to use.
 * @throws {DOMException} `SecurityError` for a malformed or reserved scheme;
 *   `InvalidStateError` when another program already owns that class.
 */
export function addProtocol({ scheme, displayName, registry, command }: RegistrationContext & {
  scheme: string;
  displayName?: string;
}) {
  const name = normalizeScheme(scheme);
  const key = `${CLASSES}\\${name}`;
  requireFree({
    registry,
    key,
    label: `the scheme '${name}'`
  });
  writeClass({
    registry,
    key,
    description: `URL:${displayName ?? name}`,
    commandLine: commandLineOf({
      command,
      hasPlaceholder: true
    })
  });
  registry.setString({
    key,
    name: URL_PROTOCOL_VALUE,
    value: ""
  });
}

/**
 * Takes the registration of a scheme away, if this package made it.
 *
 * @param options - The scheme and the registry.
 * @returns True when a registration was removed; false when there was none or
 *   another program owns the class, which is left alone.
 * @throws {DOMException} `SecurityError` for a malformed or reserved scheme.
 */
export function removeProtocol({ scheme, registry }: Pick<RegistrationContext, "registry"> & { scheme: string }) {
  const key = `${CLASSES}\\${normalizeScheme(scheme)}`;
  const isRemovable = isOwned({
    registry,
    key
  });
  if (!isRemovable) {
    return false;
  }

  registry.deleteTree(key);
  return true;
}

/**
 * The ProgID of a file type this package registers for an app.
 *
 * @param options - The app's identifier and the extension with its dot.
 * @returns The identifier followed by the extension.
 */
function progIdOf({ id, extension }: {
  id: string;
  extension: string;
}) {
  return `${requireIdentifier(id)}${normalizeExtension(extension)}`;
}

/**
 * Lists the app among the programs that can open files with these
 * extensions: a ProgID class with the open command, and its name under each
 * extension's `OpenWithProgids`. It does not make the app the default;
 * Windows protects that choice for the user.
 *
 * @param options - The app's identifier, the extensions with their dots, a description and the registry and command.
 * @throws {DOMException} `SecurityError` for a malformed or executable extension;
 *   `InvalidStateError` when another program owns the ProgID.
 * @throws {TypeError} For an `id` that is not an identifier.
 */
export function addFileTypes({ id, extensions, description, registry, command }: RegistrationContext & {
  id: string;
  extensions: readonly string[];
  description?: string;
}) {
  const types = extensions.map(extension => ({
    extension: normalizeExtension(extension),
    progId: progIdOf({
      id,
      extension
    })
  }));
  for (const { progId } of types) {
    requireFree({
      registry,
      key: `${CLASSES}\\${progId}`,
      label: `the file type '${progId}'`
    });
  }

  const commandLine = commandLineOf({
    command,
    hasPlaceholder: true
  });
  for (const { extension, progId } of types) {
    writeClass({
      registry,
      key: `${CLASSES}\\${progId}`,
      description: description ?? `${extension} file`,
      commandLine
    });
    registry.setString({
      key: `${CLASSES}\\${extension}\\${OPEN_WITH_PROGIDS}`,
      name: progId,
      value: ""
    });
  }
}

/**
 * Takes the file types away that `registerFileTypes` made, and the empty keys
 * they leave under the extensions.
 *
 * @param options - The app's identifier, the extensions and the registry.
 * @returns The extensions whose registration was removed.
 */
export function removeFileTypes({ id, extensions, registry }: Pick<RegistrationContext, "registry"> & {
  id: string;
  extensions: readonly string[];
}) {
  const removed: string[] = [];
  for (const extension of extensions) {
    const lower = normalizeExtension(extension);
    const progId = progIdOf({
      id,
      extension
    });
    const key = `${CLASSES}\\${progId}`;
    const isRemovable = isOwned({
      registry,
      key
    });
    if (!isRemovable) {
      continue;
    }

    registry.deleteTree(key);
    const withProgIds = `${CLASSES}\\${lower}\\${OPEN_WITH_PROGIDS}`;
    registry.deleteValue({
      key: withProgIds,
      name: progId
    });
    registry.deleteKeyIfEmpty(withProgIds);
    registry.deleteKeyIfEmpty(`${CLASSES}\\${lower}`);
    removed.push(lower);
  }

  return removed;
}

/**
 * Adds the app's entry to the per-user Run key; Windows lists it under
 * Settings, Apps, Startup. The command adds `STARTUP_ARGUMENT` so that the app
 * can tell a start at sign-in from a start by hand.
 *
 * @param options - The entry's name, extra arguments and the registry and command.
 * @throws {TypeError} For an `id` that is not an identifier.
 */
export function enableLaunchAtLogin({ id, arguments: extra = [], registry, command }: RegistrationContext & {
  id: string;
  arguments?: readonly string[];
}) {
  registry.setString({
    key: RUN_KEY,
    name: requireIdentifier(id),
    value: commandLineOf({
      command,
      extra: [STARTUP_ARGUMENT, ...extra]
    })
  });
}

/**
 * Removes the app's entry from the per-user Run key.
 *
 * @param options - The entry's name and the registry.
 * @throws {TypeError} For an `id` that is not an identifier.
 */
export function disableLaunchAtLogin({ id, registry }: Pick<RegistrationContext, "registry"> & { id: string }) {
  registry.deleteValue({
    key: RUN_KEY,
    name: requireIdentifier(id)
  });
}

/**
 * Reads the startup entry back.
 *
 * @param options - The entry's name and the registry.
 * @returns Whether it exists and what it runs.
 * @throws {TypeError} For an `id` that is not an identifier.
 */
export function readLaunchAtLogin({ id, registry }: Pick<RegistrationContext, "registry"> & { id: string }) {
  const commandLine = registry.readString({
    key: RUN_KEY,
    name: requireIdentifier(id)
  });
  return {
    isEnabled: commandLine !== undefined,
    commandLine
  } satisfies LaunchAtLoginState;
}
