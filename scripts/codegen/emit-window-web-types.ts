import { enumValuesOf } from "./enum-values.ts";
import { ENUMS_MODULE } from "./tables.ts";
import type { IdeData } from "#scripts/ide/ide-data.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import typescript from "typescript";

// <Window> is hand-written, so the metadata the generated elements come from
// has nothing about it: its props are the members of WindowProps, read from
// the source with their documentation and, where the type is one of the
// package's closed sets (`Backdrop`), the exported type's name, so that the
// editor offers the values.

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../..");
const PROPS_FILE = path.join(PACKAGE_ROOT, "src", "window", "window-host.svelte.ts");
const PROPS_INTERFACE = "WindowProps";
const API_DOCUMENT = "https://github.com/avi12/winui-svelte/blob/main/API.md#window";
const UNDEFINED_SUFFIX = / \| undefined$/u;
const PRIMITIVES = new Set(["boolean", "number", "string"]);

function sourceOf(file: string) {
  return typescript.createSourceFile(file, readFileSync(file, "utf8"), typescript.ScriptTarget.Latest, true);
}

function propsInterface() {
  for (const statement of sourceOf(PROPS_FILE).statements) {
    const isProps = typescript.isInterfaceDeclaration(statement) && statement.name.text === PROPS_INTERFACE;
    if (isProps) {
      return statement;
    }
  }

  throw new Error(`${PROPS_INTERFACE} is missing from ${PROPS_FILE}`);
}

function descriptionOf(member: typescript.PropertySignature) {
  const comments = typescript.getJSDocCommentsAndTags(member).filter(typescript.isJSDoc);
  const text = comments.map(comment => typescript.getTextOfJSDocComment(comment.comment) ?? "").join("\n\n").trim();
  return text.replaceAll(/\s*\n\s*/gu, " ");
}

function valueOf({ typeText, sets }: {
  typeText: string;
  sets: ReadonlyMap<string, IdeData["enums"][number]>;
}) {
  const bare = typeText.replace(UNDEFINED_SUFFIX, "");
  const isBoolean = bare === "boolean";
  if (isBoolean) {
    return {
      value: {
        kind: "expression" as const,
        type: bare
      }
    };
  }

  if (PRIMITIVES.has(bare)) {
    return {
      value: {
        type: bare
      }
    };
  }

  const isSet = sets.has(bare);
  if (!isSet) {
    return undefined;
  }

  return {
    value: {
      type: ["enum", {
        module: ENUMS_MODULE,
        name: bare
      }]
    },
    values: enumValuesOf({
      sets,
      typeName: bare
    })
  };
}

/**
 * The web-types element of `<Window>`: one attribute for each member of `WindowProps`, with its documentation, and
 * its type where the editor can check it (a boolean, a number, a string or one of the package's closed sets).
 */
export function windowElement(sets: ReadonlyMap<string, IdeData["enums"][number]>) {
  const attributes = propsInterface().members.filter(typescript.isPropertySignature).map(member => {
    const description = descriptionOf(member);
    const contribution = member.type === undefined ? undefined : valueOf({
      typeText: member.type.getText(),
      sets
    });
    return {
      name: member.name.getText(),
      ...description !== "" && {
        description
      },
      ...contribution
    };
  });
  return {
    name: "Window",
    description: "A native window around the component's content, kept in line with its props",
    "doc-url": API_DOCUMENT,
    attributes
  };
}
