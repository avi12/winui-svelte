import { pageText } from "./documentation-page.ts";
import { fallbackSchema, parseDocumentation } from "./documentation.ts";
import type { FallbackSource } from "./documentation.ts";
import { buildExtraModels, buildModel } from "./model.ts";
import type { ClassModel } from "./model.ts";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Fetches, by hand, the documentation the NuGet packages' XML lacks:
//
//   node scripts/codegen/fetch-documentation.ts
//
// For every type, property, event and attached property of the components
// that has no documentation yet, it reads the page Microsoft publishes for it
// and adds the text to documentation-fallback.json, which the generator reads
// as its lowest-priority source (so `pnpm gen:components` stays offline and
// deterministic). A member already in the file is kept; delete its line to
// fetch it again. The sources are pinned to the commit the file records:
//
//   WinUI: MicrosoftDocs/winapps-winrt-api, CC BY 4.0, one Markdown page for
//   each member (microsoft.ui.xaml.controls/titlebar_title.md)
//   Win2D: microsoft/Win2D, MIT, docsrc/<Class>.xml in the XML documentation
//   format of the NuGet packages

const PACKAGE_FOLDER = path.join(import.meta.dirname, "..", "..");
const LOCK_PATH = path.join(PACKAGE_FOLDER, ".winapp", "winmds.lock.json");
const FALLBACK_PATH = path.join(import.meta.dirname, "documentation-fallback.json");
const WIN2D_NAMESPACE = "Microsoft.Graphics.Canvas";
const PARALLEL_REQUESTS = 8;
const INDENT = 2;

const WINUI_SOURCE = {
  name: "WinUI",
  repository: "MicrosoftDocs/winapps-winrt-api",
  branch: "docs",
  license: "CC-BY-4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/"
} as const;
const WIN2D_SOURCE = {
  name: "Win2D",
  repository: "microsoft/Win2D",
  branch: "winappsdk/main",
  license: "MIT",
  licenseUrl: "https://github.com/microsoft/Win2D/blob/winappsdk/main/LICENSE.txt"
} as const;

interface Wanted {
  // Kind, then the dotted full name: P:Microsoft.UI.Xaml.Controls.TitleBar.Title.
  id: string;
  // The page the text is in when the member's own has none (an attached
  // property's identifier, after its getter).
  alternative?: string;
}

function wantedOf(level: ClassModel) {
  const full = `${level.type.namespace}.${level.type.name}`;
  const documentation = level.documentation;
  const members = documentation?.members ?? new Map<string, string>();
  const wanted: Wanted[] = [];
  const hasSummary = documentation?.summary != null;
  if (!hasSummary) {
    wanted.push({ id: `T:${full}` });
  }

  const attachedKeys = new Set(level.attached.map(attached => attached.key));
  const content = level.declaresContent ? level.contentProperty : null;
  const hasContent = content !== null;
  const properties = [
    ...level.properties.map(property => property.winName),
    ...level.observed.map(observed => observed.winName),
    ...level.slots.filter(slot => !attachedKeys.has(slot.key)).map(slot => slot.winName),
    ...hasContent ? [content] : []
  ];
  for (const name of new Set(properties)) {
    if (!members.has(`P:${name}`)) {
      wanted.push({ id: `P:${full}.${name}` });
    }
  }

  for (const event of level.events) {
    if (!members.has(`E:${event.winName}`)) {
      wanted.push({ id: `E:${full}.${event.winName}` });
    }
  }

  for (const attached of level.attached) {
    const isDocumented = attached.documentation !== undefined;
    if (!isDocumented) {
      const owner = `${attached.owner.namespace}.${attached.owner.name}`;
      wanted.push({
        id: `M:${owner}.Get${attached.name}`,
        alternative: `P:${owner}.${attached.name}Property`
      });
    }
  }

  return wanted;
}

async function latestCommit({ repository, branch }: {
  repository: string;
  branch: string;
}) {
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/${branch}`, {
    headers: {
      accept: "application/vnd.github.sha"
    }
  });
  if (!response.ok) {
    throw new Error(`${repository}: no commit for ${branch} (${response.status})`);
  }

  return (await response.text()).trim();
}

async function rawText({ repository, commit, file }: {
  repository: string;
  commit: string;
  file: string;
}) {
  const response = await fetch(`https://raw.githubusercontent.com/${repository}/${commit}/${file}`);
  return response.ok ? response.text() : null;
}

// microsoft.ui.xaml.controls/titlebar_title.md, or titlebar.md for the type.
function winuiPage(id: string) {
  const full = id.slice(2);
  const isType = id.startsWith("T:");
  const split = full.lastIndexOf(".");
  const typeName = isType ? full : full.slice(0, split);
  const typeSplit = typeName.lastIndexOf(".");
  const folder = typeName.slice(0, typeSplit).toLowerCase();
  const type = typeName.slice(typeSplit + 1).toLowerCase();
  return isType ? `${folder}/${type}.md` : `${folder}/${type}_${full.slice(split + 1).toLowerCase()}.md`;
}

async function inBatches<Item, Result>({ items, run }: {
  items: readonly Item[];
  run: (item: Item) => Promise<Result>;
}) {
  const results: Result[] = [];
  for (let start = 0; start < items.length; start += PARALLEL_REQUESTS) {
    results.push(...await Promise.all(items.slice(start, start + PARALLEL_REQUESTS).map(item => run(item))));
  }

  return results;
}

async function fetchWinui({ wanted, commit }: {
  wanted: readonly Wanted[];
  commit: string;
}) {
  const found = new Map<string, string>();
  const missing: string[] = [];
  await inBatches({
    items: wanted,
    async run(entry) {
      for (const id of [entry.id, ...entry.alternative === undefined ? [] : [entry.alternative]]) {
        const markdown = await rawText({
          repository: WINUI_SOURCE.repository,
          commit,
          file: winuiPage(id)
        });
        const text = markdown === null ? "" : pageText(markdown);
        const isFound = text !== "";
        if (isFound) {
          found.set(id, text);
          return;
        }
      }

      missing.push(entry.id);
    }
  });
  return {
    found,
    missing
  };
}

function typeOfId(id: string) {
  const full = id.slice(2);
  return id.startsWith("T:") ? full : full.slice(0, full.lastIndexOf("."));
}

async function fetchWin2d({ wanted, commit }: {
  wanted: readonly Wanted[];
  commit: string;
}) {
  const documented = new Map<string, Map<string, string>>();
  for (const full of new Set(wanted.map(entry => typeOfId(entry.id)))) {
    const xml = await rawText({
      repository: WIN2D_SOURCE.repository,
      commit,
      file: `winrt/docsrc/${full.slice(full.lastIndexOf(".") + 1)}.xml`
    });
    const isMissing = xml === null;
    if (isMissing) {
      continue;
    }

    for (const [name, documentation] of parseDocumentation(xml)) {
      documented.set(
        name, new Map([
          ...documentation.summary === null ? [] : [["T", documentation.summary] as const],
          ...documentation.members
        ])
      );
    }
  }

  const found = new Map<string, string>();
  const missing: string[] = [];
  for (const entry of wanted) {
    const full = entry.id.slice(2);
    const key = entry.id.startsWith("T:") ? "T" : `${entry.id.slice(0, 1)}:${full.slice(full.lastIndexOf(".") + 1)}`;
    const text = documented.get(typeOfId(entry.id))?.get(key);
    const isMissing = text === undefined;
    if (isMissing) {
      missing.push(entry.id);
    } else {
      found.set(entry.id, text);
    }
  }

  return {
    found,
    missing
  };
}

function isWin2d(entry: Wanted) {
  return entry.id.slice(2).startsWith(WIN2D_NAMESPACE);
}

const model = buildModel(LOCK_PATH);
const levels = [model, ...buildExtraModels(LOCK_PATH)].flatMap(entry => entry.classes);
const wantedById = new Map(levels.flatMap(level => wantedOf(level)).map(entry => [entry.id, entry]));
const wanted = [...wantedById.values()];
const existing = fallbackSchema.parse(JSON.parse(readFileSync(FALLBACK_PATH, "utf8")));
const WINUI_COMMIT = existing.sources.find(source => source.name === WINUI_SOURCE.name)?.commit
  ?? await latestCommit(WINUI_SOURCE);
const WIN2D_COMMIT = existing.sources.find(source => source.name === WIN2D_SOURCE.name)?.commit
  ?? await latestCommit(WIN2D_SOURCE);
const winui = await fetchWinui({
  wanted: wanted.filter(entry => !isWin2d(entry)),
  commit: WINUI_COMMIT
});
const win2d = await fetchWin2d({
  wanted: wanted.filter(entry => isWin2d(entry)),
  commit: WIN2D_COMMIT
});
const members: Record<string, string> = { ...existing.members };
for (const [id, text] of [...winui.found, ...win2d.found]) {
  members[id] = text;
}

const sources: FallbackSource[] = [
  {
    ...WINUI_SOURCE,
    commit: WINUI_COMMIT
  },
  {
    ...WIN2D_SOURCE,
    commit: WIN2D_COMMIT
  }
];
const sortedMembers = Object.fromEntries(Object.entries(members).sort(([left], [right]) => left.localeCompare(right)));
writeFileSync(
  FALLBACK_PATH, `${JSON.stringify({
    sources,
    members: sortedMembers
  }, null, INDENT)}\n`
);
const missing = [...winui.missing, ...win2d.missing];
process.stdout.write(`${wanted.length} wanted, ${winui.found.size + win2d.found.size} fetched, ${missing.length} without a page\n${missing.join("\n")}\n`);
