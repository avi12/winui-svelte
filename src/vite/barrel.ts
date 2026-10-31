import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { z } from "zod";

/**
 * In `serve`, a named import from a package barrel loads the module that
 * declares the name, not every module the barrel re-exports. The window's
 * module runner awaits each import in turn, so `import { Button } from
 * "winui-svelte/components"` otherwise costs a round trip to the dev server
 * for each of the six hundred controls, used or not.
 */
const BARREL_PLUGIN_NAME = "winui-svelte:barrel";
const BARRELS = new Set(["winui-svelte/components"]);
const SERVE_COMMAND = "serve";
const MODULE_EXTENSION = /[.](?:[cm]?[jt]s|svelte)$/u;
const QUERY_OR_HASH = /[?#].*$/u;

const nameSchema = z.looseObject({
  name: z.string().optional(),
  value: z.string().optional()
});
const specifierSchema = z.looseObject({
  type: z.string(),
  local: z.looseObject({ name: z.string() }),
  imported: nameSchema.optional(),
  exported: nameSchema.optional()
});
const statementSchema = z.looseObject({
  type: z.string(),
  start: z.number(),
  end: z.number(),
  source: z.looseObject({ value: z.string() }).nullish(),
  specifiers: z.array(specifierSchema).optional(),
  declaration: z.looseObject({
    id: z.looseObject({ name: z.string() }).optional(),
    declarations: z.array(z.looseObject({ id: nameSchema })).optional()
  }).nullish()
});
const programSchema = z.looseObject({ body: z.array(statementSchema) });

type Statement = z.infer<typeof statementSchema>;
type Specifier = z.infer<typeof specifierSchema>;

/** Where a name is declared: the module, and the name it has there (`default` for a component). */
interface Origin {
  file: string;
  name: string;
}

type Parse = (code: string) => unknown;
type Origins = Map<string, Origin>;

function nameOf(node: {
  name?: string | undefined;
  value?: string | undefined;
} | undefined) {
  return node?.name ?? node?.value;
}

function declaredNames(statement: Statement) {
  const declaration = statement.declaration;
  const names = declaration?.id === undefined ? [] : [declaration.id.name];
  const variables = (declaration?.declarations ?? []).map(variable => variable.id.name);
  return [...names, ...variables].filter(name => name !== undefined);
}

function sourceFileOf({ importer, source }: {
  importer: string;
  source: string;
}) {
  const direct = path.resolve(path.dirname(importer), source);
  return existsSync(direct) ? direct : direct.replace(/\.js$/u, ".ts");
}

function exportedAs(specifier: Specifier) {
  return nameOf(specifier.exported) ?? specifier.local.name;
}

function addStatement({ origins, statement, file, parse, known }: {
  origins: Origins;
  statement: Statement;
  file: string;
  parse: Parse;
  known: Map<string, Origins>;
}) {
  const source = statement.source?.value;
  const target = source === undefined ? file : sourceFileOf({
    importer: file,
    source
  });
  const isExportAll = statement.type === "ExportAllDeclaration";
  if (isExportAll) {
    for (const [name, origin] of originsOf({
      file: target,
      parse,
      known
    })) {
      origins.set(name, origin);
    }
  }

  const isNamedExport = statement.type === "ExportNamedDeclaration";
  if (!isNamedExport) {
    return;
  }

  for (const specifier of statement.specifiers ?? []) {
    origins.set(exportedAs(specifier), {
      file: target,
      name: specifier.local.name
    });
  }

  for (const name of declaredNames(statement)) {
    origins.set(name, {
      file,
      name
    });
  }
}

/**
 * The names a module exports and where each is declared, following the
 * `export * from` and `export { a as b } from` of a barrel to the modules
 * that declare them. A name the module declares itself is its own origin.
 */
function originsOf({ file, parse, known }: {
  file: string;
  parse: Parse;
  known: Map<string, Origins>;
}) {
  const cached = known.get(file);
  const isKnown = cached !== undefined;
  if (isKnown) {
    return cached;
  }

  const origins: Origins = new Map();
  known.set(file, origins);
  const program = programSchema.parse(parse(readFileSync(file, "utf8")));
  for (const statement of program.body) {
    addStatement({
      origins,
      statement,
      file,
      parse,
      known
    });
  }

  return origins;
}

function importLine({ file, specifiers }: {
  file: string;
  specifiers: string[];
}) {
  return `import { ${specifiers.join(", ")} } from ${JSON.stringify(file.replaceAll("\\", "/"))};`;
}

// The import of a barrel as imports of the modules that declare its names;
// null when it cannot be told name by name (a namespace or default import, or
// a name the barrel does not export).
function flattened({ statement, origins }: {
  statement: Statement;
  origins: Origins;
}) {
  const grouped = new Map<string, string[]>();
  for (const specifier of statement.specifiers ?? []) {
    const origin = origins.get(nameOf(specifier.imported) ?? "");
    const isFlat = specifier.type === "ImportSpecifier" && origin !== undefined;
    if (!isFlat) {
      return null;
    }

    const alias = origin.name === specifier.local.name ? origin.name : `${origin.name} as ${specifier.local.name}`;
    grouped.set(origin.file, [...grouped.get(origin.file) ?? [], alias]);
  }

  return [...grouped].map(([file, specifiers]) => importLine({
    file,
    specifiers
  })).join(" ");
}

/**
 * The Vite plugin that does it, for the barrels the package names. Put last,
 * so it reads the JavaScript the other plugins made.
 */
export function barrelImports() {
  let isServing = false;
  const known = new Map<string, Origins>();
  return {
    name: BARREL_PLUGIN_NAME,
    enforce: "post",
    configResolved(config) {
      isServing = config.command === SERVE_COMMAND;
    },
    buildStart() {
      known.clear();
    },
    async transform(code, id) {
      const isCandidate = isServing && MODULE_EXTENSION.test(id.replace(QUERY_OR_HASH, ""));
      const isBarrelMentioned = isCandidate && [...BARRELS].some(barrel => code.includes(barrel));
      if (!isBarrelMentioned) {
        return null;
      }

      const program = programSchema.parse(this.parse(code));
      let result = code;
      let isChanged = false;
      for (const statement of [...program.body].reverse()) {
        const barrel = statement.type === "ImportDeclaration" ? statement.source?.value : undefined;
        const isBarrelImport = barrel !== undefined && BARRELS.has(barrel);
        if (!isBarrelImport) {
          continue;
        }

        const resolved = await this.resolve(barrel, id, { skipSelf: true });
        const barrelFile = resolved?.id.replace(QUERY_OR_HASH, "");
        const isUnresolved = barrelFile === undefined;
        if (isUnresolved) {
          continue;
        }

        const lines = flattened({
          statement,
          origins: originsOf({
            file: barrelFile,
            parse: source => this.parse(source),
            known
          })
        });
        const isUnflattenable = lines === null;
        if (isUnflattenable) {
          continue;
        }

        const newlines = result.slice(statement.start, statement.end).replaceAll(/[^\n]/gu, "");
        result = `${result.slice(0, statement.start)}${lines}${newlines}${result.slice(statement.end)}`;
        isChanged = true;
      }

      return isChanged ? {
        code: result,
        map: null
      } : null;
    }
  } satisfies Plugin;
}
