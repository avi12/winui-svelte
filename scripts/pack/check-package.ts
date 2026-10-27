import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync
} from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

// Packs the package with pnpm (what is published) and checks the tarball the
// way a consumer meets it: publint for the manifest, @arethetypeswrong/cli for
// the types of every entry point, and the file list for what must never ship.

const packageRoot = path.join(import.meta.dirname, "..", "..");
const forbiddenInTarball = [
  /^package\/CLAUDE\.md$/u,
  /^package\/CONTRIBUTING\.md$/u,
  /^package\/src\//u,
  /^package\/scripts\//u,
  /^package\/test\//u,
  /^package\/examples\//u,
  /^package\/\.github\//u,
  /\.test\.(js|d\.ts)$/u,
  /\.fixture\.svelte$/u
];

// A tar archive is 512-byte blocks: a header (name at 0, size in octal at 124,
// a ustar prefix at 345) then the file's data padded to a block.
const tarBlockBytes = 512;
const nameBytes = 100;
const sizeOffset = 124;
const sizeBytes = 12;
const prefixOffset = 345;
const prefixBytes = 155;
const octal = 8;
const bytesPerKilobyte = 1024;

function textAt(block: Buffer, offset: number, length: number) {
  const end = block.indexOf(0, offset);
  const stop = end === -1 || end > offset + length ? offset + length : end;
  return block.toString("utf8", offset, stop);
}

function tarballFiles(tarball: string) {
  const archive = gunzipSync(readFileSync(tarball));
  const files: string[] = [];
  let position = 0;
  while (position + tarBlockBytes <= archive.length) {
    const header = archive.subarray(position, position + tarBlockBytes);
    const name = textAt(header, 0, nameBytes);
    if (name === "") {
      break;
    }

    const prefix = textAt(header, prefixOffset, prefixBytes);
    files.push(prefix === "" ? name : `${prefix}/${name}`);
    const size = Number.parseInt(textAt(header, sizeOffset, sizeBytes).trim(), octal);
    position += tarBlockBytes + Math.ceil(size / tarBlockBytes) * tarBlockBytes;
  }

  return files;
}

// pnpm sets npm_execpath to its own script, which Node runs directly (no shell).
function run(args: string[]) {
  const pnpmScript = process.env["npm_execpath"];
  if (pnpmScript === undefined) {
    throw new Error("Run this through pnpm: pnpm check:package");
  }

  execFileSync(process.execPath, [pnpmScript, ...args], {
    cwd: packageRoot,
    stdio: "inherit"
  });
}

// Inside the repository (gitignored), so the check writes nowhere else.
const scratchFolder = path.join(packageRoot, ".verify");
mkdirSync(scratchFolder, { recursive: true });
const packFolder = mkdtempSync(path.join(scratchFolder, "pack-"));
try {
  run(["pack", "--pack-destination", packFolder]);
  const tarball = path.join(packFolder, readdirSync(packFolder).filter(name => name.endsWith(".tgz"))[0] ?? "");
  const files = tarballFiles(tarball);
  const forbidden = files.filter(file => forbiddenInTarball.some(pattern => pattern.test(file)));
  if (forbidden.length > 0) {
    throw new Error(`The tarball holds files that must not ship:\n${forbidden.slice(0, 20).join("\n")}`);
  }

  const kilobytes = Math.round(statSync(tarball).size / bytesPerKilobyte);
  console.log(`Tarball: ${files.length} files, ${kilobytes} kB packed`);
  run(["exec", "publint", "run", tarball, "--strict"]);
  // The types import the WinUI bindings an app generates for itself
  // (#winui/*, from the @winapp/bindings peer), which the checker's sandbox
  // does not hold: those imports cannot resolve there, in every entry point.
  run([
    "exec",
    "attw",
    tarball,
    "--profile",
    "esm-only",
    "--ignore-rules",
    "internal-resolution-error"
  ]);
} finally {
  rmSync(packFolder, {
    recursive: true,
    force: true
  });
}
