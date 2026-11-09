import { ActivationKind } from "./kinds.ts";
import { STARTUP_ARGUMENT } from "./registration.ts";
import { roInitialize } from "@microsoft/dynwinrt";
import { call } from "#src/renderer/host/reflect.js";
import { hasPackageIdentity } from "#src/window/package-identity.js";
import { AppInstance } from "#winui/microsoft/windows/app-lifecycle/AppInstance";
import { ExtendedActivationKind } from "#winui/microsoft/windows/app-lifecycle/ExtendedActivationKind";
import { ProtocolActivatedEventArgs } from "#winui/windows/application-model/activation/ProtocolActivatedEventArgs";
import { z } from "zod";

// `ExtendedActivationKind` of the Windows App SDK to the one kind of this
// package it stands for; every other value is not an activation this package
// reports.
const kindsByExtendedKind = new Map<number, typeof ActivationKind.protocol | typeof ActivationKind.startup>([
  [ExtendedActivationKind.Protocol, ActivationKind.protocol],
  [ExtendedActivationKind.StartupTask, ActivationKind.startup]
]);

// The one field of ProtocolActivatedEventArgs this package reads: its Uri's
// original text, as the caller wrote it.
const protocolDataSchema = z.object({ uri: z.object({ rawUri: z.string() }) });

/** How Windows started this packaged process. */
export interface PackagedActivation {
  /** `protocol` or `startup`: the only two the Windows App SDK reports that this package turns into an event. */
  readonly kind: typeof ActivationKind.protocol | typeof ActivationKind.startup;

  /** The address, for a `protocol` activation. */
  readonly uri?: string;
}

/** What `AppInstance.getActivatedEventArgs()` answers: its `kind` and `data`. */
export interface ActivationArgumentsSource {
  readonly kind: number;
  readonly data: unknown;
}

// What `projectAs` calls on the class: `data` is a bare WinRT object, whatever the activation kind.
const PROJECT_DATA = "_fromNativeBorrowed";

function readOwnArguments() {
  if (!hasPackageIdentity()) {
    return undefined;
  }

  roInitialize();
  const { kind, data } = AppInstance.getCurrent().getActivatedEventArgs();
  const isProtocol = kind === ExtendedActivationKind.Protocol && data !== null;
  return {
    kind,
    data: isProtocol ? call(ProtocolActivatedEventArgs, PROJECT_DATA, data) : data
  };
}

/**
 * Reads how Windows started this packaged process from the Windows App SDK's
 * activation arguments: the address of a protocol activation, or that a
 * startup task started it (a startup task passes no command line argument).
 * Anything else, a `data` that is not a protocol payload and any failure give
 * `undefined`; it never throws.
 *
 * @param options - Where the activation arguments come from; the process's own
 *   `AppInstance` when omitted. It is not called without a package identity.
 * @returns The activation, or `undefined` outside a package, for a plain
 *   launch and when it cannot be read.
 */
export function packagedActivation({ read = readOwnArguments }: {
  read?: () => ActivationArgumentsSource | undefined;
} = {}) {
  try {
    const source = read();
    const kind = source === undefined ? undefined : kindsByExtendedKind.get(source.kind);
    const isStartup = kind === ActivationKind.startup;
    if (isStartup) {
      return { kind } satisfies PackagedActivation;
    }

    const isProtocol = source !== undefined && kind === ActivationKind.protocol;
    const parsed = isProtocol ? protocolDataSchema.safeParse(source.data) : undefined;
    const hasUri = parsed?.success === true;
    return hasUri
      ? {
        kind: ActivationKind.protocol,
        uri: parsed.data.uri.rawUri
      } satisfies PackagedActivation
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Adds what the packaged start carried to the command line the first copy
 * received, so one classifier reads both: a startup task becomes the marker
 * argument, and an address is appended unless the command line already holds
 * it (a manifest `Parameters="&quot;%1&quot;"` puts it there), so the
 * command line's own address always wins.
 *
 * @param options - The command line and the packaged activation.
 * @returns The command line to classify.
 */
export function withPackagedActivation({ values, packaged }: {
  values: readonly string[];
  packaged: PackagedActivation | undefined;
}) {
  const isPackaged = packaged !== undefined;
  if (!isPackaged) {
    return values;
  }

  const isStartup = packaged.kind === ActivationKind.startup;
  if (isStartup) {
    return [...values, STARTUP_ARGUMENT];
  }

  const isNew = packaged.uri !== undefined && !values.includes(packaged.uri);
  return isNew ? [...values, packaged.uri] : values;
}
