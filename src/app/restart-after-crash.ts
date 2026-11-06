import { joinCommandLine, launchCommand } from "./launch-command.ts";
import { createRestartRegistrar } from "./native.ts";

const NO_CRASH = 1;
const NO_HANG = 2;
const NO_PATCH = 4;
const NO_REBOOT = 8;
const S_OK = 0;
const HEX_RADIX = 16;

/** The events after which Windows starts the app again (`RegisterApplicationRestart`). */
export const RestartCondition = {
  crash: "crash",
  hang: "hang",
  update: "update",
  reboot: "reboot"
} as const;

/** One event after which Windows starts the app again. */
export type RestartCondition = typeof RestartCondition[keyof typeof RestartCondition];

const ALL_RESTART_CONDITIONS = Object.values(RestartCondition);

const EXCLUSION_FLAGS = new Map<RestartCondition, number>([
  [RestartCondition.crash, NO_CRASH],
  [RestartCondition.hang, NO_HANG],
  [RestartCondition.update, NO_PATCH],
  [RestartCondition.reboot, NO_REBOOT]
]);

/** What `restartAfterCrash` takes. */
export interface RestartAfterCrashOptions {
  /** The command line arguments the restarted copy gets (after the entry script). */
  readonly arguments: readonly string[];

  /** The entry script of the restarted copy, when it is not `process.argv[1]`. */
  readonly entryScript?: string | undefined;

  /** The events that restart the app (all of them by default). */
  readonly conditions?: readonly RestartCondition[];
}

/** What `restartAfterCrash` asks of Windows; a test stands in for it. */
export type RestartRegistrar = (options: {
  commandLine: string;
  flags: number;
}) => number;

/**
 * The `RegisterApplicationRestart` flags that leave out every condition not
 * asked for (the API names what to exclude).
 *
 * @param conditions - The events that restart the app.
 * @returns The flags.
 */
export function exclusionFlags(conditions: readonly RestartCondition[]) {
  let flags = 0;
  for (const [condition, flag] of EXCLUSION_FLAGS) {
    const isExcluded = !conditions.includes(condition);
    if (isExcluded) {
      flags |= flag;
    }
  }

  return flags;
}

/**
 * Registers the app with `register` for a restart: the same as
 * `restartAfterCrash` over any registrar.
 *
 * @param options - The arguments, the conditions and the registrar.
 * @throws {Error} When Windows refuses the registration.
 */
export function registerRestart({ register, ...options }: RestartAfterCrashOptions & {
  register: RestartRegistrar;
}) {
  const command = launchCommand({
    appArguments: options.arguments,
    entryScript: options.entryScript
  });
  const result = register({
    commandLine: joinCommandLine(command.arguments),
    flags: exclusionFlags(options.conditions ?? ALL_RESTART_CONDITIONS)
  });
  const isRefused = result !== S_OK;
  if (isRefused) {
    throw new Error(`Windows refused the restart registration (HRESULT 0x${(result >>> 0).toString(HEX_RADIX)}); the command line may be too long`);
  }
}

/**
 * Asks Windows to start the app again after it crashes, stops responding, or
 * is closed to install an update or by a reboot for one
 * (`RegisterApplicationRestart`). Windows starts the same Node with the same
 * entry script and `arguments`. No callback is involved: the app cannot run
 * code at the crash. Only after an update or a reboot does the restart
 * happen by itself; after a crash or a hang the user is offered it. Windows
 * restarts only an app that ran for at least 60 seconds, and a normal exit
 * is never restarted.
 *
 * @param options - The arguments of the restarted copy, and optionally the
 *   events to restart after.
 * @throws {Error} When Windows refuses the registration.
 */
export function restartAfterCrash(options: RestartAfterCrashOptions) {
  registerRestart({
    ...options,
    register: createRestartRegistrar()
  });
}
