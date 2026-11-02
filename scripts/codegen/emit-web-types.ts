import {
  displayTypeOf,
  docsUrlOf,
  enumNamesTypeOf,
  inputTypeOf,
  memberDocsUrlOf
} from "./emit.ts";
import { descriptionParagraphsOf } from "./member-description.ts";
import type { ClassModel } from "./model.ts";
import { ENUMS_MODULE, OFFERED_INPUTS } from "./tables.ts";
import type { TypeReference } from "./tables.ts";
import { vscodeCssData } from "#src/css/validate/vscode-data.js";

// The component and prop documentation as WebStorm reads it for a package
// (the `web-types` field of package.json): the editor's own layer shows it
// when the pointer rests on a prop written as an attribute (`glyph=""`), which
// the language server's hover, on a prop written as `{glyph}`, does not cover.

const INDENT = 2;

interface Element {
  name: string;
  description: string | undefined;
  "doc-url": string;
  attributes: Attribute[];
  extends?: string;
}

interface Attribute {
  name: string;
  description?: string;
  "doc-url"?: string;
  value?: {
    type: TypeReference | TypeReference[];
  };
}

function enumReferenceOf(enumNames: string | undefined) {
  const isEnum = enumNames !== undefined;
  return isEnum ? {
    module: ENUMS_MODULE,
    name: enumNames
  } : undefined;
}

function attributeOf({ level, key, kind, winName, inputType, displayType, enumNames }: {
  level: ClassModel;
  key: string;
  kind: string;
  winName: string;
  inputType: string | undefined;
  displayType: string | undefined;
  enumNames: string | undefined;
}) {
  const text = level.documentation?.members.get(`${kind}:${winName}`);
  const hasInputType = inputType !== undefined;
  const description = descriptionParagraphsOf({
    text,
    kind,
    winName,
    inputType,
    displayType
  }).join("\n\n");
  const attribute: Attribute = { name: key };
  const isDescribed = description !== "";
  if (isDescribed) {
    attribute.description = description;
  }

  const type = (hasInputType ? OFFERED_INPUTS.get(inputType) : undefined) ?? enumReferenceOf(enumNames) ?? displayType;
  const isTyped = type !== undefined;
  if (isTyped) {
    attribute.value = { type };
  }

  const isDocumented = text !== undefined;
  if (isDocumented) {
    attribute["doc-url"] = memberDocsUrlOf({
      type: level.type,
      kind,
      name: winName
    });
  }

  return attribute;
}

// A class's own props and events: a descendant reaches the rest through
// `extends`, so that no ancestor's attributes are written again for each.
function attributesOf(level: ClassModel) {
  return [
    ...level.properties.map(property => attributeOf({
      level,
      key: property.key,
      kind: "P",
      winName: property.winName,
      inputType: inputTypeOf(property),
      displayType: displayTypeOf(property),
      enumNames: enumNamesTypeOf(property)
    })),
    ...level.events.map(event => attributeOf({
      level,
      key: event.key,
      kind: "E",
      winName: event.winName,
      inputType: undefined,
      displayType: undefined,
      enumNames: undefined
    }))
  ];
}

// The CSS only WinUI has (`-winui-elevation`) and the values it adds to one
// CSS has (`font-family`): the editor's completion in a `<style>` and a
// `.css` file, from the same data VS Code reads as `vscode-css-data.json`.
function cssPropertiesOf() {
  return vscodeCssData().properties.map(property => ({
    name: property.name,
    description: property.description,
    ...("values" in property && {
      values: property.values
    })
  }));
}

function elementOf(level: ClassModel) {
  const element: Element = {
    name: level.type.name,
    description: level.documentation?.summary ?? undefined,
    "doc-url": docsUrlOf(level.type),
    attributes: attributesOf(level)
  };
  const { parent } = level;
  const hasParent = parent !== null;
  if (hasParent) {
    element.extends = `/html/elements/${parent.type.name}`;
  }

  return element;
}

/**
 * The web-types file of the components: one element for each class, with its own attributes and the class it extends.
 */
export function emitWebTypes({ classes, version }: {
  classes: ClassModel[];
  version: string;
}) {
  const elements = classes.map(elementOf);
  return `${JSON.stringify({
    $schema: "https://json.schemastore.org/web-types",
    name: "winui-svelte",
    version,
    framework: "svelte",
    "description-markup": "markdown",
    contributions: {
      html: {
        elements
      },
      css: {
        properties: cssPropertiesOf()
      }
    }
  }, null, INDENT)}\n`;
}
