import { filesIn } from "#scripts/files-in.ts";
import { WINAPP_BINARIES, WINAPP_BINDINGS, WINAPP_LOCK } from "#scripts/winapp-paths.ts";
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
// emit, and adds the files winapp's run did not make to .winapp/bindings. It
// also puts the native library the control activates its Core types from
// (Microsoft.Web.WebView2.Core.dll, which winapp restores no more than it passes
// the winmd) beside the other restored libraries, where the build ships it.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const GENERATOR = path.join(PACKAGE_ROOT, "node_modules", "@microsoft", "dynwinrt-codegen", "bin", process.arch, "dynwinrt-codegen.exe");
const XAML_WINMD = /Microsoft\.UI\.Xaml\.winmd$/iu;
const CORE_WINMD = /Microsoft\.Web\.WebView2\.Core\.winmd$/iu;
const CONTROLS_NAMESPACE = "Microsoft.UI.Xaml.Controls";
const CLASS_NAME = "WebView2";
const NATIVE_LIBRARY = "Microsoft.Web.WebView2.Core.dll";
// The architectures of .winapp/bin, by the runtime folder of the NuGet package.
const runtimeFolders = new Map([
  ["x64", "win-x64"],
  ["arm64", "win-arm64"],
  ["x86", "win-x86"]
]);
// The entry files of a generated tree: winapp's run made the one that counts.
const ENTRY_FILE = /^(index|lifetime|package)\./u;

const lockSchema = z.object({
  packages: z.array(z.object({ winmds: z.array(z.string()) }))
});

function winmdsOfLock() {
  const lock = lockSchema.parse(JSON.parse(readFileSync(WINAPP_LOCK, "utf8")));
  return lock.packages.flatMap(entry => entry.winmds);
}

function emittedWinmds(winmds: string[]) {
  const xaml = winmds.find(winmd => XAML_WINMD.test(winmd));
  const core = winmds.find(winmd => CORE_WINMD.test(winmd));
  const isComplete = xaml !== undefined && core !== undefined;
  if (!isComplete) {
    throw new Error(`${WINAPP_LOCK} must name Microsoft.UI.Xaml.winmd and Microsoft.Web.WebView2.Core.winmd: run winapp restore`);
  }

  return {
    xaml,
    core
  };
}

function generate({ workFolder, winmds, emitted }: {
  workFolder: string;
  winmds: string[];
  emitted: ReturnType<typeof emittedWinmds>;
}) {
  const emittedList = [emitted.xaml, emitted.core];
  const referenceList = path.join(workFolder, "references.txt");
  writeFileSync(referenceList, winmds.filter(winmd => !emittedList.includes(winmd)).join("\n"));
  const output = path.join(workFolder, "out");
  execFileSync(GENERATOR, [
    "generate",
    "--winmd",
    emittedList.join(";"),
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
    const target = path.join(WINAPP_BINDINGS, relative);
    const isMissing = !isEntryFile && !existsSync(target);
    if (isMissing) {
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(file, target);
      added++;
    }
  }

  return added;
}

// The winmd is in the package's lib folder, the native libraries in its runtimes.
function addNativeLibraries(coreWinmd: string) {
  const packageFolder = path.dirname(path.dirname(coreWinmd));
  let added = 0;
  for (const [architecture, runtimeFolder] of runtimeFolders) {
    const source = path.join(packageFolder, "runtimes", runtimeFolder, "native_uap", NATIVE_LIBRARY);
    const targetFolder = path.join(WINAPP_BINARIES, architecture);
    const isCopyable = existsSync(source) && existsSync(targetFolder);
    if (isCopyable) {
      copyFileSync(source, path.join(targetFolder, NATIVE_LIBRARY));
      added++;
    }
  }

  const hasNone = added === 0;
  if (hasNone) {
    throw new Error(`${NATIVE_LIBRARY} was not found under ${packageFolder} for any architecture in ${WINAPP_BINARIES}: run winapp restore`);
  }

  return added;
}

function run() {
  const workFolder = mkdtempSync(path.join(tmpdir(), "winui-svelte-webview2-"));
  try {
    const winmds = winmdsOfLock();
    const emitted = emittedWinmds(winmds);
    const files = addMissingFiles(
      generate({
        workFolder,
        winmds,
        emitted
      })
    );
    const libraries = addNativeLibraries(emitted.core);
    process.stdout.write(`WebView2: ${files} binding files added, ${NATIVE_LIBRARY} for ${libraries} architectures\n`);
  } finally {
    rmSync(workFolder, {
      recursive: true,
      force: true
    });
  }
}

run();
