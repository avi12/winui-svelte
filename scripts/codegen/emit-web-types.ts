import { handWrittenElements } from "./emit-hand-written-web-types.ts";
import {
  displayTypeOf,
  docsUrlOf,
  enumNamesTypeOf,
  inputTypeOf,
  memberDocsUrlOf
} from "./emit.ts";
import { enumSetsOf, enumValuesOf } from "./enum-values.ts";
import { descriptionParagraphsOf } from "./member-description.ts";
import type { AttachedModel, ClassModel } from "./model.ts";
import { ENUMS_MODULE, OFFERED_INPUTS } from "./tables.ts";
import type { TypeReference } from "./tables.ts";
import { webTypesSchema } from "./web-types-schema.ts";
import type { IdeData } from "#scripts/ide/ide-data.ts";
import { readIdeData } from "#scripts/ide/ide-data.ts";
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
    kind?: "expression";
    type: TypeReference | TypeReference[];
  };
  // The enum members the editor completes, beside the `enum` type of the value.
  values?: Array<{
    name: string;
    description?: string;
  }>;
}

type EnumSets = ReadonlyMap<string, IdeData["enums"][number]>;

// The editor completes the members listed in `values` for a value of the `enum` type, and checks
// the value against the exported type that follows it.
const ENUM_TYPE = "enum";

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
function enumContributionOf({ enumNames, sets }: {
  enumNames: string | undefined;
  sets: EnumSets;
}) {
  const isEnum = enumNames !== undefined;
  if (!isEnum) {
    return undefined;
  }

  return {
    type: [ENUM_TYPE, {
      module: ENUMS_MODULE,
      name: enumNames
    }, "number"],
    values: enumValuesOf({
      sets,
      typeName: enumNames
    })
  };
}

function addTypeOf({ attribute, inputType, displayType, enumNames, sets }: {
  attribute: Attribute;
  inputType: string | undefined;
  displayType: string | undefined;
  enumNames: string | undefined;
  sets: EnumSets;
}) {
  const offered = inputType === undefined ? undefined : OFFERED_INPUTS.get(inputType);
  const enumContribution = offered === undefined ? enumContributionOf({
    enumNames,
    sets
  }) : undefined;
  const type = offered ?? enumContribution?.type ?? displayType;
  const isTyped = type !== undefined;
  if (isTyped) {
    attribute.value = valueOf(type);
  }

  const values = enumContribution?.values;
  const hasValues = values !== undefined;
  if (hasValues) {
    attribute.values = values;
  }
}

function attributeOf({ level, key, kind, winName, inputType, displayType, enumNames, sets }: {
  level: ClassModel;
  key: string;
  kind: string;
  winName: string;
  inputType: string | undefined;
  displayType: string | undefined;
  enumNames: string | undefined;
  sets: EnumSets;
}) {
  const text = level.documentation?.members.get(`${kind}:${winName}`);
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

  addTypeOf({
    attribute,
    inputType,
    displayType,
    enumNames,
    sets
  });

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
function attachedAttributeOf({ attached, sets }: {
  attached: AttachedModel;
  sets: EnumSets;
}) {
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

  addTypeOf({
    attribute,
    inputType,
    displayType,
    enumNames: enumNamesTypeOf(attached),
    sets
  });

  return attribute;
}

// A class's own props, attached props and events: a descendant reaches the
// rest through `extends`, so that no ancestor's attributes are written again for each.
function attributesOf({ level, sets }: {
  level: ClassModel;
  sets: EnumSets;
}) {
  return [
    ...level.properties.map(property => attributeOf({
      level,
      key: property.key,
      kind: "P",
      winName: property.winName,
      inputType: inputTypeOf(property),
      displayType: displayTypeOf(property),
      enumNames: enumNamesTypeOf(property),
      sets
    })),
    ...level.attached.filter(attached => !attached.isSlot).map(attached => attachedAttributeOf({
      attached,
      sets
    })),
    ...level.events.map(event => attributeOf({
      level,
      key: event.key,
      kind: "E",
      winName: event.winName,
      inputType: undefined,
      displayType: undefined,
      enumNames: undefined,
      sets
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

// The web event names an `enable...` call wires up (`ondrop`), from the data
// set the editors share. The `{@attach}` helpers are not listed as JavaScript
// symbols: WebStorm reads those as globals, and a global named like a local
// (`const control`) leaves the local reported as unused.
function jsContributionsOf(data: IdeData) {
  return {
    events: data.webEvents.map(event => ({
      name: event.name,
      description: `The web event, written \`on${event.name}\`; call \`${event.enabledBy}()\` from \`${event.module}\` once at start-up`
    }))
  };
}

function elementOf({ level, sets }: {
  level: ClassModel;
  sets: EnumSets;
}) {
  const element: Element = {
    name: level.type.name,
    description: level.documentation?.summary ?? undefined,
    "doc-url": docsUrlOf(level.type),
    attributes: attributesOf({
      level,
      sets
    })
  };
  const { parent } = level;
  const hasParent = parent !== null;
  if (hasParent) {
    element.extends = `/html/elements/${parent.type.name}`;
  }

  return element;
}

/**
 * The web-types file of the components: one element for each class, with its own attributes and the class it extends,
 * and the hand-written components'.
 */
export function emitWebTypes({ classes, version }: {
  classes: ClassModel[];
  version: string;
}) {
  const data = readIdeData();
  const sets = enumSetsOf(data);
  const elements = [...classes.map(level => elementOf({
    level,
    sets
  })), ...handWrittenElements(sets)];
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
      },
      js: jsContributionsOf(data)
    }
  };
  webTypesSchema.parse(webTypes);
  return `${JSON.stringify(webTypes, null, INDENT)}\n`;
}
