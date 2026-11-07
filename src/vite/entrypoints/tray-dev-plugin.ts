import { buildTray } from "./build-tray.ts";
import { discoverEntrypoints, Entrypoint, isInsideFolder } from "./discover.ts";
import { restartTray, trayDevelopment } from "./tray-process.ts";
import type { TrayProcessSeams } from "./tray-process.ts";
import { TRAY_BUNDLE_FILE } from "#src/tray/tray-manifest.js";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const DEV_FOLDER = ".winui";
const PID_FILE = "tray.pid";
const TRAY_FOLDER = "tray";
const IMAGE_NAME_COLUMN = 0;

function imageNameOf(pid: number) {
  const row = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
    encoding: "utf8",
    windowsHide: true
  });
  const name = row.split(",")[IMAGE_NAME_COLUMN]?.replaceAll("\"", "");
  const isRunning = name !== undefined && !name.startsWith("INFO:");
  return isRunning ? name : undefined;
}

function realSeams({ pidFile, outDirectory }: {
  pidFile: string;
  outDirectory: string;
}) {
  return {
    readPid() {
      try {
        const pid = Number(readFileSync(pidFile, "utf8"));
        return Number.isInteger(pid) ? pid : undefined;
      } catch {
        return undefined;
      }
    },
    savePid(pid) {
      mkdirSync(path.dirname(pidFile), { recursive: true });
      writeFileSync(pidFile, String(pid));
    },
    imageNameOf,
    kill(pid) {
      process.kill(pid);
    },
    spawn() {
      const child = spawn(process.execPath, [path.join(outDirectory, TRAY_BUNDLE_FILE)], {
        cwd: outDirectory,
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
      child.on("error", () => {});
      child.unref();
      return child.pid;
    }
  } satisfies TrayProcessSeams;
}

/**
 * Under the dev server, builds `entrypoints/tray.ts` into `.winui/tray` and
 * runs it as a process of its own; a change to the file rebuilds it and
 * restarts the process. Does nothing when the app has no tray entrypoint,
 * and nothing in a production build.
 */
export function trayDevelopmentPlugin() {
  const plugin: Plugin = {
    name: "winui-svelte:tray-development",
    apply: "serve",
    configureServer(server) {
      const { root, logger } = server.config;
      const file = discoverEntrypoints(root)[Entrypoint.TRAY];
      const hasTray = file !== undefined;
      if (!hasTray) {
        return;
      }

      const outDirectory = path.join(root, DEV_FOLDER, TRAY_FOLDER);
      const seams = realSeams({
        pidFile: path.join(root, DEV_FOLDER, PID_FILE),
        outDirectory
      });
      const isFolderEntry = path.basename(file, path.extname(file)) === "index";
      const folder = path.dirname(file);
      const development = trayDevelopment({
        build: () => buildTray({
          root,
          file,
          outDirectory,
          isFirst: true,
          isMinified: false
        }),
        restart: () => restartTray(seams),
        isTrayFile: changed => changed === file || isFolderEntry && isInsideFolder({
          folder,
          file: changed
        })
      });
      function report(error: unknown) {
        logger.error(`tray entrypoint: ${String(error)}`);
      }

      server.watcher.on("change", changed => {
        development.changed(path.normalize(changed)).catch(report);
      });
      development.start().catch(report);
    }
  };
  return plugin;
}
