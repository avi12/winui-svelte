import { jsonSchema } from "#src/messaging/json.js";
import { backgroundEnvironment } from "#src/window/background-mode.js";
import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { z } from "zod";

// An example (examples/harness/launch.ts) run as a process, for tests: its
// windows run in the background (off screen, never activated, no taskbar
// button), its reports come back as objects, and it is driven by commands. Only the process this started is ever ended.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..");
const LAUNCHER = path.join(PACKAGE_ROOT, "examples", "harness", "launch.ts");
const BOOTSTRAP_PATH = path.join(PACKAGE_ROOT, ".winapp", "bin", process.arch, "Microsoft.WindowsAppRuntime.Bootstrap.dll");
export const IS_WINDOWS_APP_SDK_RESTORED = existsSync(BOOTSTRAP_PATH);
const START_MILLISECONDS = 90_000;
const LAYOUT_MILLISECONDS = 900;
const STOP_MILLISECONDS = 15_000;

const reportSchema = z.record(z.string(), jsonSchema);

export type Report = z.infer<typeof reportSchema>;

// A command sent to the example and the kind of report that answers it.
export interface Exchange {
  command: Report;
  kind: string;
  timeoutMilliseconds?: number;
  // A further condition a report of that kind must meet.
  isWanted?(report: Report): boolean;
}

export class ExampleProcess {
  readonly pid: number;
  readonly exited: Promise<number | null>;
  private readonly child: ChildProcessByStdio<Writable, Readable, null>;
  private readonly reports: Report[] = [];
  private readonly waiting: Array<() => void> = [];

  private constructor(child: ChildProcessByStdio<Writable, Readable, null>) {
    this.child = child;
    this.pid = child.pid ?? 0;
    createInterface({ input: child.stdout }).on("line", line => {
      const isReportLine = line.startsWith("{");
      if (isReportLine) {
        this.reports.push(reportSchema.parse(JSON.parse(line)));
        for (const wake of this.waiting.splice(0)) {
          wake();
        }
      }
    });
    this.exited = new Promise(resolve => {
      child.on("exit", code => resolve(code));
    });
  }

  static start({ entry, flags = [], env = {} }: {
    entry: string;
    flags?: string[];
    env?: Record<string, string>;
  }) {
    return ExampleProcess.spawnNode({
      script: LAUNCHER,
      args: [entry, ...flags],
      env
    });
  }

  // Runs a built bundle (a file of JavaScript) under plain Node, as a shipped app runs: from its own folder.
  static startBundle({ file, env = {} }: {
    file: string;
    env?: Record<string, string>;
  }) {
    return ExampleProcess.spawnNode({
      script: file,
      args: [],
      env,
      folder: path.dirname(file)
    });
  }

  private static spawnNode({ script, args, env, folder = PACKAGE_ROOT }: {
    script: string;
    args: string[];
    env: Record<string, string>;
    folder?: string;
  }) {
    const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "--enable-source-maps", script, ...args], {
      cwd: folder,
      env: {
        ...backgroundEnvironment(),
        ...env
      },
      stdio: ["pipe", "pipe", "inherit"],
      windowsHide: true
    });
    return new ExampleProcess(child);
  }

  send(command: Report) {
    this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  // Sends `command` and resolves with the next report of `kind`. The first
  // command also waits for the window to load, which takes a while.
  async ask({ command, kind, timeoutMilliseconds = START_MILLISECONDS, isWanted = () => true }: Exchange) {
    const from = this.reports.length;
    this.send(command);
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      const found = this.reports.slice(from).find(report => report["kind"] === kind && isWanted(report));
      const isFound = found !== undefined;
      if (isFound) {
        return found;
      }

      await new Promise<void>(resolve => {
        this.waiting.push(resolve);
        setTimeout(resolve, 200);
      });
    }

    throw new Error(`no "${kind}" report within ${timeoutMilliseconds} ms after ${JSON.stringify(command)}`);
  }

  // WinUI lays out on its own schedule: give it a moment to realize the
  // containers a command changed, then ask.
  async settled({ command, kind }: Exchange) {
    await this.ask({
      command,
      kind
    });
    await new Promise(resolve => setTimeout(resolve, LAYOUT_MILLISECONDS));
    return this.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
  }

  // For a test that failed: end this process, and only it.
  kill() {
    this.child.kill();
  }

  // Asks the example to close its window and waits for the process to leave on
  // its own, so what it registered with the shell (a tray icon) is removed by
  // its exit hooks; only a process that does not leave in time is killed,
  // which skips them. Resolves with whether it left by itself.
  async stop() {
    const hasExited = this.child.exitCode !== null;
    if (hasExited) {
      return true;
    }

    this.send({ cmd: "close" });
    const timeout = Symbol("timeout");
    const outcome = await Promise.race([
      this.exited,
      new Promise<typeof timeout>(resolve => setTimeout(() => resolve(timeout), STOP_MILLISECONDS))
    ]);
    const isLeft = outcome !== timeout;
    if (!isLeft) {
      this.kill();
    }

    return isLeft;
  }
}

export function numberOf({ report, field }: {
  report: Report;
  field: string;
}) {
  const value = report[field];
  const isNumber = typeof value === "number";
  if (!isNumber) {
    throw new TypeError(`the report has no number "${field}"`);
  }

  return value;
}
