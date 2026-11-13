import { sourceProgram } from "./source-program.ts";
import { exportEntries, ExportTarget } from "#scripts/export-aliases.ts";
import { readdirSync } from "node:fs";
import path from "node:path";
import typescript from "typescript";

// What an app writes in a template that no component prop names: the helpers
// that go after `{@attach ...}` (every exported function whose `@returns` says
// "the attachment to put after `@attach`") and the web event names an
// `enable...` function wires to controls (`ondrop`), both read from the
// sources of the entry points package.json lists.

const SOURCE_FOLDER = path.join(import.meta.dirname, "..", "..", "src").replaceAll("\\", "/");
const COMPONENT_DECLARATION = ".d.svelte.ts";
const ATTACH_TAG = /put after\s+`?@attach`?/iu;
const SENTENCE_END = /(?<=[.!?])\s/u;
const EVENT_ADAPTERS_SET = "eventAdapters.set(";
const OBJECT_VALUES = "Object.values";

export interface EntryApi {
  program: typescript.Program;
  checker: typescript.TypeChecker;
  exports: {
    specifier: string;
    name: string;
    symbol: typescript.Symbol;
  }[];
}

// The props of a component are declared in its `.d.svelte.ts`, which no entry point imports as a file.
function componentDeclarations() {
  return readdirSync(SOURCE_FOLDER, {
    recursive: true,
    encoding: "utf8"
  })
    .filter(file => file.endsWith(COMPONENT_DECLARATION))
    .map(file => path.join(SOURCE_FOLDER, file));
}

function firstSentence(text: string) {
  return text.replaceAll(/\s+/gu, " ").trim().split(SENTENCE_END)[0] ?? "";
}

function resolvedSymbol({ checker, symbol }: {
  checker: typescript.TypeChecker;
  symbol: typescript.Symbol;
}) {
  const isAlias = (symbol.flags & typescript.SymbolFlags.Alias) !== 0;
  return isAlias ? checker.getAliasedSymbol(symbol) : symbol;
}

/** The program over the entry points of package.json, and what each one exports. */
export function entryApi() {
  const entries = exportEntries(ExportTarget.SOURCE);
  const program = sourceProgram([...entries.map(entry => entry.file), ...componentDeclarations()]);
  const checker = program.getTypeChecker();
  const exports = entries.flatMap(({ specifier, file }) => {
    const source = program.getSourceFile(file);
    const module = source === undefined ? undefined : checker.getSymbolAtLocation(source);
    const exported = module === undefined ? [] : checker.getExportsOfModule(module);
    return exported.map(symbol => ({
      specifier,
      name: symbol.name,
      symbol: resolvedSymbol({
        checker,
        symbol
      })
    }));
  });
  return {
    program,
    checker,
    exports
  } satisfies EntryApi;
}

function isAttachmentHelper(declaration: typescript.Declaration) {
  const isFunction = typescript.isFunctionDeclaration(declaration);
  return isFunction && typescript.getJSDocTags(declaration).some(tag => {
    const isReturns = tag.tagName.text === "returns";
    return isReturns && ATTACH_TAG.test(typescript.getTextOfJSDocComment(tag.comment) ?? "");
  });
}

/** The `@attach` helpers the entry points export, with the entry point to import each from. */
export function attachmentData({ checker, exports }: EntryApi) {
  return exports.flatMap(({ specifier, name, symbol }) => {
    const isHelper = symbol.declarations?.some(isAttachmentHelper) === true;
    return isHelper ? [{
      name,
      module: specifier,
      description: firstSentence(typescript.displayPartsToString(symbol.getDocumentationComment(checker)))
    }] : [];
  });
}

function containsAdapterRegistration(node: typescript.Node) {
  return node.getText().includes(EVENT_ADAPTERS_SET);
}

// `for (const type of Object.values(Set)) { eventAdapters.set(type, ...) }`: the Set expression.
function wiredSetOf(node: typescript.Node) {
  const isLoop = typescript.isForOfStatement(node);
  if (!isLoop) {
    return undefined;
  }

  const { expression } = node;
  const isValuesCall = typescript.isCallExpression(expression) && expression.expression.getText() === OBJECT_VALUES;
  const isWiring = isValuesCall && containsAdapterRegistration(node.statement);
  return isWiring ? expression.arguments[0] : undefined;
}

function enclosingFunctionName(node: typescript.Node) {
  for (let parent = node.parent; !typescript.isSourceFile(parent); parent = parent.parent) {
    if (typescript.isFunctionDeclaration(parent)) {
      return parent.name?.text;
    }
  }

  return undefined;
}

function wiredEventsIn({ source, checker }: {
  source: typescript.SourceFile;
  checker: typescript.TypeChecker;
}) {
  const found: {
    name: string;
    enabledBy: string;
    description: string;
  }[] = [];
  function visit(node: typescript.Node) {
    const set = wiredSetOf(node);
    const enabledBy = set === undefined ? undefined : enclosingFunctionName(node);
    const isWiring = set !== undefined && enabledBy !== undefined;
    if (isWiring) {
      const symbol = checker.getSymbolAtLocation(set);
      const description = symbol === undefined ? "" : typescript.displayPartsToString(
        resolvedSymbol({
          checker,
          symbol
        }).getDocumentationComment(checker)
      );
      for (const member of checker.getPropertiesOfType(checker.getTypeAtLocation(set))) {
        found.push({
          name: member.name,
          enabledBy,
          description: firstSentence(description)
        });
      }
    }

    node.forEachChild(visit);
  }

  visit(source);
  return found;
}

/** The web event names an exported function wires to controls, with the entry point it is imported from. */
export function webEventData({ program, checker, exports }: EntryApi) {
  const modules = new Map(exports.map(({ specifier, name }) => [name, specifier]));
  const sources = program.getSourceFiles().filter(source => source.fileName.startsWith(SOURCE_FOLDER));
  return sources.flatMap(source => wiredEventsIn({
    source,
    checker
  }).flatMap(event => {
    const module = modules.get(event.enabledBy);
    return module === undefined ? [] : [{
      ...event,
      module
    }];
  }));
}
