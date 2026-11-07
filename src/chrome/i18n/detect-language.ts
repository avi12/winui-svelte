const SCRIPT_LANGUAGES = [
  ["Arabic", "ar", /\p{Script=Arabic}/u],
  ["Hebrew", "he", /\p{Script=Hebrew}/u],
  ["Cyrillic", "ru", /\p{Script=Cyrillic}/u],
  ["Greek", "el", /\p{Script=Greek}/u],
  ["Thai", "th", /\p{Script=Thai}/u],
  ["Devanagari", "hi", /\p{Script=Devanagari}/u],
  ["Hangul", "ko", /\p{Script=Hangul}/u],
  ["Hiragana", "ja", /\p{Script=Hiragana}/u],
  ["Katakana", "ja", /\p{Script=Katakana}/u],
  ["Han", "zh", /\p{Script=Han}/u]
] as const;
const LETTER = /\p{L}/u;
const PERCENT = 100;
const UNDETERMINED = "und";

/** What `chrome.i18n.detectLanguage` resolves to. */
export interface DetectedLanguages {
  readonly isReliable: boolean;
  readonly languages: ReadonlyArray<{
    readonly language: string;
    readonly percentage: number;
  }>;
}

/**
 * Guesses the languages of a text from its scripts. Chrome uses a trained
 * model; this one tells scripts apart, so a Latin-script text is `und`.
 *
 * @param text - The text.
 * @returns The languages by share, largest first.
 */
export function detectLanguage(text: string) {
  const counts = new Map<string, number>();
  let total = 0;
  for (const character of text) {
    if (!LETTER.test(character)) {
      continue;
    }

    total += 1;
    const match = SCRIPT_LANGUAGES.find(([, , pattern]) => pattern.test(character));
    const language = match === undefined ? UNDETERMINED : match[1];
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  const languages = [...counts].filter(([language]) => language !== UNDETERMINED).map(([language, count]) => ({
    language,
    percentage: Math.round(count / total * PERCENT)
  })).sort((first, second) => second.percentage - first.percentage);
  const top = languages[0];
  const isUndetermined = top === undefined;
  if (isUndetermined) {
    return {
      isReliable: false,
      languages: [{
        language: UNDETERMINED,
        percentage: PERCENT
      }]
    } satisfies DetectedLanguages;
  }

  return {
    isReliable: top.percentage === PERCENT,
    languages
  } satisfies DetectedLanguages;
}
