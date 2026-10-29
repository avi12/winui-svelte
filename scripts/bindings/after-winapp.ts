import { BindingScope, bindingsAfterWinapp, COMPONENT_WINMD, extraPackages } from "#scripts/codegen/tables.ts";
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

// The bindings of the classes winapp's run cannot make, from the packages of
// extraPackages in scripts/codegen/tables.ts: WebView2 (its events name
// Microsoft.Web.WebView2.Core types winapp passes to the code generator neither
// to emit nor to resolve against; the listed classes are bindingsAfterWinapp,
// the swap chain panels among them) and Win2D (every namespace of its winmd).
// This runs the generator for each package with its metadata among the winmds
// to emit, and adds the files winapp's run did not make to .winapp/bindings.
// It also puts a native library winapp restores no more than it passes the
// winmd (Microsoft.Web.WebView2.Core.dll) beside the other restored libraries,
// where the build ships it.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const GENERATOR = path.join(PACKAGE_ROOT, "node_modules", "@microsoft", "dynwinrt-codegen", "bin", process.arch, "dynwinrt-codegen.exe");
const CONTROLS_NAMESPACE = "Microsoft.UI.Xaml.Controls";
const CONTROLS_PREFIX = `${CONTROLS_NAMESPACE}.`;
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

type ExtraPackage = (typeof extraPackages)[number];

// The listed classes are all in the controls namespace, which the generator takes once.
function listedClassNames() {
  return [...bindingsAfterWinapp].map(fullName => {
    const isInControls = fullName.startsWith(CONTROLS_PREFIX);
    if (!isInControls) {
      throw new Error(`${fullName} is not in ${CONTROLS_NAMESPACE}: after-winapp.ts generates one namespace`);
    }

    return fullName.slice(CONTROLS_PREFIX.length);
  });
}

function winmdsOfLock() {
  const lock = lockSchema.parse(JSON.parse(readFileSync(WINAPP_LOCK, "utf8")));
  return lock.packages.flatMap(entry => entry.winmds);
}

function winmdNamed({ winmds, name }: {
  winmds: string[];
  name: string;
}) {
  const found = winmds.find(winmd => path.basename(winmd).toLowerCase() === name.toLowerCase());
  if (found === undefined) {
    throw new Error(`${WINAPP_LOCK} must name ${name}: run winapp restore`);
  }

  return found;
}

function generate({ workFolder, winmds, extra }: {
  workFolder: string;
  winmds: string[];
  extra: ExtraPackage;
}) {
  const isListed = extra.scope === BindingScope.LISTED;
  const emittedList = [winmdNamed({
    winmds,
    name: extra.winmd
  })];
  if (isListed) {
    emittedList.unshift(winmdNamed({
      winmds,
      name: COMPONENT_WINMD
    }));
  }

  const referenceList = path.join(workFolder, `${extra.name}-references.txt`);
  writeFileSync(referenceList, winmds.filter(winmd => !emittedList.includes(winmd)).join("\n"));
  const output = path.join(workFolder, extra.name);
  const scopeArguments = isListed ? ["--namespace", CONTROLS_NAMESPACE, "--class-name", listedClassNames().join(",")] : [];
  execFileSync(GENERATOR, [
    "generate",
    "--winmd",
    emittedList.join(";"),
    "--ref-list",
    referenceList,
    ...scopeArguments,
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
function addNativeLibraries({ winmd, restoredLibrary }: {
  winmd: string;
  restoredLibrary: NonNullable<ExtraPackage["restoredLibrary"]>;
}) {
  const packageFolder = path.dirname(path.dirname(winmd));
  let added = 0;
  for (const [architecture, runtimeFolder] of runtimeFolders) {
    const source = path.join(packageFolder, "runtimes", runtimeFolder, restoredLibrary.runtimeFolder, restoredLibrary.file);
    const targetFolder = path.join(WINAPP_BINARIES, architecture);
    const isCopyable = existsSync(source) && existsSync(targetFolder);
    if (isCopyable) {
      copyFileSync(source, path.join(targetFolder, restoredLibrary.file));
      added++;
    }
  }

  const hasNone = added === 0;
  if (hasNone) {
    throw new Error(`${restoredLibrary.file} was not found under ${packageFolder} for any architecture in ${WINAPP_BINARIES}: run winapp restore`);
  }

  return added;
}

function bindPackage({ workFolder, winmds, extra }: {
  workFolder: string;
  winmds: string[];
  extra: ExtraPackage;
}) {
  const files = addMissingFiles(
    generate({
      workFolder,
      winmds,
      extra
    })
  );
  const { restoredLibrary } = extra;
  const libraries = restoredLibrary === undefined ? 0 : addNativeLibraries({
    winmd: winmdNamed({
      winmds,
      name: extra.winmd
    }),
    restoredLibrary
  });
  process.stdout.write(`${extra.name}: ${files} binding files added, ${libraries} native libraries copied
`);
}

function run() {
  const workFolder = mkdtempSync(path.join(tmpdir(), "winui-svelte-extra-"));
  try {
    const winmds = winmdsOfLock();
    for (const extra of extraPackages) {
      bindPackage({
        workFolder,
        winmds,
        extra
      });
    }
  } finally {
    rmSync(workFolder, {
      recursive: true,
      force: true
    });
  }
}

run();
