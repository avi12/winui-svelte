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

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const forbiddenInTarball = [
  /^package\/CLAUDE\.md$/u,
  /^package\/CONTRIBUTING\.md$/u,
  /^package\/src\/.*\.(test\.ts|fixture\.svelte)$/u,
  /^package\/src\/state\/test-support\//u,
  /^package\/src\/devices\/test-support\//u,
  /^package\/src\/renderer\/testing\/(fake-controls|tree-probe)\.ts$/u,
  /^package\/scripts\//u,
  /^package\/test\//u,
  /^package\/examples\//u,
  /^package\/\.github\//u,
  /\.test\.(js|d\.ts)$/u,
  /\.fixture\.svelte$/u
];

// What the source maps need: the maps themselves, and the TypeScript they point
// at, so an IDE opens the implementation, not only the declaration.
const requiredInTarball = [
  "package/dist/index.js.map",
  "package/dist/index.d.ts.map",
  "package/src/index.ts"
];

// A tar archive is 512-byte blocks: a header (name at 0, size in octal at 124,
// a ustar prefix at 345) then the file's data padded to a block.
const TAR_BLOCK_BYTES = 512;
const NAME_BYTES = 100;
const SIZE_OFFSET = 124;
const SIZE_BYTES = 12;
const PREFIX_OFFSET = 345;
const PREFIX_BYTES = 155;
const OCTAL = 8;
const BYTES_PER_KILOBYTE = 1024;
const FORBIDDEN_LISTED = 20;

function textAt({ block, offset, length }: {
  block: Buffer;
  offset: number;
  length: number;
}) {
  const end = block.indexOf(0, offset);
  const isTerminatedInside = end !== -1 && end <= offset + length;
  const stop = isTerminatedInside ? end : offset + length;
  return block.toString("utf8", offset, stop);
}

function tarballFiles(tarball: string) {
  const archive = gunzipSync(readFileSync(tarball));
  const files: string[] = [];
  let position = 0;
  while (position + TAR_BLOCK_BYTES <= archive.length) {
    const header = archive.subarray(position, position + TAR_BLOCK_BYTES);
    const name = textAt({
      block: header,
      offset: 0,
      length: NAME_BYTES
    });
    const isEnd = name === "";
    if (isEnd) {
      break;
    }

    const prefix = textAt({
      block: header,
      offset: PREFIX_OFFSET,
      length: PREFIX_BYTES
    });
    const hasPrefix = prefix !== "";
    files.push(hasPrefix ? `${prefix}/${name}` : name);
    const size = Number.parseInt(
      textAt({
        block: header,
        offset: SIZE_OFFSET,
        length: SIZE_BYTES
      }).trim(), OCTAL
    );
    position += TAR_BLOCK_BYTES + Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
  }

  return files;
}

// pnpm sets npm_execpath to its own script, which Node runs directly (no shell).
function run(args: string[]) {
  const pnpmScript = process.env["npm_execpath"];
  const isRunThroughPnpm = pnpmScript !== undefined;
  if (!isRunThroughPnpm) {
    throw new Error("Run this through pnpm: pnpm check:package");
  }

  execFileSync(process.execPath, [pnpmScript, ...args], {
    cwd: PACKAGE_ROOT,
    stdio: "inherit"
  });
}

// Inside the repository (gitignored), so the check writes nowhere else.
const SCRATCH_FOLDER = path.join(PACKAGE_ROOT, ".verify");
mkdirSync(SCRATCH_FOLDER, { recursive: true });
const PACK_FOLDER = mkdtempSync(path.join(SCRATCH_FOLDER, "pack-"));
try {
  run(["pack", "--pack-destination", PACK_FOLDER]);
  const tarball = path.join(PACK_FOLDER, readdirSync(PACK_FOLDER).filter(name => name.endsWith(".tgz"))[0] ?? "");
  const files = tarballFiles(tarball);
  const forbidden = files.filter(file => forbiddenInTarball.some(pattern => pattern.test(file)));
  const hasForbidden = forbidden.length > 0;
  if (hasForbidden) {
    throw new Error(`The tarball holds files that must not ship:\n${forbidden.slice(0, FORBIDDEN_LISTED).join("\n")}`);
  }

  const missing = requiredInTarball.filter(file => !files.includes(file));
  const isMissing = missing.length > 0;
  if (isMissing) {
    throw new Error(`The tarball lacks files the source maps need:\n${missing.join("\n")}`);
  }

  const kilobytes = Math.round(statSync(tarball).size / BYTES_PER_KILOBYTE);
  console.log(`Tarball: ${files.length} files, ${kilobytes} kB packed`);
  run(["exec", "publint", "run", tarball, "--strict"]);
  // The types import the bindings (#winui/*, dist/bindings) and what they
  // import (@microsoft/dynwinrt), which the checker's sandbox cannot resolve
  // from inside the tarball: that is its only complaint.
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
  rmSync(PACK_FOLDER, {
    recursive: true,
    force: true
  });
}
