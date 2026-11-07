const RIGHT_TO_LEFT = new Set(["ar", "ckb", "dv", "fa", "he", "ps", "sd", "ug", "ur", "yi"]);

/**
 * The folder name Chrome gives a locale: `en-US` is `en_US`.
 *
 * @param languageTag - A BCP 47 tag.
 * @returns The `_locales` folder name.
 */
export function folderName(languageTag: string) {
  return languageTag.replaceAll("-", "_");
}

/**
 * The locales to try, most specific first: the exact locale, its language,
 * then the manifest's default locale.
 *
 * @param options - The UI language and the default locale.
 * @returns Locale folder names without repeats.
 */
export function localeChain({ uiLanguage, defaultLocale }: {
  uiLanguage: string;
  defaultLocale: string | undefined;
}) {
  const exact = folderName(uiLanguage);
  const language = exact.split("_")[0] ?? exact;
  const chain = new Set([exact, language]);
  const hasDefault = defaultLocale !== undefined;
  if (hasDefault) {
    chain.add(defaultLocale);
  }

  return [...chain];
}

/**
 * Whether a language is written right to left.
 *
 * @param languageTag - A BCP 47 or folder-style tag.
 * @returns True for Arabic, Hebrew, Persian and the other right-to-left languages.
 */
export function isRightToLeft(languageTag: string) {
  const language = languageTag.split(/[-_]/u)[0] ?? languageTag;
  return RIGHT_TO_LEFT.has(language.toLowerCase());
}
