import type { ExpansionInput, GroupInput, PropertyGroup } from "./property-kit.ts";
import { longhand } from "./shorthands.ts";
import { splitSlash, splitWords } from "#src/css/parse/values.js";
import { registerContainer } from "#src/css/runtime/containers.js";

const TYPE = "container-type";
const NAME = "container-name";
const SHORTHAND = "container";
const CONTAINER_TARGET = "container";
const MAX_SHORTHAND_PARTS = 2;
const CONTAINER_TYPES: ReadonlySet<string> = new Set(["size", "inline-size"]);

/** The members `container-type` and `container-name` are lowered from, and their shorthand. */
export const CONTAINER_MEMBERS = [TYPE, NAME, SHORTHAND];

// `container: name / type`, the type optional.
function expandContainer({ declaration, reader }: ExpansionInput) {
  const [names = "", type] = splitSlash(declaration.value);
  const parts = splitSlash(declaration.value);
  const isReadable = names !== "" && parts.length <= MAX_SHORTHAND_PARTS;
  if (!isReadable) {
    reader.expected("name / type, such as card / inline-size");
    return [];
  }

  const typeDeclarations = type === undefined ? [] : [longhand({
    declaration,
    property: TYPE,
    value: type
  })];
  return [
    longhand({
      declaration,
      property: NAME,
      value: names
    }),
    ...typeDeclarations
  ];
}

// A container is an element with a type: it is registered, with its names, for the
// `@container` rules of the elements under it.
function container(input: GroupInput) {
  const type = input.readers.get(TYPE);
  const names = input.readers.get(NAME);
  const typeWord = type?.single()?.toLowerCase();
  const isContainer = typeWord !== undefined && CONTAINER_TYPES.has(typeWord);
  if (!isContainer) {
    const isUnknown = typeWord !== undefined && typeWord !== "normal";
    if (isUnknown) {
      type?.expected("size, inline-size or normal (a style container query has no WinUI meaning)");
    }

    const isNameAlone = names !== undefined && typeWord === undefined;
    if (isNameAlone) {
      names.warn("container-name does nothing without a container-type");
    }

    return [];
  }

  return [{
    kind: "write",
    target: CONTAINER_TARGET,
    value: splitWords(names?.declaration.value ?? "").join(" ")
  } as const];
}

/** `container-type`, `container-name` and `container`: the element is a container for what it holds. */
export function containerGroups() {
  return [{
    members: [TYPE, NAME],
    lower: container,
    shorthands: new Map([[SHORTHAND, expandContainer]]),
    writes: {
      [CONTAINER_TARGET]: ({ control, value }) => registerContainer({
        control,
        names: value
      })
    }
  } satisfies PropertyGroup];
}
