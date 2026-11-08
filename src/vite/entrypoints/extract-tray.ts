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

function callOptionsOf(call: Node | undefined) {
  const isDefine = call?.type === "CallExpression" && nodeOf(call["callee"])?.["name"] === DEFINE_FUNCTION;
  const [options] = isDefine ? nodesOf(call["arguments"]) : [];
  const isObject = options?.type === "ObjectExpression";
  if (!isObject) {
    throw new Error(
      `the tray entrypoint must be \`export default ${DEFINE_FUNCTION}({ ... })\`, or an array of them, with object literals`
    );
  }

  return options;
}

function optionsOf(source: string) {
  const program = parseAst(source, { lang: "ts" });
  const exported = program.body.filter(isNode).find(statement => statement.type === "ExportDefaultDeclaration");
  const declaration = nodeOf(exported?.["declaration"]);
  const isList = declaration?.type === "ArrayExpression";
  const calls = isList ? nodesOf(declaration["elements"]) : [declaration];
  return calls.map(callOptionsOf);
}

function manifestOf(options: Node) {
  const literals = new Map<string, string>();
  for (const property of nodesOf(options["properties"])) {
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

/**
 * Reads `icon`, `tooltip` and `guid` from the literal properties of each
 * `defineTray({ ... })` a tray entrypoint default-exports (one call, or an
 * array of them), without running it.
 *
 * @param source - The text of `entrypoints/tray.ts`.
 * @returns The manifest of each tray, in the order of the file.
 * @throws {Error} When the file is not that shape, an `icon` or `guid` is not a literal, or a `guid` repeats.
 */
export function extractTrayManifests(source: string) {
  const trays = optionsOf(source).map(manifestOf);
  const isEmpty = trays.length === 0;
  if (isEmpty) {
    throw new Error("the tray entrypoint's array must hold at least one defineTray");
  }

  const guids = trays.map(tray => tray.guid);
  const duplicate = guids.find((guid, index) => guids.indexOf(guid) !== index);
  const hasDuplicate = duplicate !== undefined;
  if (hasDuplicate) {
    throw new Error(`two trays of the entrypoint have the guid "${duplicate}"; a guid keeps one icon's place`);
  }

  return trays;
}
