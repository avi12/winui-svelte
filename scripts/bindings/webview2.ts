import { filesIn } from "#scripts/files-in.ts";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

// The bindings of WebView2, made after winapp's: winapp passes the code
// generator the Microsoft.Web.WebView2.Core metadata neither to emit nor to
// resolve against, so WebView2's own events cannot be bound in its run. This
// runs the generator for the one class with that metadata among the winmds to
// emit, and adds the files winapp's run did not make to .winapp/bindings.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const BINDINGS_FOLDER = path.join(PACKAGE_ROOT, ".winapp", "bindings");
const LOCK_PATH = path.join(PACKAGE_ROOT, ".winapp", "winmds.lock.json");
const GENERATOR = path.join(PACKAGE_ROOT, "node_modules", "@microsoft", "dynwinrt-codegen", "bin", process.arch, "dynwinrt-codegen.exe");
const XAML_WINMD = /Microsoft\.UI\.Xaml\.winmd$/iu;
const CORE_WINMD = /Microsoft\.Web\.WebView2\.Core\.winmd$/iu;
const CONTROLS_NAMESPACE = "Microsoft.UI.Xaml.Controls";
const CLASS_NAME = "WebView2";
// The entry files of a generated tree: winapp's run made the one that counts.
const ENTRY_FILE = /^(index|lifetime|package)\./u;

const lockSchema = z.object({
  packages: z.array(z.object({ winmds: z.array(z.string()) }))
});

function winmdsOfLock() {
  const lock = lockSchema.parse(JSON.parse(readFileSync(LOCK_PATH, "utf8")));
  return lock.packages.flatMap(entry => entry.winmds);
}

function generate(workFolder: string) {
  const winmds = winmdsOfLock();
  const emitted = winmds.filter(winmd => XAML_WINMD.test(winmd) || CORE_WINMD.test(winmd));
  const isComplete = emitted.length === 2;
  if (!isComplete) {
    throw new Error(`${LOCK_PATH} must name Microsoft.UI.Xaml.winmd and Microsoft.Web.WebView2.Core.winmd: run winapp restore`);
  }

  const referenceList = path.join(workFolder, "references.txt");
  writeFileSync(referenceList, winmds.filter(winmd => !emitted.includes(winmd)).join("\n"));
  const output = path.join(workFolder, "out");
  execFileSync(GENERATOR, [
    "generate",
    "--winmd",
    emitted.join(";"),
    "--ref-list",
    referenceList,
    "--namespace",
    CONTROLS_NAMESPACE,
    "--class-name",
    CLASS_NAME,
    "--output",
    output
  ], { stdio: ["ignore", "ignore", "inherit"] });
  return output;
}

function addMissingFiles(output: string) {
  let added = 0;
  for (const file of filesIn(output)) {
    const relative = path.relative(output, file);
    const isEntryFile = !relative.includes(path.sep) && ENTRY_FILE.test(relative);
    const target = path.join(BINDINGS_FOLDER, relative);
    const isMissing = !isEntryFile && !existsSync(target);
    if (isMissing) {
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(file, target);
      added++;
    }
  }

  return added;
}

function run() {
  const workFolder = mkdtempSync(path.join(tmpdir(), "winui-svelte-webview2-"));
  try {
    const added = addMissingFiles(generate(workFolder));
    process.stdout.write(
      `WebView2 bindings: ${added} files added to ${BINDINGS_FOLDER}
`
    );
  } finally {
    rmSync(workFolder, {
      recursive: true,
      force: true
    });
  }
}

run();
