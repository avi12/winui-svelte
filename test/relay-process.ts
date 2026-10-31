import { exportAliases, ExportTarget } from "#scripts/export-aliases.ts";
import { buildApp } from "#src/vite/build.js";
import { backgroundEnvironment } from "#src/window/background-mode.js";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";

// The relay example (examples/relay) built to a bundle and run as a sidecar:
// under plain Node with its stdin and stdout piped, a MessagePort to the
// window's thread, a tray icon, Mica, the system settings and a file watcher.
// It is what the idle and quit tests drive; a message on its process channel
// asks it to quit like a core's quit action would.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..");
const EXAMPLE_FOLDER = path.join(PACKAGE_ROOT, "examples", "relay");
const OUTPUT_PARENT = path.join(PACKAGE_ROOT, ".verify", "relay");
const READY_MILLISECONDS = 90_000;
const QUIT_MILLISECONDS = 20_000;

/** The relay example built to a folder; `remove` deletes it. */
export async function buildRelay() {
  mkdirSync(OUTPUT_PARENT, { recursive: true });
  const outDirectory = mkdtempSync(path.join(OUTPUT_PARENT, "build-"));
  await buildApp({
    root: PACKAGE_ROOT,
    entries: {
      main: path.join(EXAMPLE_FOLDER, "main.ts"),
      window: path.join(EXAMPLE_FOLDER, "window.ts")
    },
    outDirectory,
    isMinified: false,
    config: {
      resolve: {
        alias: exportAliases(ExportTarget.BUILT)
      }
    }
  });
  return {
    outDirectory,
    remove() {
      rmSync(outDirectory, {
        recursive: true,
        force: true
      });
    }
  };
}

/** How a relay process ended. */
export interface RelayExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
}

/** A running relay process. */
export class RelayProcess {
  readonly pid: number;
  readonly ready: Promise<void>;
  readonly exited: Promise<RelayExit>;
  private readonly child: ReturnType<typeof RelayProcess.spawnChild>;
  private stderr = "";

  private constructor(child: ReturnType<typeof RelayProcess.spawnChild>) {
    this.child = child;
    this.pid = child.pid ?? 0;
    child.stderr?.on("data", chunk => {
      this.stderr += String(chunk);
    });
    child.stdout?.resume();
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`the relay was not ready in ${READY_MILLISECONDS} ms\n${this.stderr}`)), READY_MILLISECONDS);
      child.on("message", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.ready.catch(() => undefined);
    this.exited = new Promise(resolve => {
      child.on("exit", (code, signal) => resolve({
        code,
        signal,
        stderr: this.stderr
      }));
    });
  }

  private static spawnChild(outDirectory: string) {
    return spawn(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(outDirectory, "main.js")], {
      cwd: PACKAGE_ROOT,
      env: backgroundEnvironment(),
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      windowsHide: true
    });
  }

  static start(outDirectory: string) {
    return new RelayProcess(RelayProcess.spawnChild(outDirectory));
  }

  /** The host's end of the pipes closing, as a core exiting does. */
  closePipes() {
    this.child.stdin?.end();
  }

  /** The quit message on the process channel. */
  requestQuit() {
    this.child.send({ cmd: "quit" });
  }

  /** Waits for the process to end by itself; kills it when it does not. */
  async waitForExit() {
    const timeout = Symbol("timeout");
    const outcome = await Promise.race([
      this.exited,
      new Promise<typeof timeout>(resolve => setTimeout(() => resolve(timeout), QUIT_MILLISECONDS))
    ]);
    const isTimedOut = outcome === timeout;
    if (isTimedOut) {
      this.kill();
      throw new Error(`the relay did not end within ${QUIT_MILLISECONDS} ms of the quit\n${this.stderr}`);
    }

    return outcome;
  }

  /** For a test that failed: end this process, and only it. */
  kill() {
    this.child.kill();
  }
}
