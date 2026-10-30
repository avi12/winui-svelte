import { packageJsonWithBindings } from "./binding-list.ts";
import {
  bindingModule,
  emitBindings,
  emitComponent,
  emitControlsTable,
  emitDeclaration,
  emitEnums,
  emitThemeBrushes,
  emitIndex,
  emitLevel,
  emitMetadata,
  emitStrictness
} from "./emit.ts";
import { bindingClasses, buildExtraModels, buildModel, requestedClasses } from "./model.ts";
import type { Model } from "./model.ts";
import type { TypeName } from "./winmd.ts";
import { filesIn } from "#scripts/files-in.ts";
import { ResourceKind } from "#src/css/runtime/resources.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

// Generates the components from WinUI's metadata:
//
//   node scripts/codegen/generate.ts [--project <folder>] [--check]
//
// The project is the folder `winapp restore` was run in (this repository by
// default): its .winapp/winmds.lock.json says where the metadata is, and its
// package.json lists the classes the bindings are generated for (the generator
// adds the ones the components need). --check writes nothing and fails when a
// file differs from what would be written, as the lint gate does.

const PACKAGE_FOLDER = path.join(import.meta.dirname, "..", "..");
const GENERATED_FOLDER = path.join(PACKAGE_FOLDER, "src", "components", "generated");
const LOCK_PATH = [".winapp", "winmds.lock.json"];
const BINDINGS_PATH = [".winapp", "bindings"];

interface OutputFile {
  file: string;
  text: string;
}

function updatedPackageJson({ packagePath, wanted }: {
  packagePath: string;
  wanted: TypeName[];
}) {
  return {
    file: packagePath,
    text: packageJsonWithBindings({
      original: readFileSync(packagePath, "utf8"),
      wanted
    })
  };
}

// What the README holds that comes from elsewhere, between a pair of markers
// each: `<!-- controls:start -->` ... `<!-- controls:end -->`.
interface ReadmeBlock {
  name: string;
  body: string;
}

// The hello example's files, which the quick start shows as they are.
const quickStartFiles = ["vite.config.ts", "App.svelte", "window.ts", "main.ts"];

function exampleBlock(name: string) {
  const source = readFileSync(path.join(PACKAGE_FOLDER, "examples", "hello", name), "utf8");
  const language = path.extname(name).slice(1);
  return {
    name: `hello/${name}`,
    body: `\`\`\`${language}\n${normalized(source).trimEnd()}\n\`\`\``
  };
}

// README.md with each block's body between its markers.
function updatedReadme(blocks: ReadmeBlock[]) {
  const file = path.join(PACKAGE_FOLDER, "README.md");
  const original = readFileSync(file, "utf8");
  let text = normalized(original);
  for (const block of blocks) {
    const start = `<!-- ${block.name}:start -->`;
    const end = `<!-- ${block.name}:end -->`;
    const startAt = text.indexOf(start);
    const endAt = text.indexOf(end);
    const hasMarkers = startAt >= 0 && endAt > startAt;
    if (!hasMarkers) {
      throw new Error(`${file} needs ${start} and ${end}`);
    }

    text = `${text.slice(0, startAt + start.length)}\n\n${block.body}\n\n${text.slice(endAt)}`;
  }

  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  return {
    file,
    text: text.replaceAll("\n", newline)
  };
}

// The files of one model: the WinUI components in the generated folder
// itself, an extra package's in the folder of its own (src/components/
// generated/win2d, the subpath export `winui-svelte/win2d`).
function modelFiles(model: Model) {
  const folder = path.join(GENERATED_FOLDER, model.folder);
  const output: OutputFile[] = [
    {
      file: path.join(folder, "bindings.ts"),
      text: emitBindings(model)
    },
    {
      file: path.join(folder, "index.ts"),
      text: emitIndex(model)
    },
    {
      file: path.join(folder, "props-strictness.ts"),
      text: emitStrictness(model)
    }
  ];
  const isWinUi = model.folder === "";
  if (isWinUi) {
    output.push({
      file: path.join(folder, "metadata.ts"),
      text: emitMetadata(model)
    }, {
      file: path.join(folder, "enums.ts"),
      text: emitEnums(model)
    }, {
      file: path.join(folder, "theme-brushes.ts"),
      text: emitThemeBrushes(loadWinuiCatalogue().keysOfKind(ResourceKind.BRUSH))
    });
  }

  for (const level of model.classes) {
    const name = level.type.name;
    output.push({
      file: path.join(folder, "controls", `${name}.svelte.ts`),
      text: emitLevel(level)
    });

    if (level.isComponent) {
      output.push(
        {
          file: path.join(folder, `${name}.svelte`),
          text: emitComponent(level)
        },
        {
          file: path.join(folder, `${name}.d.svelte.ts`),
          text: emitDeclaration(level)
        }
      );
    }
  }

  return output;
}

function generatedFiles(project: string) {
  const lockPath = path.join(project, ...LOCK_PATH);
  const model = buildModel(lockPath);
  const extraModels = buildExtraModels(lockPath);
  const output = [model, ...extraModels].flatMap(modelFiles);
  output.push(
    updatedReadme([
      {
        name: "controls",
        body: emitControlsTable({
          ...model,
          classes: [...model.classes, ...extraModels.flatMap(extra => extra.classes)]
        })
      },
      ...quickStartFiles.map(exampleBlock)
    ])
  );
  output.push(
    updatedPackageJson({
      packagePath: path.join(project, "package.json"),
      wanted: requestedClasses(model)
    })
  );
  reportMissingBindings({
    project,
    wanted: [model, ...extraModels].flatMap(entry => bindingClasses(entry))
  });
  return output;
}

// After `pnpm bindings`, a class the components import that the bindings do
// not hold would fail only when the window loads: say so now.
function reportMissingBindings({ project, wanted }: {
  project: string;
  wanted: TypeName[];
}) {
  const folder = path.join(project, ...BINDINGS_PATH);
  const hasBindings = existsSync(folder);
  if (!hasBindings) {
    return;
  }

  const missing = wanted.filter(type => {
    const module = bindingModule(type).replace("#winui", folder);
    return !existsSync(`${module}.js`);
  });
  const hasMissing = missing.length > 0;
  if (hasMissing) {
    process.stderr.write(`bindings missing for ${missing.map(type => type.name).join(", ")}; run pnpm bindings\n`);
  }
}

function normalized(text: string) {
  return text.replaceAll("\r\n", "\n");
}

const { values } = parseArgs({
  options: {
    project: {
      type: "string"
    },
    check: {
      type: "boolean"
    }
  }
});
const PROJECT_FOLDER = path.resolve(values.project ?? PACKAGE_FOLDER);
const output = generatedFiles(PROJECT_FOLDER);
const wanted = new Set(output.map(entry => entry.file));
const stale = filesIn(GENERATED_FOLDER).filter(file => !wanted.has(file));
const differing = output.filter(entry => {
  const isPresent = existsSync(entry.file);
  if (!isPresent) {
    return true;
  }

  return normalized(readFileSync(entry.file, "utf8")) !== normalized(entry.text);
});
const IS_CHECK = values.check === true;
if (IS_CHECK) {
  const problems = [...differing.map(entry => entry.file), ...stale];
  const hasProblems = problems.length > 0;
  if (hasProblems) {
    process.stderr.write(`the generated components are stale; run pnpm gen:components\n${problems.join("\n")}\n`);
    process.exitCode = 1;
  }
} else {
  for (const entry of differing) {
    mkdirSync(path.dirname(entry.file), { recursive: true });
    writeFileSync(entry.file, entry.text);
  }

  for (const file of stale) {
    rmSync(file);
  }

  process.stdout.write(`${output.length} files, ${differing.length} written, ${stale.length} removed\n`);
}
