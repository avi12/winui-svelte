import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Runs the window example from an Electron main process, as the README says an
// Electron app does it: the main process spawns a Node process that starts the
// Windows App SDK and the window, and speaks to it in JSON lines over stdio.
// Electron is installed in a throwaway folder under .verify, never into this
// package, and this is not a step of `pnpm lint` or `pnpm test`:
//
//   pnpm verify:electron
//
// It needs `pnpm build` and the restored Windows App SDK, and starts a window
// off screen, never activated.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const SMOKE_FOLDER = path.join(PACKAGE_ROOT, ".verify", "electron-smoke");
const MAIN_FILE = path.join(SMOKE_FOLDER, "main.cjs");
const ELECTRON_FOLDER = path.join(SMOKE_FOLDER, "node_modules", "electron");
const TIMEOUT_MILLISECONDS = 240_000;
const OK_MARKER = "ELECTRON-SMOKE info";

const MAIN_SOURCE = `
const electron = require("electron");
const { app } = electron;
electron.dialog.showErrorBox = () => {};
process.on("uncaughtException", error => {
  require("node:fs").writeFileSync(process.env.WINUI_LOG, String(error && error.stack || error));
  app.exit(1);
});
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const path = require("node:path");
const root = process.env.WINUI_ROOT;
const START_MILLISECONDS = 15000;
const GIVE_UP_MILLISECONDS = 120000;
app.whenReady().then(() => {
  const child = spawn(process.env.WINUI_NODE, [
    "--disable-warning=ExperimentalWarning",
    path.join(root, "examples", "harness", "launch.ts"),
    "examples/window/main.ts",
    "--background",
    "yes"
  ], { cwd: root, stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
  const giveUp = setTimeout(() => {
    child.kill();
    app.exit(2);
  }, GIVE_UP_MILLISECONDS);
  readline.createInterface({ input: child.stdout }).on("line", line => {
    if (!line.startsWith("{")) {
      return;
    }
    const message = JSON.parse(line);
    if (message.kind === "info") {
      console.log("${OK_MARKER}", JSON.stringify({ title: message.title, backdrop: message.backdrop, electron: process.versions.electron }));
      child.stdin.write(JSON.stringify({ cmd: "close" }) + String.fromCharCode(10));
    }
  });
  setTimeout(() => child.stdin.write(JSON.stringify({ cmd: "info" }) + String.fromCharCode(10)), START_MILLISECONDS);
  child.on("exit", code => {
    clearTimeout(giveUp);
    app.exit(code ?? 1);
  });
});
`;

function run({ command, args, cwd, env = {} }: {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}) {
  return spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    shell: command === "pnpm",
    timeout: TIMEOUT_MILLISECONDS
  });
}

function installElectron() {
  mkdirSync(SMOKE_FOLDER, { recursive: true });
  writeFileSync(path.join(SMOKE_FOLDER, "package.json"), JSON.stringify({ name: "electron-smoke", private: true, version: "0.0.0" }));
  const isInstalled = existsSync(path.join(ELECTRON_FOLDER, "path.txt"));
  if (isInstalled) {
    return;
  }

  run({
    command: "pnpm",
    args: ["add", "electron", "--ignore-workspace"],
    cwd: SMOKE_FOLDER
  });
  run({
    command: process.execPath,
    args: [path.join(ELECTRON_FOLDER, "install.js")],
    cwd: SMOKE_FOLDER
  });
}

installElectron();
writeFileSync(MAIN_FILE, MAIN_SOURCE);
const check = run({
  command: process.execPath,
  args: ["--check", MAIN_FILE],
  cwd: SMOKE_FOLDER
});
const isSyntaxValid = check.status === 0;
if (!isSyntaxValid) {
  throw new Error(`the Electron main file does not parse: ${check.stderr}`);
}

const electronPath = path.join(ELECTRON_FOLDER, "dist", "electron.exe");
const result = run({
  command: electronPath,
  args: [MAIN_FILE],
  cwd: PACKAGE_ROOT,
  env: {
    WINUI_NODE: process.execPath,
    WINUI_ROOT: PACKAGE_ROOT,
    WINUI_LOG: path.join(SMOKE_FOLDER, "error.log")
  }
});
process.stdout.write(result.stdout);
process.stderr.write(`${result.stderr}${result.error ?? ""}`);
const isWorking = result.status === 0 && result.stdout.includes(OK_MARKER);
process.exitCode = isWorking ? 0 : 1;
