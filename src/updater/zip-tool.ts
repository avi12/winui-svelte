import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

function tarExecutable() {
  const systemRoot = process.env["SystemRoot"] ?? "C:/Windows";
  return path.join(systemRoot, "System32", "tar.exe");
}

/**
 * Packs a folder's contents into a zip with the `tar.exe` Windows ships.
 *
 * @param options - The folder and the zip to write.
 */
export async function zipFolder({ folder, zip }: {
  folder: string;
  zip: string;
}) {
  await run(tarExecutable(), ["-a", "-c", "-f", zip, "-C", folder, "."]);
}

/**
 * Unpacks a zip into a folder with the `tar.exe` Windows ships.
 *
 * @param options - The zip and the folder to fill.
 */
export async function unzipTo({ zip, folder }: {
  zip: string;
  folder: string;
}) {
  await run(tarExecutable(), ["-x", "-f", zip, "-C", folder]);
}
