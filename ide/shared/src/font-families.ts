import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const LIST_FAMILIES = "Add-Type -AssemblyName System.Drawing; "
  + "(New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }";
const KIBIBYTE = 1024;
const MAX_BUFFER_MEBIBYTES = 8;
const MAX_BUFFER = MAX_BUFFER_MEBIBYTES * KIBIBYTE * KIBIBYTE;
let installed: Promise<string[]> | undefined;

async function listFamilies() {
  const { stdout } = await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", LIST_FAMILIES], {
    maxBuffer: MAX_BUFFER,
    windowsHide: true
  }).catch(() => ({ stdout: "" }));
  return stdout.split(/\r?\n/u).map(name => name.trim()).filter(name => name !== "");
}

/**
 * The font families installed on this machine (Windows), asked once and kept.
 */
export function installedFamilies() {
  installed ??= listFamilies();
  return installed;
}
