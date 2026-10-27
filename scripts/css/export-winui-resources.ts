import { ResourceKind } from "#src/css/runtime/resources.js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// Writes src/css/winui-resources.g.json: every resource key WinUI's generic.xaml
// defines (colors, brushes, thicknesses, radii, doubles, styles...), by kind,
// so the CSS translation can check a `var(--name)` against what WinUI really
// has, at build time and with no WinUI installed.
//
//   node scripts/css/export-winui-resources.ts [path/to/generic.xaml]
//
// The default is the Windows App SDK WinUI package that .winapp/winmds.lock.json
// (`pnpm restore` writes it) names, from the NuGet cache it lists.

const SOURCE_FOLDER = import.meta.dirname;
const OUTPUT_FILE = path.join(SOURCE_FOLDER, "..", "..", "src", "css", "winui-resources.g.json");
const LOCK_FILE = path.join(SOURCE_FOLDER, "..", "..", ".winapp", "winmds.lock.json");
const WINUI_PACKAGE = "Microsoft.WindowsAppSDK.WinUI";
const GENERIC_XAML_IN_PACKAGE = path.join("lib", "native", "Microsoft.UI", "Themes", "generic.xaml");

// The tag a resource is declared with, and the kind that makes it.
const kindOfTag = new Map<string, ResourceKind>([
  ["SolidColorBrush", ResourceKind.BRUSH],
  ["media:SolidColorBrush", ResourceKind.BRUSH],
  ["AcrylicBrush", ResourceKind.BRUSH],
  ["LinearGradientBrush", ResourceKind.BRUSH],
  ["Color", ResourceKind.COLOR],
  ["Thickness", ResourceKind.THICKNESS],
  ["x:Double", ResourceKind.DOUBLE],
  ["CornerRadius", ResourceKind.CORNER_RADIUS],
  ["FontWeight", ResourceKind.FONT_WEIGHT],
  ["FontFamily", ResourceKind.FONT_FAMILY],
  ["x:String", ResourceKind.STRING],
  ["x:Boolean", ResourceKind.BOOLEAN],
  ["GridLength", ResourceKind.GRID_LENGTH],
  ["StaticResource", ResourceKind.ALIAS],
  ["Style", ResourceKind.STYLE]
]);

// Colors the framework provides to every app, which generic.xaml only refers to.
const frameworkColors = [
  "SystemAccentColor",
  "SystemAccentColorLight1",
  "SystemAccentColorLight2",
  "SystemAccentColorLight3",
  "SystemAccentColorDark1",
  "SystemAccentColorDark2",
  "SystemAccentColorDark3",
  "SystemColorWindowTextColor",
  "SystemColorWindowColor",
  "SystemColorGrayTextColor",
  "SystemColorHighlightTextColor",
  "SystemColorHighlightColor",
  "SystemColorButtonFaceColor",
  "SystemColorButtonTextColor",
  "SystemColorHotlightColor",
  "SystemColorDisabledTextColor"
];

// Code-unit order, so the file does not change with the machine's locale.
function compareKeys({ left, right }: {
  left: string;
  right: string;
}) {
  const isSameKey = left === right;
  if (isSameKey) {
    return 0;
  }

  return left < right ? -1 : 1;
}

const lockFileSchema = z.object({
  packages: z.array(
    z.object({
      name: z.string(),
      version: z.union([z.string(), z.number()])
    })
  ),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the lock file's own key.
  nuget_cache_dir: z.string()
});

function defaultGenericXaml() {
  const parsedLock = lockFileSchema.safeParse(JSON.parse(readFileSync(LOCK_FILE, "utf8")));
  if (!parsedLock.success) {
    throw new TypeError(`${LOCK_FILE} is not a winapp lock file`);
  }

  const { packages, nuget_cache_dir: cacheFolder } = parsedLock.data;
  const winUi = packages.find(candidate => candidate.name === WINUI_PACKAGE);
  const isWinUiMissing = winUi === undefined;
  if (isWinUiMissing) {
    throw new Error(`${LOCK_FILE} names no ${WINUI_PACKAGE}`);
  }

  const version = String(winUi.version);
  return path.join(cacheFolder, WINUI_PACKAGE.toLowerCase(), version, GENERIC_XAML_IN_PACKAGE);
}

const XAML_FILE = process.argv[2] ?? defaultGenericXaml();
const XAML = readFileSync(XAML_FILE, "utf8");
const byKind = new Map<ResourceKind, Set<string>>();
for (const match of XAML.matchAll(/<([\w:]+)\s+x:Key="([^"]+)"/gu)) {
  const kind = kindOfTag.get(match[1] ?? "");
  const key = match[2];
  const isResource = kind !== undefined && key !== undefined;
  if (isResource) {
    const keys = byKind.get(kind) ?? new Set<string>();
    keys.add(key);
    byKind.set(kind, keys);
  }
}

const colors = byKind.get(ResourceKind.COLOR) ?? new Set<string>();
for (const color of frameworkColors) {
  colors.add(color);
}

byKind.set(ResourceKind.COLOR, colors);
const output = Object.fromEntries(
  [...byKind]
    .sort((left, right) => compareKeys({
      left: left[0],
      right: right[0]
    }))
    .map(([kind, keys]) => [kind, [...keys].sort((left, right) => compareKeys({
      left,
      right
    }))])
);
writeFileSync(
  OUTPUT_FILE, `${JSON.stringify({
    source: `${WINUI_PACKAGE} ${/([\d.]+)[\\/]lib[\\/]/u.exec(XAML_FILE)?.[1] ?? "?"}`,
    ...output
  })}\n`
);
process.stdout.write(`${[...byKind].map(([kind, keys]) => `${kind} ${keys.size}`).join(", ")}\n`);
