import { mergedEntries } from "./binding-list.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");

const packageSchema = z.object({
  winapp: z.object({
    jsBindings: z.object({
      additionalWinmds: z.array(
        z.object({
          namespace: z.string(),
          classes: z.array(z.string()).optional()
        })
      )
    })
  })
});

// A namespace is a folder in the bindings: dotted, and kebab-case where a part
// has two words (Windows.UI.ViewManagement is windows/ui/view-management).
function folderOf(namespace: string) {
  return namespace.split(".").map(part => part.replace(/([a-z\d])([A-Z])/gu, "$1-$2").toLowerCase()).join("/");
}

function listedModules() {
  const manifest = packageSchema.parse(JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")));
  const names = manifest.winapp.jsBindings.additionalWinmds.flatMap(
    entry => (entry.classes ?? []).map(name => `${folderOf(entry.namespace)}/${name.toLowerCase()}`)
  );
  return new Set(names);
}

// src/winui.ts is the package's one import site of the bindings, which are
// generated from this list (`pnpm bindings`) and shipped in dist/bindings. A
// class added there goes in `coreClasses` of tables.ts, and
// `pnpm gen:components` lists it.
test("every class src/winui.ts imports is among the classes the bindings are generated for", () => {
  const source = readFileSync(path.join(PACKAGE_ROOT, "src", "winui.ts"), "utf8");
  const modules = [...source.matchAll(/"#winui\/([^"]+)"/gu)].map(match => match[1]?.toLowerCase());
  // Not metadata classes: the enums that arrive with the classes that name
  // them, and the generated bindings' own lifetime helper.
  const exempt = new Set([
    "microsoft/windows/app-lifecycle/extendedactivationkind",
    "microsoft/ui/xaml/gridunittype",
    "microsoft/ui/xaml/windowactivationstate",
    "microsoft/ui/windowing/displayareafallback",
    "microsoft/ui/windowing/appwindowpresenterkind",
    "microsoft/ui/windowing/titlebarheightoption",
    "microsoft/ui/windowing/iconshowoptions",
    "microsoft/ui/windowing/titlebartheme",
    "microsoft/ui/input/nonclientregionkind",
    "microsoft/ui/xaml/elementtheme",
    "microsoft/ui/xaml/controls/scrollbarvisibility",
    "microsoft/ui/xaml/controls/scrollmode",
    "microsoft/ui/xaml/focusstate",
    "windows/ui/view-management/uicolortype",
    "microsoft/windows/storage/pickers/pickerlocationid",
    "microsoft/ui/composition/system-backdrops/micakind",
    "microsoft/ui/composition/system-backdrops/desktopacrylickind",
    "microsoft/ui/composition/system-backdrops/systembackdroptheme",
    "microsoft/ui/composition/icompositionsupportssystembackdrop",
    "microsoft/windows/app-notifications/builder/appnotificationbuttonstyle",
    "microsoft/windows/app-notifications/builder/appnotificationscenario",
    "microsoft/windows/app-notifications/builder/appnotificationsoundevent",
    "microsoft/windows/app-notifications/appnotificationprogressdata",
    "microsoft/windows/app-notifications/appnotificationprogressresult",
    "microsoft/windows/app-notifications/appnotificationsetting",
    "lifetime"
  ]);
  const listed = listedModules();
  const missing = modules.filter(module => module !== undefined && !listed.has(module) && !exempt.has(module));
  assert.deepEqual(missing, []);
});

test("mergedEntries sorts by namespace and keeps whole-namespace entries", () => {
  const merged = mergedEntries({
    existing: [{ namespace: "Windows.Storage" }],
    wanted: [
      {
        namespace: "Microsoft.UI.Xaml",
        name: "Window"
      }
    ]
  });
  assert.deepEqual(merged.map(entry => entry.namespace), ["Microsoft.UI.Xaml", "Windows.Storage"]);
});

test("mergedEntries lists the system backdrops last, which winapp's incremental run needs", () => {
  const merged = mergedEntries({
    existing: [],
    wanted: [
      {
        namespace: "Microsoft.UI.Composition.SystemBackdrops",
        name: "MicaController"
      },
      {
        namespace: "Microsoft.UI.Dispatching",
        name: "DispatcherQueue"
      },
      {
        namespace: "Microsoft.UI.Xaml",
        name: "Window"
      }
    ]
  });
  assert.deepEqual(merged.map(entry => entry.namespace), [
    "Microsoft.UI.Dispatching",
    "Microsoft.UI.Xaml",
    "Microsoft.UI.Composition.SystemBackdrops"
  ]);
});
