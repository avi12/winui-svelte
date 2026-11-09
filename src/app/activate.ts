import { currentUserSid, pipeNameFor } from "./instance-pipe.ts";
import { encodeRedirect } from "./redirect.ts";
import type { Activation } from "./redirect.ts";
import { allowForeground } from "#src/win32-foreground.js";
import { spawn } from "node:child_process";
import net from "node:net";

const CONNECT_TIMEOUT_MILLISECONDS = 2000;

/** What `launchApp` starts: a program, its arguments and where it runs. */
export interface LaunchOptions {
  /** The program to start, such as the path of `node.exe` or of the app's `.exe`. */
  readonly command: string;

  /** Its arguments. */
  readonly arguments?: readonly string[];

  /** Where it starts; this process's folder by default. */
  readonly workingDirectory?: string;
}

/**
 * Starts a program that outlives this process, with no console window and
 * none of this process's handles.
 *
 * @param options - The program, its arguments and its folder.
 */
export function launchApp({ command, arguments: args = [], workingDirectory = process.cwd() }: LaunchOptions) {
  allowForeground();
  const child = spawn(command, args, {
    cwd: workingDirectory,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.on("error", () => {});
  child.unref();
}

/**
 * Sends an activation to the copy of the app that `ensureSingleInstance`
 * serves for `key`, which calls its `onRedirect` with it. It only delivers:
 * unlike a later copy of the app it never becomes the first copy, so it is
 * what a process outside the app, such as a tray, uses.
 *
 * @param options - The app's key and the arguments to hand to the running copy.
 * @returns True when a running copy took it, false when none runs.
 */
export function activateInstance({ key, activation }: {
  key: string;
  activation: Activation;
}) {
  allowForeground();
  const line = encodeRedirect(activation);
  const pipeName = pipeNameFor({
    key,
    sid: currentUserSid()
  });
  return new Promise<boolean>(resolve => {
    const socket = net.connect(pipeName);
    socket.setTimeout(CONNECT_TIMEOUT_MILLISECONDS, () => socket.destroy());
    socket.on("connect", () => socket.end(`${line}\n`));
    socket.on("error", () => resolve(false));
    socket.on("close", isErrored => resolve(!isErrored));
  });
}

/**
 * Hands the activation to the running copy of the app, or starts the app
 * when none runs: what "open the panel" does from a tray.
 *
 * @param options - The app's key, the arguments for a running copy, and how
 *   to start one that is not running.
 * @returns True when a running copy took it, false when the app was started.
 */
export async function activateOrLaunch({ key, activation, launch }: {
  key: string;
  activation: Activation;
  launch: LaunchOptions;
}) {
  const isRunning = await activateInstance({
    key,
    activation
  });
  if (isRunning) {
    return true;
  }

  launchApp(launch);
  return false;
}
