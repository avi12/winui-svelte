import {
  displayTypeOf,
  docsUrlOf,
  enumNamesTypeOf,
  inputTypeOf,
  memberDocsUrlOf
} from "./emit.ts";
import { descriptionParagraphsOf } from "./member-description.ts";
import type { AttachedModel, ClassModel } from "./model.ts";
import { ENUMS_MODULE, OFFERED_INPUTS } from "./tables.ts";
import type { TypeReference } from "./tables.ts";
import { vscodeCssData } from "#src/css/validate/vscode-data.js";
import { z } from "zod";

// The component and prop documentation as WebStorm reads it for a package
// (the `web-types` field of package.json): the editor's own layer shows it
// when the pointer rests on a prop written as an attribute (`glyph=""`), which
// the language server's hover, on a prop written as `{glyph}`, does not cover.

const INDENT = 2;

// WebStorm drops the whole file, and every hover with it, when it does not
// follow its schema: the parts this generator writes are checked before it is written.
const typeReferenceSchema = z.union([z.string(), z.strictObject({
  module: z.string(),
  name: z.string()
})]);
const webTypesSchema = z.object({
  contributions: z.object({
    html: z.object({
      elements: z.array(
        z.object({
          name: z.string(),
          attributes: z.array(
            z.object({
              name: z.string(),
              description: z.string().optional(),
              value: z.strictObject({
                kind: z.literal("expression").optional(),
                type: z.union([typeReferenceSchema, z.array(typeReferenceSchema)])
              }).optional()
            })
          )
        })
      )
    }),
    css: z.object({
      properties: z.array(
        z.object({
          name: z.string(),
          values: z.array(z.string()).optional()
        })
      )
    })
  })
});

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
    kind?: "expression";
    type: TypeReference | TypeReference[];
  };
}

// An HTML boolean attribute takes its own name as its value (`disabled="disabled"`), so the
// editor underlined `isEnabled={isOwn}` as "Expected: isEnabled"; a Svelte prop is an expression.
function valueOf(type: TypeReference | TypeReference[]) {
  return type === "boolean" ? {
    kind: "expression" as const,
    type
  } : { type };
}

// An enum prop takes a member's name or its number (`Visibility.Collapsed`),
// so the editor, which checks a value against this type, accepts either.
function enumReferenceOf(enumNames: string | undefined) {
  const isEnum = enumNames !== undefined;
  return isEnum ? [{
    module: ENUMS_MODULE,
    name: enumNames
  }, "number"] : undefined;
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
    attribute.value = valueOf(type);
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

// An attached property a class takes as a prop (`automationId`): WinUI's class
// documents it on the owner's accessor, which the model carries as its text.
function attachedAttributeOf(attached: AttachedModel) {
  const inputType = inputTypeOf(attached);
  const displayType = displayTypeOf(attached);
  const description = descriptionParagraphsOf({
    text: attached.documentation,
    kind: "P",
    winName: attached.name,
    inputType,
    displayType
  }).join("\n\n");
  const attribute: Attribute = { name: attached.key };
  const isDescribed = description !== "";
  if (isDescribed) {
    attribute.description = description;
  }

  const type = (inputType === undefined ? undefined : OFFERED_INPUTS.get(inputType))
    ?? enumReferenceOf(enumNamesTypeOf(attached)) ?? displayType;
  const isTyped = type !== undefined;
  if (isTyped) {
    attribute.value = valueOf(type);
  }

  return attribute;
}

// A class's own props, attached props and events: a descendant reaches the
// rest through `extends`, so that no ancestor's attributes are written again for each.
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
    ...level.attached.filter(attached => !attached.isSlot).map(attachedAttributeOf),
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
      values: property.values.map(value => value.name)
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
  const webTypes = {
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
  };
  webTypesSchema.parse(webTypes);
  return `${JSON.stringify(webTypes, null, INDENT)}\n`;
}
