import type { OcrBox } from "./text-geometry.ts";
import { sourceBox, unionOf } from "./text-geometry.ts";

// Which engines to try, in which order, who wins, and what the result looks
// like. Pure: the engines are handed in, so a fake one tests all of it.

/** A word the engine found, with its box. */
export interface OcrWord {
  readonly text: string;
  readonly bounds: OcrBox;
}

/** A line of words, in the order Windows returns them (right to left for a right-to-left script). */
export interface OcrLine {
  readonly text: string;
  readonly bounds: OcrBox;
  readonly words: readonly OcrWord[];
}

/** A line as the engine reports it, before it gets a box of its own. */
export interface RawLine {
  readonly text: string;
  readonly words: readonly OcrWord[];
}

/** What `recognizeText` returns: the lines, and the tag of the recognizer language that found them. */
export interface OcrResult {
  readonly lines: readonly OcrLine[];
  readonly language: string;
}

/** The ways to get an engine, tried in order. */
export const OcrCandidateKind = {
  PROFILE: "profile",
  LANGUAGE: "language"
} as const;

/** One engine to try: the user's profile languages, or one recognizer language. */
export type OcrCandidate =
  | { readonly kind: typeof OcrCandidateKind.PROFILE }
  | {
    readonly kind: typeof OcrCandidateKind.LANGUAGE;
    readonly tag: string;
  };

/** An engine, as far as the arbitration needs to know it. */
export interface RecognizingEngine {
  readonly language: string;
  recognize(): Promise<readonly RawLine[]>;
}

/**
 * The engines to try. With languages named: those the machine supports, in
 * the order named, none else. Without: the user's profile languages first,
 * then one per installed recognizer language.
 */
export function candidatesOf({ requested, installed, isSupported }: {
  readonly requested: readonly string[] | undefined;
  readonly installed: readonly string[];
  readonly isSupported: (tag: string) => boolean;
}) {
  const isNamed = requested !== undefined && requested.length > 0;
  const tags = isNamed ? requested.filter(isSupported) : installed;
  const seen = new Set<string>();
  const languages: OcrCandidate[] = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      languages.push({
        kind: OcrCandidateKind.LANGUAGE,
        tag
      });
    }
  }

  return isNamed ? languages : [{ kind: OcrCandidateKind.PROFILE } satisfies OcrCandidate, ...languages];
}

/**
 * Asks the engines in order and returns what the first one that finds a line
 * found; an engine that cannot be made (`undefined`), or whose language was
 * already asked (the profile engine is often one of the installed ones), is
 * skipped.
 */
export async function firstRecognition(engines: Iterable<() => RecognizingEngine | undefined>) {
  const asked = new Set<string>();
  for (const create of engines) {
    const engine = create();
    const isNew = engine !== undefined && !asked.has(engine.language.toLowerCase());
    if (isNew) {
      asked.add(engine.language.toLowerCase());
      const lines = await engine.recognize();
      const hasLines = lines.length > 0;
      if (hasLines) {
        return {
          lines,
          language: engine.language
        };
      }
    }
  }

  return {
    lines: [],
    language: ""
  };
}

/**
 * The lines moved from the bitmap the engine read into the source image's
 * pixels; a line's box is that of its words.
 */
export function linesInSource({ lines, crop, read }: {
  readonly lines: readonly RawLine[];
  readonly crop: OcrBox;
  readonly read: {
    readonly width: number;
    readonly height: number;
  };
}) {
  return lines.map(line => {
    const words = line.words.map(word => ({
      text: word.text,
      bounds: sourceBox({
        box: word.bounds,
        crop,
        read
      })
    }));
    return {
      text: line.text,
      bounds: unionOf(words.map(word => word.bounds)),
      words
    } satisfies OcrLine;
  });
}
