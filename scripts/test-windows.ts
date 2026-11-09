import { backgroundEnvironment } from "#src/window/background-mode.js";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { constants, setPriority } from "node:os";
import path from "node:path";

// `pnpm test:windows`: every test that opens real windows, one file at a time,
// in the background. The windows open off screen and are never activated
// (WINUI_SVELTE_BACKGROUND, src/window/background-mode.ts), and the processes
// run at below-normal priority, so the desktop stays free to work on. Each
// file runs on a desktop of its own (scripts/desktop/run-on-desktop.ps1):
// off screen and no-activate are not enough, because focusing a control
// (a form's first invalid field, a UI Automation call) still activates its
// window, and a window on another desktop object can never take the
// foreground from the person at the keyboard. WINUI_SVELTE_TEST_DESKTOP=default
// opts out. Each file has a timeout. The result is in .verify/test-windows.txt (one line per
// file), the spec output of each file in .verify/test-windows/<name>.log and
// its JUnit report beside it as <name>.xml. Name files to run only those.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..");
const TEST_FOLDER = path.join(PACKAGE_ROOT, "test");
const RESULT_FOLDER = path.join(PACKAGE_ROOT, ".verify", "test-windows");
const SUMMARY_PATH = path.join(PACKAGE_ROOT, ".verify", "test-windows.txt");
const FILE_TIMEOUT_MILLISECONDS = 600_000;
const TEST_TIMEOUT_MILLISECONDS = 120_000;
const MILLISECONDS_PER_SECOND = 1000;
const DESKTOP_VARIABLE = "WINUI_SVELTE_TEST_DESKTOP";
const DEFAULT_DESKTOP = "default";
const DESKTOP_RUNNER = path.join(PACKAGE_ROOT, "scripts", "desktop", "run-on-desktop.ps1");
// What cannot run on a desktop of its own, and why: these stay on the default
// one, where they never take the foreground (measured, .verify/focus-steal.md).
const DEFAULT_DESKTOP_TESTS = new Map([
  ["tray-shell.test.ts", "the notification area belongs to the shell, on the default desktop"],
  ["taskbar.test.ts", "ITaskbarList3 answers E_NOTIMPL without the shell, which runs on the default desktop only; the window has no taskbar button"],
  ["click-through.test.ts", "reads the screen and the system hit test over a window the test opens; no input is sent, the windows are never activated"],
  ["transparent-window.test.ts", "a desktop of its own is never composed, so a screen capture of it reads black and cannot show a window through another; the windows are never activated"],
  ["web-bridge.test.ts", "WebView2 needs an ordinary desktop session to start its browser"],
  ["parked-window.test.ts", "WebView2 needs an ordinary desktop session to start its browser; the window is never activated"],
  ["web-requests.test.ts", "WebView2 needs an ordinary desktop session to start its browser"],
  ["packaged-bootstrap.test.ts", "a registered package runs on the default desktop, and its WebView2 needs an ordinary desktop session"]
]);
// The mount test is `pnpm test`'s; every other test/*.test.ts opens windows.
const NOT_WINDOW_TESTS = new Set(["mount-all.test.ts"]);

function windowTestFiles() {
  return readdirSync(TEST_FOLDER)
    .filter(name => name.endsWith(".test.ts") && !NOT_WINDOW_TESTS.has(name))
    .sort()
    .map(name => path.join("test", name));
}

// Ends the process this run started and everything it started.
function endTree(pid: number) {
  spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"]);
}

function verdictOf({ isTimedOut, code }: {
  isTimedOut: boolean;
  code: number | null;
}) {
  if (isTimedOut) {
    return "TIMEOUT";
  }

  return code === 0 ? "PASS" : "FAIL";
}

function isOnOwnDesktop(file: string) {
  const isOptedOut = process.env[DESKTOP_VARIABLE] === DEFAULT_DESKTOP;
  return !isOptedOut && !DEFAULT_DESKTOP_TESTS.has(path.basename(file));
}

function quoted(argument: string) {
  return `"${argument}"`;
}

// The node process that runs `file`, started directly or, for a file that
// runs on a desktop of its own, through the script that creates the desktop.
function spawnFile({ file, nodeArguments }: {
  file: string;
  nodeArguments: string[];
}) {
  const options = {
    cwd: PACKAGE_ROOT,
    env: backgroundEnvironment(),
    stdio: "ignore",
    windowsHide: true
  } as const;
  if (!isOnOwnDesktop(file)) {
    return spawn(process.execPath, nodeArguments, options);
  }

  const commandLine = [process.execPath, ...nodeArguments].map(quoted).join(" ");
  return spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    DESKTOP_RUNNER,
    "-CommandLine",
    commandLine,
    "-WorkingDirectory",
    PACKAGE_ROOT
  ], options);
}

function runFile(file: string) {
  const name = path.basename(file, ".test.ts");
  const logPath = path.join(RESULT_FOLDER, `${name}.log`);
  const reportPath = path.join(RESULT_FOLDER, `${name}.xml`);
  const started = Date.now();
  return new Promise<{
    file: string;
    status: string;
    seconds: number;
  }>(resolve => {
    const child = spawnFile({
      file,
      nodeArguments: [
        "--disable-warning=ExperimentalWarning",
        "--enable-source-maps",
        "--test",
        `--test-timeout=${TEST_TIMEOUT_MILLISECONDS}`,
        "--test-reporter=spec",
        `--test-reporter-destination=${logPath}`,
        "--test-reporter=junit",
        `--test-reporter-destination=${reportPath}`,
        file
      ]
    });
    let isTimedOut = false;
    const timer = setTimeout(() => {
      isTimedOut = true;
      endTree(child.pid ?? 0);
    }, FILE_TIMEOUT_MILLISECONDS);
    child.on("exit", code => {
      clearTimeout(timer);
      resolve({
        file,
        status: verdictOf({
          isTimedOut,
          code
        }),
        seconds: (Date.now() - started) / MILLISECONDS_PER_SECOND
      });
    });
  });
}

async function main() {
  const named = process.argv.slice(2);
  const files = named.length > 0 ? named : windowTestFiles();
  mkdirSync(RESULT_FOLDER, { recursive: true });
  // Children inherit it: the whole run stays out of the way of foreground work.
  setPriority(constants.priority.PRIORITY_BELOW_NORMAL);
  const lines: string[] = [];
  let isPassing = true;
  for (const file of files) {
    const result = await runFile(file);
    isPassing = isPassing && result.status === "PASS";
    const line = `${result.status} ${result.file} ${result.seconds.toFixed(1)}s`;
    console.log(line);
    lines.push(line);
    writeFileSync(SUMMARY_PATH, `${lines.join("\n")}\n`);
  }

  const verdict = isPassing ? "test:windows: every file passed" : "test:windows: some files failed";
  console.log(verdict);
  writeFileSync(SUMMARY_PATH, `${lines.join("\n")}\n${verdict}\n`);
  process.exitCode = isPassing ? 0 : 1;
}

await main();
