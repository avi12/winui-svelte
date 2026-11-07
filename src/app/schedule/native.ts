import { TASK_FOLDER } from "./backend.ts";
import type { TaskBackend } from "./backend.ts";
import { currentUserSid } from "#src/app/instance-pipe.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const UTF16_BOM = "\uFEFF";
const NAME_FIELD = /^"([^"]*)"/u;
const NEWLINE = /\r?\n/u;

function schtasks(args: readonly string[]) {
  const root = process.env["SystemRoot"] ?? "C:\\Windows";
  return execFileSync(path.join(root, "System32", "schtasks.exe"), [...args], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function listedNames() {
  const names: string[] = [];
  for (const line of schtasks(["/Query", "/FO", "CSV", "/NH"]).split(NEWLINE)) {
    const name = NAME_FIELD.exec(line)?.[1];
    const isOurs = name?.startsWith(TASK_FOLDER) === true;
    if (isOurs) {
      names.push(name);
    }
  }

  return names;
}

/**
 * Task Scheduler through `schtasks.exe` (found by `SystemRoot`, never by
 * `PATH`): no COM, and the definition goes in as a UTF-16 XML file in a
 * private temporary folder that is removed afterwards.
 *
 * @returns The backend.
 */
export function createSchtasksBackend() {
  return {
    userId: currentUserSid,
    create({ name, xml }) {
      const folder = mkdtempSync(path.join(tmpdir(), "winui-svelte-task-"));
      try {
        const file = path.join(folder, "task.xml");
        writeFileSync(file, `${UTF16_BOM}${xml}`, "utf16le");
        schtasks(["/Create", "/TN", name, "/XML", file, "/F"]);
      } finally {
        rmSync(folder, {
          recursive: true,
          force: true
        });
      }
    },
    list() {
      return [...new Set(listedNames())];
    },
    remove(name) {
      const isListed = listedNames().includes(name);
      if (!isListed) {
        return false;
      }

      schtasks(["/Delete", "/TN", name, "/F"]);
      return true;
    }
  } satisfies TaskBackend;
}
