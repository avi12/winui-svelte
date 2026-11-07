/** What the dev restart does to the machine; a test stands in for it. */
export interface TrayProcessSeams {
  /** The pid saved by the last start, if any. */
  readPid(): number | undefined;
  savePid(pid: number): void;
  /** The program name of a process, or undefined when none runs under that pid. */
  imageNameOf(pid: number): string | undefined;
  kill(pid: number): void;
  /** Starts `tray.js` detached. @returns its pid */
  spawn(): number | undefined;
}

/** The only program the restart ever stops: a stale pid file must not name another one's process. */
const TRAY_IMAGE_NAME = "node.exe";

/**
 * Stops the tray the last start left (only a Node process, by its pid file),
 * then starts the freshly built one and saves its pid. There is no HMR: a
 * change to the tray is a new process, as with WXT's background script. The
 * icon of a stopped process stays until the shell is next pointed at it.
 *
 * @param seams - The machine.
 */
export function restartTray(seams: TrayProcessSeams) {
  const stale = seams.readPid();
  const isStaleTray = stale !== undefined && seams.imageNameOf(stale)?.toLowerCase() === TRAY_IMAGE_NAME;
  if (isStaleTray) {
    seams.kill(stale);
  }

  const pid = seams.spawn();
  const isStarted = pid !== undefined;
  if (isStarted) {
    seams.savePid(pid);
  }
}

/** The dev server's side of the tray, with the build and the restart as seams. */
export interface TrayDevelopmentOptions {
  readonly build: () => Promise<unknown>;
  readonly restart: () => void;
  /** Whether a changed file belongs to the tray entrypoint. */
  readonly isTrayFile: (file: string) => boolean;
}

/**
 * Builds and starts the tray, and rebuilds and restarts it when one of its
 * files changes; changes that arrive during a build are folded into one more.
 *
 * @param options - The build, the restart and which files count.
 * @returns `start` for the first run and `changed` for a file event.
 */
export function trayDevelopment({ build, restart, isTrayFile }: TrayDevelopmentOptions) {
  let isBuilding = false;
  let isAgain = false;

  async function run() {
    if (isBuilding) {
      isAgain = true;
      return;
    }

    isBuilding = true;
    try {
      do {
        isAgain = false;
        await build();
        restart();
      } while (isAgain);
    } finally {
      isBuilding = false;
    }
  }

  return {
    start: run,
    async changed(file: string) {
      if (isTrayFile(file)) {
        await run();
      }
    }
  };
}
