import { displayTypeOf, docsUrlOf, inputTypeOf, memberDocsUrlOf } from "./emit.ts";
import { inputDocumentationOf } from "./input-documentation.ts";
import type { ClassModel } from "./model.ts";

// The component and prop documentation as WebStorm reads it for a package
// (the `web-types` field of package.json): the editor's own layer shows it
// when the pointer rests on a prop written as an attribute (`glyph=""`), which
// the language server's hover, on a prop written as `{glyph}`, does not cover.

const INDENT = 2;
const PACKAGE_MODULE = "winui-svelte/components";

// The input types whose names the editor can offer for an attribute, with what else each takes
const OFFERED_INPUTS = new Map<string, TypeReference[]>([
  ["GlyphInput", [
    {
      module: PACKAGE_MODULE,
      name: "FluentGlyphName"
    },
    "string",
    "number",
    "number[]"
  ]],
  ["FontFamilyInput", [
    {
      module: PACKAGE_MODULE,
      name: "FontFamilyName"
    },
    "string"
  ]]
]);

type TypeReference = string | {
  module: string;
  name: string;
};

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

function attributeOf({ level, key, kind, winName, inputType, displayType }: {
  level: ClassModel;
  key: string;
  kind: string;
  winName: string;
  inputType: string | undefined;
  displayType: string | undefined;
}) {
  const text = level.documentation?.members.get(`${kind}:${winName}`);
  const hasInputType = inputType !== undefined;
  const accepts = hasInputType ? inputDocumentationOf(inputType) : undefined;
  const paragraphs = [
    text,
    accepts === undefined ? undefined : `Accepts ${accepts}`,
    displayType === undefined ? undefined : `Type: \`${displayType}\``
  ];
  const description = paragraphs.filter(paragraph => paragraph !== undefined).join("\n\n");
  const attribute: Attribute = { name: key };
  const isDescribed = description !== "";
  if (isDescribed) {
    attribute.description = description;
  }

  const type = (hasInputType ? OFFERED_INPUTS.get(inputType) : undefined) ?? displayType;
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
      displayType: displayTypeOf(property)
    })),
    ...level.events.map(event => attributeOf({
      level,
      key: event.key,
      kind: "E",
      winName: event.winName,
      inputType: undefined,
      displayType: undefined
    }))
  ];
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
      }
    }
  }, null, INDENT)}\n`;
}
