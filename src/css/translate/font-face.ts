import type { Declaration, FontFaceRule, Severity } from "./types.ts";
import { splitCommas } from "#src/css/parse/split.js";

// `@font-face`: the family name and the font file a style sheet ships. WinUI
// loads a file by the family name inside it, and picks the face (weight,
// style, width) from the file itself, so the other descriptors say nothing it
// can act on.

const FAMILY = "font-family";
const SOURCE = "src";
const IGNORED_SILENTLY: ReadonlySet<string> = new Set(["font-display"]);
const URL_VALUE = /^url\(\s*(?:"([^"]*)"|'([^']*)'|([^"')\s][^)]*?))\s*\)/iu;
const QUOTED_NAME = /^(["'])(.*)\1$/u;
const WEB_SOURCE = /^(?:https?|data|blob):/iu;

/** What reading an `@font-face` found: the rule when it is usable, and what is wrong with it. */
interface FontFaceReading {
  face: FontFaceRule | null;
  problems: {
    severity: Severity;
    message: string;
    at: Declaration["at"];
  }[];
}

function urlOf(entry: string) {
  const [locator = ""] = entry.trim().split(/\s+(?=format\()/iu);
  const match = URL_VALUE.exec(locator.trim());
  return match?.slice(1).find(group => group !== undefined) ?? null;
}

/**
 * Reads the declarations of an `@font-face`.
 *
 * @param options - The declarations, and where the at-rule starts.
 * @returns The family and the first `url()` of `src`, with the problems found.
 */
export function readFontFace({ declarations, at }: {
  declarations: readonly Declaration[];
  at: Declaration["at"];
}) {
  const reading: FontFaceReading = {
    face: null,
    problems: []
  };
  for (const declaration of declarations) {
    const isUnread = ![FAMILY, SOURCE].includes(declaration.property) && !IGNORED_SILENTLY.has(declaration.property);
    if (isUnread) {
      reading.problems.push({
        severity: "warning",
        message: `@font-face ${declaration.property} has no effect: WinUI picks the face from the font file itself`,
        at: declaration.at
      });
    }
  }

  const familyDeclaration = declarations.find(declaration => declaration.property === FAMILY);
  const sourceDeclaration = declarations.find(declaration => declaration.property === SOURCE);
  const isIncomplete = familyDeclaration === undefined || sourceDeclaration === undefined;
  if (isIncomplete) {
    reading.problems.push({
      severity: "error",
      message: "@font-face needs a font-family and a src",
      at
    });
    return reading;
  }

  const family = familyDeclaration.value.trim().replace(QUOTED_NAME, "$2");
  const sources = splitCommas(sourceDeclaration.value).map(urlOf).filter(source => source !== null);
  const [source] = sources;
  const isSourceMissing = source === undefined;
  if (isSourceMissing) {
    reading.problems.push({
      severity: "error",
      message: `@font-face ${family}: src needs a url() of a font file (local() names an installed font, which font-family reaches by its name)`,
      at: sourceDeclaration.at
    });
    return reading;
  }

  const isWebSource = WEB_SOURCE.test(source);
  if (isWebSource) {
    reading.problems.push({
      severity: "error",
      message: `@font-face ${family}: ${source} is not a file; a font is a file next to the app`,
      at: sourceDeclaration.at
    });
    return reading;
  }

  reading.face = {
    family,
    source
  };
  return reading;
}
