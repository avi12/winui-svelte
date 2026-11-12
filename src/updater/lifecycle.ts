const SWITCH_PREFIX = "--";
const FIRST_RUN_VARIABLE = "WINUI_SVELTE_FIRST_RUN";
const RESTARTED_VARIABLE = "WINUI_SVELTE_RESTARTED";
const SET = "1";

/** The moments the launcher tells the app about, as the switch `--<event>` followed by the version. */
export const LifecycleEvent = {
  INSTALL: "install",
  UPDATED: "updated",
  OBSOLETE: "obsolete",
  UNINSTALL: "uninstall"
} as const;

/** One of `LifecycleEvent`. */
export type LifecycleEvent = typeof LifecycleEvent[keyof typeof LifecycleEvent];

/** What a lifecycle handler is given. */
export interface LifecycleDetails {
  /** The version the event is about; undefined when the launcher gave none. */
  readonly version: string | undefined;
}

/** A handler per event; give the ones the app cares about. */
export type LifecycleHandlers = Partial<Record<LifecycleEvent, (details: LifecycleDetails) => Promise<void> | void>>;

const EVENTS: readonly string[] = Object.values(LifecycleEvent);

function isLifecycleEvent(value: string): value is LifecycleEvent {
  return EVENTS.includes(value);
}

/**
 * Finds a lifecycle event in a command line.
 *
 * @param argv - The arguments, without the program path.
 * @returns The event and its version, or undefined for a normal start.
 */
export function parseLifecycle(argv: readonly string[]) {
  for (const [i, argument] of argv.entries()) {
    const event = argument.startsWith(SWITCH_PREFIX) ? argument.slice(SWITCH_PREFIX.length) : "";
    if (isLifecycleEvent(event)) {
      return {
        event,
        version: argv[i + 1]
      };
    }
  }

  return undefined;
}

/**
 * Runs the handler for a lifecycle event the launcher passed, so the app does
 * its own setup or cleanup (startup entry, protocol handlers) and then exits.
 * The launcher kills a handler that runs longer than 30 seconds for install
 * and uninstall, 15 for updated and obsolete, so keep them short.
 *
 * @param options - The command line arguments and the handlers.
 * @returns Whether it was a lifecycle start; when true the app should exit.
 */
export async function handleLifecycle({ argv, handlers }: {
  argv: readonly string[];
  handlers: LifecycleHandlers;
}) {
  const parsed = parseLifecycle(argv);
  const isNormalStart = parsed === undefined;
  if (isNormalStart) {
    return false;
  }

  await handlers[parsed.event]?.({
    version: parsed.version
  });
  return true;
}

/**
 * Tells how the launcher started this run.
 *
 * @param environment - The environment variables; `process.env` by default.
 * @returns Whether this is the first run after install, and whether the app was restarted by an update.
 */
export function launchState(environment: NodeJS.ProcessEnv = process.env) {
  return {
    isFirstRun: environment[FIRST_RUN_VARIABLE] === SET,
    isRestarted: environment[RESTARTED_VARIABLE] === SET
  };
}
