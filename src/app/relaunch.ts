import { launchCommand } from "./launch-command.ts";
import type { LaunchCommand } from "./launch-command.ts";
import { exitApplication } from "#src/window/application.js";
import { spawn } from "node:child_process";

/** What `relaunch` takes. */
export interface RelaunchOptions {
  /** The command line arguments of the new copy (after the entry script); none by default. */
  readonly arguments?: readonly string[];

  /**
   * The entry script of the new copy, when it is not `process.argv[1]`
   * (an app whose windows run in a worker thread names the script that
   * starts the process).
   */
  readonly entryScript?: string | undefined;

  /**
   * The app's single-instance claim: released before the new copy starts, so
   * the new copy becomes the primary instead of redirecting to this one.
   */
  readonly instance?: {
    release(): void;
  } | undefined;
}

/** What `startAndExit` does; a test stands in for it. */
export interface RelaunchEffects {
  start(command: LaunchCommand): void;
  exit(): void;
}

function detachedStart(command: LaunchCommand) {
  spawn(command.executable, [...command.arguments], {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  }).unref();
}

/**
 * Starts the app again and ends this copy: the same as `relaunch` over any
 * effects.
 *
 * @param options - The new copy's arguments, the claim to release, and the
 *   effects.
 */
export function relaunchWith({ effects, ...options }: RelaunchOptions & {
  effects: RelaunchEffects;
}) {
  options.instance?.release();
  effects.start(
    launchCommand({
      appArguments: options.arguments ?? [],
      entryScript: options.entryScript
    })
  );
  effects.exit();
}

/**
 * Starts a new copy of the app (the same Node, flags and entry script, then
 * `arguments`), detached from this one, and exits this copy cleanly
 * (`exitApplication`: timers stop and `runWindow` settles). The new copy runs
 * on its own, so it outlives this process. For a restart after a crash, see
 * `restartAfterCrash`.
 *
 * @param options - The new copy's arguments, and optionally the
 *   single-instance claim to release first.
 */
export function relaunch(options: RelaunchOptions = {}) {
  relaunchWith({
    ...options,
    effects: {
      start: detachedStart,
      exit: exitApplication
    }
  });
}
