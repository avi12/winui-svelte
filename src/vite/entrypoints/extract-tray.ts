import { parseTrayManifest } from "#src/tray/tray-manifest.js";
import { parseAst } from "vite";

// Reads the source as text and walks the syntax tree: nothing of the file runs,
// so a top-level import of WinRT in tray.ts never executes at build.
type Node = Readonly<Record<string, unknown>> & { readonly type: string };

const DEFINE_FUNCTION = "defineTray";

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}

function nodeOf(value: unknown) {
  return isNode(value) ? value : undefined;
}

function nodesOf(value: unknown) {
  return Array.isArray(value) ? value.filter(isNode) : [];
}

function cookedTextOf(node: Node) {
  const [quasi, ...rest] = nodesOf(node["quasis"]);
  const cooked = quasi?.["value"];
  const isPlainTemplate = node.type === "TemplateLiteral" && rest.length === 0;
  const hasCooked = isPlainTemplate && typeof cooked === "object" && cooked !== null && "cooked" in cooked;
  if (!hasCooked) {
    return undefined;
  }

  return typeof cooked.cooked === "string" ? cooked.cooked : undefined;
}

function stringOf(node: Node | undefined) {
  const value = node?.["value"];
  const isLiteral = node?.type === "Literal" && typeof value === "string";
  if (isLiteral) {
    return value;
  }

  return node && cookedTextOf(node);
}

function keyNameOf(property: Node) {
  const key = nodeOf(property["key"]);
  const isPlain = property.type === "Property" && property["computed"] !== true && key !== undefined;
  if (!isPlain) {
    return undefined;
  }

  return key.type === "Identifier" ? String(key["name"]) : stringOf(key);
}

function optionsOf(source: string) {
  const program = parseAst(source, { lang: "ts" });
  const exported = program.body.filter(isNode).find(statement => statement.type === "ExportDefaultDeclaration");
  const call = nodeOf(exported?.["declaration"]);
  const isDefine = call?.type === "CallExpression" && nodeOf(call["callee"])?.["name"] === DEFINE_FUNCTION;
  const [options] = isDefine ? nodesOf(call["arguments"]) : [];
  const isObject = options?.type === "ObjectExpression";
  if (!isObject) {
    throw new Error(`the tray entrypoint must be \`export default ${DEFINE_FUNCTION}({ ... })\` with an object literal`);
  }

  return options;
}

/**
 * Reads `icon`, `tooltip` and `guid` from the literal properties of the
 * `defineTray({ ... })` a tray entrypoint default-exports, without running it.
 *
 * @param source - The text of `entrypoints/tray.ts`.
 * @returns The manifest.
 * @throws {Error} When the file is not that shape, or `icon` or `guid` is not a string literal.
 */
export function extractTrayManifest(source: string) {
  const literals = new Map<string, string>();
  for (const property of nodesOf(optionsOf(source)["properties"])) {
    const name = keyNameOf(property);
    const value = nodeOf(property["value"]);
    const text = stringOf(value);
    const isLiteral = name !== undefined && text !== undefined;
    if (isLiteral) {
      literals.set(name, text);
    }
  }

  const tooltip = literals.get("tooltip");
  const manifest = {
    icon: literals.get("icon"),
    guid: literals.get("guid"),
    ...tooltip === undefined ? {} : { tooltip }
  };
  try {
    return parseTrayManifest(manifest);
  } catch {
    throw new Error("the tray entrypoint's `icon` and `guid` must be string literals (the build reads them without running the file)");
  }
}
