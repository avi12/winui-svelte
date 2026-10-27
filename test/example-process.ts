import { jsonSchema } from "#src/messaging/json.js";
import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { z } from "zod";

// An example (examples/harness/launch.ts) run as a process, for tests: its
// window is off screen and never activated, its reports come back as objects,
// and it is driven by commands. Only the process this started is ever ended.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..");
const LAUNCHER = path.join(PACKAGE_ROOT, "examples", "harness", "launch.ts");
const BOOTSTRAP_PATH = path.join(PACKAGE_ROOT, ".winapp", "bin", process.arch, "Microsoft.WindowsAppRuntime.Bootstrap.dll");
export const IS_WINDOWS_APP_SDK_RESTORED = existsSync(BOOTSTRAP_PATH);
const START_MILLISECONDS = 90_000;
const LAYOUT_MILLISECONDS = 900;

const reportSchema = z.record(z.string(), jsonSchema);

export type Report = z.infer<typeof reportSchema>;

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
        this.waiting.splice(0).forEach(wake => wake());
      }
    });
    this.exited = new Promise(resolve => {
      child.on("exit", code => resolve(code));
    });
  }

  static start(entry: string, flags: string[] = []) {
    const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", LAUNCHER, entry, ...flags], {
      cwd: PACKAGE_ROOT,
      stdio: ["pipe", "pipe", "inherit"]
    });
    return new ExampleProcess(child);
  }

  send(command: Report) {
    this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  // Sends `command` and resolves with the next report of `kind`. The first
  // command also waits for the window to load, which takes a while.
  async ask(command: Report, kind: string, timeoutMilliseconds = START_MILLISECONDS) {
    const from = this.reports.length;
    this.send(command);
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      const found = this.reports.slice(from).find(report => report["kind"] === kind);
      if (found !== undefined) {
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
  async settled(command: Report, kind: string) {
    await this.ask(command, kind);
    await new Promise(resolve => setTimeout(resolve, LAYOUT_MILLISECONDS));
    return this.ask({ cmd: "stats" }, "stats");
  }

  // For a test that failed: end this process, and only it.
  kill() {
    this.child.kill();
  }
}

export function numberOf(report: Report, field: string) {
  const value = report[field];
  if (typeof value !== "number") {
    throw new TypeError(`the report has no number "${field}"`);
  }

  return value;
}
