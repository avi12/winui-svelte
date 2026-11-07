import { arrayOf, isMenuComponent, MenuComponent } from "./lower-menu-markup.ts";
import { spanOf } from "./node-span.ts";
import { TraySvelteError } from "./tray-svelte-error.ts";
import { parse } from "svelte/compiler";
import type { AST } from "svelte/compiler";

const MENU_COMPONENTS_MODULE = "winui-svelte/tray/menu/svelte";

const OPTIONS_EXPORT = "options";

const STANDALONE_MODULE = "winui-svelte/tray/standalone";
const KIND_NAME = "LoweredMenuItemKind";
const RUNES = new Set(["$state", "$derived", "$effect", "$props", "$bindable", "$inspect", "$host"]);
const RUNE_REASON = "the menu is read each time it opens, so a plain `let` is always current and nothing needs to be reactive; use a variable and a function that changes it";
const TYPE_WRAPPERS = new Set(["TSSatisfiesExpression", "TSAsExpression"]);

type Statement = AST.Script["content"]["body"][number];
type ImportSpecifier = Extract<Statement, { type: "ImportDeclaration" }>["specifiers"][number];

interface Source {
  readonly text: string;
  readonly file: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function errorAt({ source, offset, construct, reason }: {
  source: Source;
  offset: number;
  construct: string;
  reason: string;
}) {
  return new TraySvelteError({
    file: source.file,
    source: source.text,
    offset,
    construct,
    reason
  });
}

interface FoundRune {
  readonly name: string;
  readonly start: number;
}

// eslint-disable-next-line no-restricted-syntax -- a recursive function needs its return type written
function findRune(node: unknown): FoundRune | undefined {
  if (Array.isArray(node)) {
    return node.map(findRune).find(found => found !== undefined);
  }

  if (!isRecord(node)) {
    return undefined;
  }

  const { type, name, start } = node;
  const isRune = type === "Identifier" && typeof name === "string" && RUNES.has(name) && typeof start === "number";
  if (isRune) {
    return {
      name,
      start
    };
  }

  return Object.values(node).map(findRune).find(found => found !== undefined);
}

function importedNameOf(specifier: ImportSpecifier) {
  const isOtherKind = specifier.type !== "ImportSpecifier";
  if (isOtherKind) {
    return undefined;
  }

  const { imported } = specifier;
  return imported.type === "Identifier" ? imported.name : undefined;
}

function readImport({ source, statement, components }: {
  source: Source;
  statement: Statement;
  components: Map<string, MenuComponent>;
}) {
  const isImport = statement.type === "ImportDeclaration";
  if (!isImport) {
    return false;
  }

  const from = String(statement.source.value);
  const isComponent = from.endsWith(".svelte");
  if (isComponent) {
    throw errorAt({
      source,
      offset: spanOf(statement).start,
      construct: `importing the component ${from}`,
      reason: "the menu lowers to plain code with no Svelte runtime, so a component cannot be part of it"
    });
  }

  const isOtherModule = from !== MENU_COMPONENTS_MODULE;
  if (isOtherModule) {
    return false;
  }

  for (const specifier of statement.specifiers) {
    const imported = importedNameOf(specifier);
    const isMenuName = imported !== undefined && isMenuComponent(imported);
    if (!isMenuName) {
      throw errorAt({
        source,
        offset: spanOf(specifier).start,
        construct: `importing ${source.text.slice(spanOf(specifier).start, spanOf(specifier).end)} from ${from}`,
        reason: `name one of ${Object.values(MenuComponent).join(", ")}`
      });
    }

    components.set(specifier.local.name, imported);
  }

  return true;
}

function objectOf(initial: unknown) {
  let node = initial;
  while (isRecord(node) && typeof node["type"] === "string" && TYPE_WRAPPERS.has(node["type"])) {
    node = node["expression"];
  }

  if (!isRecord(node)) {
    return undefined;
  }

  const isObject = node["type"] === "ObjectExpression";
  return isObject ? node : undefined;
}

function optionsOf({ source, statement }: {
  source: Source;
  statement: Statement;
}) {
  const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : undefined;
  const isVariable = declaration?.type === "VariableDeclaration";
  const [declarator] = isVariable ? declaration.declarations : [];
  const isOptions = declarator?.id.type === "Identifier" && declarator.id.name === OPTIONS_EXPORT;
  if (!isOptions) {
    return undefined;
  }

  const object = objectOf(declarator.init);
  const properties = object?.["properties"];
  if (!Array.isArray(properties)) {
    throw errorAt({
      source,
      offset: spanOf(statement).start,
      construct: `export const ${OPTIONS_EXPORT} that is not an object literal`,
      reason: "the build reads icon, tooltip and guid from the literal without running the file"
    });
  }

  return properties.filter(isRecord).map(property => {
    const { start, end } = property;
    const isPlace = typeof start === "number" && typeof end === "number";
    const isMenu = isPlace && /^menu\s*[:(]/u.test(source.text.slice(start, end));
    if (isMenu) {
      throw errorAt({
        source,
        offset: start,
        construct: "a menu property in the options",
        reason: "the menu is the TrayMenu markup of the file"
      });
    }

    return isPlace ? source.text.slice(start, end) : "";
  });
}

function menuRootOf({ source, fragment, components }: {
  source: Source;
  fragment: AST.Fragment;
  components: ReadonlyMap<string, MenuComponent>;
}) {
  const nodes = fragment.nodes.filter(node => node.type !== "Comment" && !(node.type === "Text" && node.data.trim() === ""));
  const [root, extra] = nodes;
  const isRoot = root?.type === "Component" && components.get(root.name) === MenuComponent.MENU;
  if (!isRoot) {
    throw errorAt({
      source,
      offset: root?.start ?? 0,
      construct: root ? "markup outside the menu" : "a file with no menu",
      reason: "the markup is one <TrayMenu> imported from winui-svelte/tray/menu/svelte"
    });
  }

  if (extra) {
    throw errorAt({
      source,
      offset: extra.start,
      construct: "markup after the <TrayMenu>",
      reason: "the markup is one <TrayMenu>"
    });
  }

  const [attribute] = root.attributes;
  if (attribute) {
    throw errorAt({
      source,
      offset: attribute.start,
      construct: "an attribute on <TrayMenu>",
      reason: "put profile and the other options in `export const options` of <script module>"
    });
  }

  return root;
}

function readScripts({ source, scripts }: {
  source: Source;
  scripts: ReadonlyArray<AST.Script | null>;
}) {
  const components = new Map<string, MenuComponent>();
  const retained: string[] = [];
  let properties: string[] | undefined;
  for (const script of scripts) {
    const rune = script && findRune(script.content);
    if (rune) {
      throw errorAt({
        source,
        offset: rune.start,
        construct: rune.name,
        reason: RUNE_REASON
      });
    }

    for (const statement of script?.content.body ?? []) {
      const isImport = readImport({
        source,
        statement,
        components
      });
      const found = script?.context === "module" ? optionsOf({
        source,
        statement
      }) : undefined;
      properties = found ?? properties;

      const isKept = !isImport && !found;
      if (isKept) {
        const { start, end } = spanOf(statement);
        retained.push(source.text.slice(start, end));
      }
    }
  }

  return {
    components,
    retained,
    properties
  };
}

/**
 * Lowers `entrypoints/tray.svelte` to the TypeScript of an `entrypoints/tray.ts`:
 * the script is kept, the markup of menu components becomes the `menu`
 * function of `defineTray`, and nothing of Svelte's runtime is left.
 *
 * @param options - The text of the file and its path (for messages).
 * @returns The text of the module, with `export default defineTray({ ... })`.
 * @throws {TraySvelteError} For a construct outside the supported subset.
 */
export function lowerTraySvelte({ source: text, file }: {
  source: string;
  file: string;
}) {
  const source: Source = {
    text,
    file
  };
  const ast = parse(text, {
    modern: true,
    filename: file
  });
  if (ast.css) {
    throw errorAt({
      source,
      offset: ast.css.start,
      construct: "<style>",
      reason: "a tray menu is not drawn by Svelte"
    });
  }

  const { components, retained, properties } = readScripts({
    source,
    scripts: [ast.module, ast.instance]
  });
  if (!properties) {
    // noinspection JSUnresolvedReference: the construct text is prose, not code
    throw errorAt({
      source,
      offset: 0,
      construct: `no \`export const ${OPTIONS_EXPORT} = { icon, guid }\` in <script module>`,
      reason: "the tray's icon, tooltip and guid are written there"
    });
  }

  const root = menuRootOf({
    source,
    fragment: ast.fragment,
    components
  });
  const menu = arrayOf({
    context: {
      source: text,
      file,
      components,
      kindName: KIND_NAME
    },
    fragment: root.fragment
  });
  return [
    `import { defineTray, MenuItemKind as ${KIND_NAME} } from "${STANDALONE_MODULE}";`,
    ...retained,
    `export default defineTray({`,
    ...[...properties, `menu: () => ${menu}`].map(property => `  ${property},`),
    `});`,
    ``
  ].join("\n");
}
