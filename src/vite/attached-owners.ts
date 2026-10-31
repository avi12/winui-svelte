import { levels } from "#src/components/generated/metadata.js";

const ATTACHED_OWNERS_RUNTIME = "winui-svelte/attached-owners";
const ATTACHED_OWNERS_BINDING = "winuiPreloadAttachedOwners";

function ownerByProp() {
  const owners = new Map<string, string>();
  for (const level of Object.values(levels)) {
    for (const [prop, [owner]] of Object.entries(level.attached)) {
      owners.set(prop, owner);
    }
  }

  return owners;
}

const owners = ownerByProp();
const PROP_TEXT = new RegExp(String.raw`(?<=[\s{])(?:${[...owners.keys()].join("|")})(?=[\s=/>}:,])`, "gu");

/**
 * Adds to a compiled component the statements that load the attached owners
 * its markup names (`canvasLeft` loads `Canvas`, `gridRow` loads `Grid`)
 * before the component runs, so a control placed by an attached property has
 * its place before WinUI first lays it out. A source that names none is left
 * as it is, and an app that sets none never loads an owner's bindings.
 *
 * @param options - The component's source and what it compiled to, and the
 *   module that exports `preloadAttachedOwners`.
 * @returns The compiled component, with the load appended when it needs one.
 */
export function withAttachedOwners({ source, code, runtime = ATTACHED_OWNERS_RUNTIME }: {
  source: string;
  code: string;
  runtime?: string;
}) {
  const named = new Set<string>();
  for (const [prop] of source.matchAll(PROP_TEXT)) {
    const owner = owners.get(prop);
    const isOwned = owner !== undefined;
    if (isOwned) {
      named.add(owner);
    }
  }

  const isNeeded = named.size > 0;
  if (!isNeeded) {
    return code;
  }

  return `${code}\nimport { preloadAttachedOwners as ${ATTACHED_OWNERS_BINDING} } from ${JSON.stringify(runtime)};\nawait ${ATTACHED_OWNERS_BINDING}(${JSON.stringify([...named])});\n`;
}
