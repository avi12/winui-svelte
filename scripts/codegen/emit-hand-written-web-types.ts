import { enumValuesOf } from "./enum-values.ts";
import { ENUMS_MODULE } from "./tables.ts";
import type { IdeData } from "#scripts/ide/ide-data.ts";
import path from "node:path";
import typescript from "typescript";

// The hand-written components (<Window>, <TrayIcon> and the tray menu's
// markup) are not in the metadata the generated elements come from, so their
// props are read from the types the components declare: each property of the
// props type, with its documentation and, where the type is a boolean, a
// number, a string or one of the package's closed sets (`Backdrop`), the type
// the editor can check. A union (<TrayMenuItem>'s command, check and radio)
// offers the properties of all its members.

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../..");
const API_DOCUMENT = "https://github.com/avi12/winui-svelte/blob/main/API.md";
const TRAY_MENU_ANCHOR = "one-tray-menu-for-every-renderer-winui-sveltetraymenu";
const TRAY_EDITOR_ANCHOR = "letting-the-user-customize-the-tray-menu";
const MENU_PROPS_FILE = "src/tray/menu-svelte/menu-props.ts";
const PRIMITIVES = new Set(["boolean", "number", "string"]);
const PRINT_FLAGS = typescript.TypeFormatFlags.NoTruncation
  | typescript.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

interface HandWrittenComponent {
  readonly name: string;
  readonly description: string;
  readonly anchor: string;
  readonly file: string;
  readonly typeName: string;
}

const COMPONENTS: readonly HandWrittenComponent[] = [
  {
    name: "Window",
    description: "A native window around the component's content, kept in line with its props",
    anchor: "window",
    file: "src/window/window-host.svelte.ts",
    typeName: "WindowProps"
  },
  {
    name: "TrayIcon",
    description: "A notification-area icon with its menu: a flyout snippet, a menu model or TrayMenu markup",
    anchor: "system-tray-winui-sveltetray",
    file: "src/tray/tray-icon-props.ts",
    typeName: "TrayIconComponentProps"
  },
  {
    name: "TrayMenu",
    description: "The root of a tray menu written as markup, inside a TrayIcon",
    anchor: TRAY_MENU_ANCHOR,
    file: MENU_PROPS_FILE,
    typeName: "TrayMenuProps"
  },
  {
    name: "TrayMenuItem",
    description: "A command, check or radio line of a tray menu",
    anchor: TRAY_MENU_ANCHOR,
    file: MENU_PROPS_FILE,
    typeName: "TrayMenuItemProps"
  },
  {
    name: "TrayMenuSubmenu",
    description: "A tray menu line that opens the lines written inside it",
    anchor: TRAY_MENU_ANCHOR,
    file: MENU_PROPS_FILE,
    typeName: "TrayMenuSubmenuProps"
  },
  {
    name: "TrayMenuSeparator",
    description: "A line between groups of tray menu items",
    anchor: TRAY_MENU_ANCHOR,
    file: MENU_PROPS_FILE,
    typeName: "TrayMenuSeparatorProps"
  },
  {
    name: "TrayMenuHeader",
    description: "A caption for the tray menu items under it",
    anchor: TRAY_MENU_ANCHOR,
    file: MENU_PROPS_FILE,
    typeName: "TrayMenuHeaderProps"
  },
  {
    name: "TrayMenuEditor",
    description: "A settings control where the user picks how much of the tray menu shows: its level, items and order",
    anchor: TRAY_EDITOR_ANCHOR,
    file: "src/tray/menu-svelte/editor-props.ts",
    typeName: "TrayMenuEditorProps"
  }
];

function createChecker() {
  const files = [...new Set(COMPONENTS.map(component => path.join(PACKAGE_ROOT, component.file)))];
  const program = typescript.createProgram(files, {
    target: typescript.ScriptTarget.ESNext,
    module: typescript.ModuleKind.NodeNext,
    moduleResolution: typescript.ModuleResolutionKind.NodeNext,
    allowImportingTsExtensions: true,
    allowArbitraryExtensions: true,
    exactOptionalPropertyTypes: true,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: ["node"]
  });
  return {
    program,
    checker: program.getTypeChecker()
  };
}

function propsTypeOf({ program, checker, component }: {
  program: typescript.Program;
  checker: typescript.TypeChecker;
  component: HandWrittenComponent;
}) {
  const file = program.getSourceFile(path.join(PACKAGE_ROOT, component.file));
  for (const statement of file?.statements ?? []) {
    const isProps = (typescript.isInterfaceDeclaration(statement) || typescript.isTypeAliasDeclaration(statement))
      && statement.name.text === component.typeName;
    if (isProps) {
      return checker.getTypeAtLocation(statement.name);
    }
  }

  throw new Error(`${component.typeName} is missing from ${component.file}`);
}

function hasDocumentation({ checker, property }: {
  checker: typescript.TypeChecker;
  property: typescript.Symbol;
}) {
  return property.getDocumentationComment(checker).length > 0;
}

function propertiesOf({ checker, type }: {
  checker: typescript.TypeChecker;
  type: typescript.Type;
}) {
  const members = type.isUnion() ? type.types : [type];
  const byName = new Map<string, typescript.Symbol>();
  for (const member of members) {
    for (const property of checker.getPropertiesOfType(member)) {
      const kept = byName.get(property.name);
      const isFirst = kept === undefined;
      const isBetter = !isFirst
        && hasDocumentation({
          checker,
          property
        })
        && !hasDocumentation({
          checker,
          property: kept
        });
      const isKept = isFirst || isBetter;
      if (isKept) {
        byName.set(property.name, property);
      }
    }
  }

  return [...byName.values()];
}

function descriptionOf({ checker, property }: {
  checker: typescript.TypeChecker;
  property: typescript.Symbol;
}) {
  const text = typescript.displayPartsToString(property.getDocumentationComment(checker)).trim();
  return text.replaceAll(/\s*\n\s*/gu, " ");
}

function valueOf({ typeText, sets }: {
  typeText: string;
  sets: ReadonlyMap<string, IdeData["enums"][number]>;
}) {
  const isBoolean = typeText === "boolean";
  if (isBoolean) {
    return {
      value: {
        kind: "expression" as const,
        type: typeText
      }
    };
  }

  if (PRIMITIVES.has(typeText)) {
    return {
      value: {
        type: typeText
      }
    };
  }

  const isSet = sets.has(typeText);
  if (!isSet) {
    return undefined;
  }

  return {
    value: {
      type: ["enum", {
        module: ENUMS_MODULE,
        name: typeText
      }]
    },
    values: enumValuesOf({
      sets,
      typeName: typeText
    })
  };
}

/**
 * The web-types elements of the hand-written components: one attribute for each property of a component's props type,
 * with its documentation, and its type where the editor can check it (a boolean, a number, a string or one of the
 * package's closed sets).
 */
export function handWrittenElements(sets: ReadonlyMap<string, IdeData["enums"][number]>) {
  const { program, checker } = createChecker();
  return COMPONENTS.map(component => {
    const type = propsTypeOf({
      program,
      checker,
      component
    });
    const attributes = propertiesOf({
      checker,
      type
    }).map(property => {
      const description = descriptionOf({
        checker,
        property
      });
      const propertyType = checker.getNonNullableType(checker.getTypeOfSymbol(property));
      const contribution = valueOf({
        typeText: checker.typeToString(propertyType, undefined, PRINT_FLAGS),
        sets
      });
      return {
        name: property.name,
        ...description !== "" && {
          description
        },
        ...contribution
      };
    });
    return {
      name: component.name,
      description: component.description,
      "doc-url": `${API_DOCUMENT}#${component.anchor}`,
      attributes
    };
  });
}
