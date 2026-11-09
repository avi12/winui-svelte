import { ALL_BROWSERS, BROWSER_KEYS } from "./browsers.ts";
import type { NativeMessagingBrowser } from "./browsers.ts";
import { createWindowsRegistry } from "#src/app/activation/native.js";
import type { RegistryBackend } from "#src/app/activation/registry.js";
import path from "node:path";

export { NativeMessagingBrowser } from "./browsers.ts";

const HOSTS_FOLDER = "NativeMessagingHosts";
const HOST_NAME_PATTERN = /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/u;
const DEFAULT_VALUE = "";
const ROOT_KEY = "Software";

interface HostOptions {
  /** The host name the extension passes to `connectNative`: lowercase letters, digits, `_` and `.` between them. */
  readonly name: string;

  /** The browsers to register for; all four by default. */
  readonly browsers?: readonly NativeMessagingBrowser[];

  /** The registry, for a test; the current user's hive by default. */
  readonly registry?: RegistryBackend;
}

function hostKeyOf({ browser, name }: {
  browser: NativeMessagingBrowser;
  name: string;
}) {
  return `${BROWSER_KEYS[browser]}\\${HOSTS_FOLDER}\\${name}`;
}

function requireHostName(name: string) {
  const isValid = HOST_NAME_PATTERN.test(name);
  if (!isValid) {
    throw new TypeError(`'${name}' is not a native messaging host name: lowercase letters, digits, _ and . between them`);
  }

  return name;
}

/**
 * Tells the browsers where the manifest of a native messaging host is, in the
 * current user's registry (`HKEY_CURRENT_USER\Software\<browser>\NativeMessagingHosts\<name>`,
 * the default value being the manifest's path), so an extension's
 * `connectNative(name)` starts the host. It writes the registry only; the
 * JSON manifest (`name`, `description`, `path`, `type`, `allowed_origins`) is
 * the caller's file. Calling it again rewrites the same values.
 *
 * Under a package identity the registry write is virtualized unless the
 * manifest declares `desktop6:RegistryWriteVirtualization` as disabled and
 * the `unvirtualizedResources` capability; browsers read the real registry,
 * so without both they never see the entry.
 *
 * @param options - The host name, the absolute path of its manifest, and
 *   optionally the browsers and the registry.
 * @throws {TypeError} For a name that is not a host name, or a path that is not absolute.
 */
export function registerNativeMessagingHost({
  name,
  manifestPath,
  browsers = ALL_BROWSERS,
  registry = createWindowsRegistry()
}: HostOptions & {
  /** The absolute path of the JSON manifest, which the caller wrote. */
  readonly manifestPath: string;
}) {
  requireHostName(name);
  const isAbsolute = path.win32.isAbsolute(manifestPath);
  if (!isAbsolute) {
    throw new TypeError(`'${manifestPath}' is not an absolute path`);
  }

  for (const browser of browsers) {
    registry.setString({
      key: hostKeyOf({
        browser,
        name
      }),
      name: DEFAULT_VALUE,
      value: manifestPath
    });
  }
}

function pruneEmptyParents({ registry, key }: {
  registry: RegistryBackend;
  key: string;
}) {
  let parent = key;
  while (parent !== ROOT_KEY) {
    const isDeleted = registry.deleteKeyIfEmpty(parent);
    if (!isDeleted) {
      return;
    }

    parent = parent.slice(0, parent.lastIndexOf("\\"));
  }
}

/**
 * Takes away what `registerNativeMessagingHost` wrote for the name, and only
 * that: the host's own key goes, then each parent that is left empty, up to
 * `Software`; a browser's key that holds anything else stays.
 *
 * @param options - The same host name, and optionally the browsers and the registry.
 */
export function unregisterNativeMessagingHost({
  name,
  browsers = ALL_BROWSERS,
  registry = createWindowsRegistry()
}: HostOptions) {
  requireHostName(name);
  for (const browser of browsers) {
    const key = hostKeyOf({
      browser,
      name
    });
    registry.deleteTree(key);
    pruneEmptyParents({
      registry,
      key: key.slice(0, key.lastIndexOf("\\"))
    });
  }
}
