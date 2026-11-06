import { sourceProgram } from "./source-program.ts";
import path from "node:path";
import typescript from "typescript";

// Every closed set `winui-svelte/enums` exports, a WinUI enum or a package's
// `as const` object: its members with their value and the first sentence of
// the documentation they carry.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const ENUMS_FILE = path.join(PACKAGE_ROOT, "src", "enums.ts");
// The theme brushes are completed as the resources a `var(--name)` names.
const LEFT_OUT = new Set(["ThemeBrush"]);
const SENTENCE_END = /(?<=[.!?])\s/u;

function firstSentence(text: string) {
  const oneLine = text.replaceAll(/\s+/gu, " ").trim();
  return oneLine.split(SENTENCE_END)[0] ?? "";
}

function literalValueOf(type: typescript.Type) {
  const isLiteral = type.isStringLiteral() || type.isNumberLiteral();
  return isLiteral ? type.value : undefined;
}

function memberOf({ checker, symbol }: {
  checker: typescript.TypeChecker;
  symbol: typescript.Symbol;
}) {
  const value = literalValueOf(checker.getTypeOfSymbol(symbol));
  const hasNoValue = value === undefined;
  if (hasNoValue) {
    return [];
  }

  const description = firstSentence(typescript.displayPartsToString(symbol.getDocumentationComment(checker)));
  return [{
    name: symbol.name,
    value,
    ...description !== "" && {
      description
    }
  }];
}

/** The closed sets of `winui-svelte/enums`, each with its members in the order they are declared. */
export function enumData() {
  const program = sourceProgram([ENUMS_FILE]);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(ENUMS_FILE);
  const module = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  const isModule = module !== undefined;
  if (!isModule) {
    throw new Error(`${ENUMS_FILE} is not a module`);
  }

  return checker.getExportsOfModule(module).flatMap(exported => {
    const symbol = exported.flags & typescript.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const isVariable = (symbol.flags & typescript.SymbolFlags.Variable) !== 0;
    const isSet = isVariable && !LEFT_OUT.has(exported.name);
    if (!isSet) {
      return [];
    }

    const members = checker.getPropertiesOfType(checker.getTypeOfSymbol(symbol)).flatMap(member => memberOf({
      checker,
      symbol: member
    }));
    const hasMembers = members.length > 0;
    return hasMembers ? [{
      name: exported.name,
      isNumeric: typeof members[0]?.value === "number",
      members
    }] : [];
  });
}
