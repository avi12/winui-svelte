import { encodeNativeMessage, NativeMessageDecoder, NativeMessageError } from "./native-message.ts";
import { Port } from "./port.ts";
import type { PortEnd } from "./port.ts";
import type { RegistryBackend } from "#src/app/activation/registry.js";
import type { Json } from "#src/messaging/json.js";
import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import { z } from "zod";

/**
 * Where a host is registered, below `HKEY_CURRENT_USER`: one key per host
 * name, whose default value is the path of the host's manifest, as Chrome
 * keeps it under `Software\Google\Chrome\NativeMessagingHosts`.
 */
export const NATIVE_HOST_REGISTRY_KEY = "Software\\winui-svelte\\NativeMessagingHosts";

const HOST_NAME_PATTERN = /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/u;

const hostManifestSchema = z.object({
  name: z.string(),
  path: z.string().min(1),
  type: z.literal("stdio"),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the manifest's own key
  allowed_origins: z.array(z.string()).optional()
});

/** What a host's manifest file says, as Chrome's native messaging manifest. */
export type NativeHostManifest = z.infer<typeof hostManifestSchema>;

/** The app's origin as a host sees it in its first argument and in `allowed_origins`. */
function originOf(id: string) {
  return `winui-svelte://${id}/`;
}

/** A started host: stdin and stdout are pipes. */
export type HostProcess = ChildProcessByStdio<Writable, Readable, null>;

/** How a host is started; a test starts its own script. */
export type SpawnHost = (options: {
  path: string;
  arguments: readonly string[];
}) => HostProcess;

function spawnExecutable({ path: executable, arguments: hostArguments }: Parameters<SpawnHost>[0]) {
  return spawn(executable, [...hostArguments], {
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true
  });
}

/** What the calls that talk to a host take besides the host's name. */
export interface NativeHostSetup {
  /** The app's runtime id, passed to the host as its origin. */
  readonly id: string;

  /** Where hosts are registered; the user's registry by default. */
  readonly registry?: RegistryBackend | undefined;

  /** Finds the host's executable from its name; reads the registry and manifest by default. */
  readonly resolveHost?: ((application: string) => Promise<string>) | undefined;

  /** Starts the host; `child_process.spawn` by default. */
  readonly spawnHost?: SpawnHost | undefined;
}

async function registryOrWindows(registry: RegistryBackend | undefined) {
  const isGiven = registry !== undefined;
  if (isGiven) {
    return registry;
  }

  const { createWindowsRegistry } = await import("#src/app/activation/native.js");
  return createWindowsRegistry();
}

/**
 * Finds a registered host's executable: the registry names the manifest, the
 * manifest names the executable (a relative path is taken from the
 * manifest's folder) and the origins that may start it.
 *
 * @param options - The host's name, the app's id and where to look.
 * @returns The executable's absolute path.
 * @throws {Error} When the name is not a valid host name, the host is not
 *   registered, its manifest is wrong, or it does not allow this app.
 */
async function resolveRegisteredHost({ application, id, registry }: {
  application: string;
  id: string;
  registry?: RegistryBackend | undefined;
}) {
  const isValidName = HOST_NAME_PATTERN.test(application);
  if (!isValidName) {
    throw new Error(`"${application}" is not a valid native messaging host name`);
  }

  const backend = await registryOrWindows(registry);
  const manifestPath = backend.readString({
    key: `${NATIVE_HOST_REGISTRY_KEY}\\${application}`,
    name: ""
  });
  const isRegistered = manifestPath !== undefined;
  if (!isRegistered) {
    throw new Error(`Specified native messaging host not found: ${application}`);
  }

  const manifest = hostManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const isNameWrong = manifest.name !== application;
  if (isNameWrong) {
    throw new Error(`the manifest of ${application} names "${manifest.name}"`);
  }

  const isOriginDenied = manifest.allowed_origins !== undefined && !manifest.allowed_origins.includes(originOf(id));
  if (isOriginDenied) {
    throw new Error(`Access to the specified native messaging host is forbidden: ${application}`);
  }

  return path.resolve(path.dirname(manifestPath), manifest.path);
}

/**
 * `chrome.runtime.connectNative`: starts the registered host and returns a
 * port over its stdio in the native messaging protocol (a four byte length,
 * then JSON, each way). The port ends when the host exits or fails (its
 * `error` says which); `disconnect()` stops the host. Messages posted before
 * the host has started are held and sent in order.
 *
 * @param options - The host's name and the app's setup.
 * @returns The port.
 */
export function connectNativeHost({ application, ...setup }: NativeHostSetup & { application: string }) {
  const port = new Port({ name: application });
  const queued: Json[] = [];
  let child: HostProcess | undefined;

  const end: PortEnd = {
    send(message) {
      const current = child;
      const isStarting = current === undefined;
      if (isStarting) {
        queued.push(message);
        return;
      }

      current.stdin.write(encodeNativeMessage(message));
    },
    close() {
      child?.kill();
    }
  };
  port.attach(end);

  function start(executable: string) {
    const host = (setup.spawnHost ?? spawnExecutable)({
      path: executable,
      arguments: [originOf(setup.id)]
    });
    child = host;
    const decoder = new NativeMessageDecoder();
    host.stdin.on("error", () => {});
    host.on("error", error => port.detach({
      end,
      error
    }));
    host.on("close", () => port.detach({ end }));
    host.stdout.on("data", (chunk: Buffer) => {
      try {
        for (const message of decoder.push(chunk)) {
          port.receive(message);
        }
      } catch (error) {
        host.kill();
        port.detach({
          end,
          error: error instanceof NativeMessageError ? error : new NativeMessageError(String(error))
        });
      }
    });
    for (const message of queued.splice(0)) {
      end.send(message);
    }
  }

  const resolveHost = setup.resolveHost
    ?? ((name: string) => resolveRegisteredHost({
      application: name,
      id: setup.id,
      registry: setup.registry
    }));
  resolveHost(application).then(start).catch((error: unknown) => port.detach({
    end,
    error: error instanceof Error ? error : new Error(String(error))
  }));
  return port;
}

/**
 * `chrome.runtime.sendNativeMessage`: starts the host, sends one message and
 * resolves with its first reply, then stops it.
 *
 * @param options - The host's name, the message and the app's setup.
 * @returns The host's reply.
 * @throws {Error} When the host cannot be found or started, or exits first.
 */
export function sendNativeHostMessage({ message, ...options }: NativeHostSetup & {
  application: string;
  message: Json;
}) {
  const port = connectNativeHost(options);
  return new Promise<Json>((resolve, reject) => {
    port.onMessage.addListener(reply => {
      resolve(reply);
      port.disconnect();
    });
    port.onDisconnect.addListener(() => reject(port.error ?? new Error("the native messaging host exited without a reply")));
    port.postMessage(message);
  });
}
