import { buildModel, loadMetadata } from "./model.ts";
import { handWrittenComponents, knownGaps, notComponentPatterns, notComponents } from "./not-components.ts";
import { nonConstructible } from "./tables.ts";
import { fullName, TypeAttribute } from "./winmd.ts";

export const Coverage = {
  COMPONENT: "component",
  HAND_WRITTEN: "hand-written",
  ABSTRACT_BASE: "abstract base of components",
  NON_CONSTRUCTIBLE: "non-constructible",
  NOT_COMPONENT: "not a component",
  KNOWN_GAP: "known gap",
  UNCLASSIFIED: "unclassified"
} as const;

const VALUE_BASES = new Set(["ValueType", "MulticastDelegate", "Enum"]);

/** Whether a pattern of the not-a-component table covers a class. */
export function matches({ name, pattern }: {
  name: string;
  pattern: (typeof notComponentPatterns)[number];
}) {
  const isSuffix = pattern.suffix !== undefined && name.endsWith(pattern.suffix);
  const isInNamespace = pattern.namespacePrefix !== undefined && name.startsWith(`${pattern.namespacePrefix}.`);
  return isSuffix || isInNamespace;
}

function reasonFromTables(name: string) {
  const single = notComponents.get(name);
  const isSingle = single !== undefined;
  if (isSingle) {
    return single;
  }

  return notComponentPatterns.find(pattern => matches({
    name,
    pattern
  }))?.reason;
}

function classify({ name, level, excludedReason }: {
  name: string;
  level: ReturnType<typeof buildModel>["classes"][number] | undefined;
  excludedReason: string | undefined;
}) {
  const isComponent = level?.isComponent === true;
  if (isComponent) {
    return {
      coverage: Coverage.COMPONENT,
      reason: ""
    };
  }

  const handWritten = handWrittenComponents.get(name);
  const gap = knownGaps.get(name);
  const reason = reasonFromTables(name);
  const isAbstractBase = level !== undefined;
  const tiers = [
    {
      coverage: Coverage.NON_CONSTRUCTIBLE,
      reason: excludedReason
    },
    {
      coverage: Coverage.HAND_WRITTEN,
      reason: handWritten
    },
    {
      coverage: Coverage.KNOWN_GAP,
      reason: gap
    },
    {
      coverage: Coverage.ABSTRACT_BASE,
      reason: isAbstractBase ? "a level of the component hierarchy that WinUI does not construct" : undefined
    },
    {
      coverage: Coverage.NOT_COMPONENT,
      reason
    }
  ];
  const tier = tiers.find(entry => entry.reason !== undefined);
  return {
    coverage: tier?.coverage ?? Coverage.UNCLASSIFIED,
    reason: tier?.reason ?? ""
  };
}

/**
 * Every class of WinUI's metadata (no interface, struct, enum, delegate or
 * static class) with how the package covers it, sorted by name.
 */
export function inventory(lockPath: string) {
  const model = buildModel(lockPath);
  const { components } = loadMetadata(lockPath);
  const levels = new Map(model.classes.map(level => [fullName(level.type), level]));
  const excluded = new Map(model.excluded.map(entry => [entry.name, entry.reason]));
  const entries = [];
  for (const type of components.types) {
    const isInterface = (type.flags & TypeAttribute.INTERFACE) !== 0;
    const isStatic = (type.flags & TypeAttribute.ABSTRACT) !== 0 && (type.flags & TypeAttribute.SEALED) !== 0;
    const isValue = type.base === null || VALUE_BASES.has(type.base.name);
    const isSkipped = isInterface || isStatic || isValue;
    if (isSkipped) {
      continue;
    }

    const name = fullName(type);
    entries.push({
      name,
      ...classify({
        name,
        level: levels.get(name),
        excludedReason: excluded.get(name) ?? nonConstructible.get(name)
      })
    });
  }

  return entries.sort((left, right) => left.name.localeCompare(right.name));
}
