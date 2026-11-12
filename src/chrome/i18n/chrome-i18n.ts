import { detectLanguage } from "./detect-language.ts";
import { folderName, isRightToLeft, localeChain } from "./locale-chain.ts";
import { formatMessage } from "./message-format.ts";
import { parseDefaultLocale, parseMessages } from "./messages-schema.ts";
import type { LocaleMessage } from "./messages-schema.ts";
import { resolveIdentity } from "#src/chrome/runtime/identity.js";
import { readFileSync } from "node:fs";
import path from "node:path";

const MAX_SUBSTITUTIONS = 9;
const FALLBACK_LANGUAGE = "en-US";

function readTextIfPresent(file: string) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    const isMissing = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (isMissing) {
      return undefined;
    }

    throw error;
  }
}

function systemLanguage() {
  return new Intl.DateTimeFormat().resolvedOptions().locale || FALLBACK_LANGUAGE;
}

/** What `new ChromeI18n` takes; every part has a real default. */
export interface ChromeI18nOptions {
  /** The app's folder, holding `_locales` and `manifest.json`; the app's root by default. */
  readonly root?: string;

  /** The `_locales` folder; `<root>/_locales` by default. */
  readonly localesFolder?: string;

  /** The manifest's `default_locale`; read from `<root>/manifest.json` when it has one. */
  readonly defaultLocale?: string;

  /** The value of `@@extension_id`; the app's id by default. */
  readonly extensionId?: string;

  /** The UI language as a BCP 47 tag; the system's by default. */
  readonly uiLanguage?: string;

  /** The languages the user reads, most preferred first; the UI language by default. */
  readonly acceptLanguages?: readonly string[];

  /** The text of a file, or undefined when it does not exist; the file system by default (tests). */
  readonly readText?: (file: string) => string | undefined;
}

/**
 * `chrome.i18n` for a native app: `getMessage` is synchronous, reads the
 * standard `_locales/<locale>/messages.json` files, and falls back from the
 * exact locale to its language to the manifest's default locale, message by
 * message. `getMessage` cannot reject; an unknown name gives an empty string,
 * as in Chrome.
 *
 * Nothing runs when this module is imported; the files are read the first time
 * a message is asked for.
 */
export class ChromeI18n {
  /** The UI language as a BCP 47 tag; `navigator.language` is the same. */
  readonly uiLanguage: string;

  /** The user's languages, most preferred first; `navigator.languages` is the same. */
  readonly languages: readonly string[];

  private readonly options: ChromeI18nOptions;
  private readonly readText: (file: string) => string | undefined;
  private readonly catalogs = new Map<string, ReadonlyMap<string, LocaleMessage> | undefined>();
  private rootFolder: string | undefined;
  private chain: readonly string[] | undefined;

  constructor(options: ChromeI18nOptions = {}) {
    this.options = options;
    this.readText = options.readText ?? readTextIfPresent;
    this.uiLanguage = options.uiLanguage ?? systemLanguage();
    this.languages = options.acceptLanguages ?? [this.uiLanguage];
  }

  /**
   * The message of the current locale, filled with the substitutions.
   *
   * @param messageName - A key of `messages.json` or a predefined `@@` name.
   * @param substitutions - Up to nine values for `$1` to `$9`.
   * @returns The text, or an empty string when no locale has the name.
   */
  getMessage(messageName: string, substitutions?: string | readonly string[]) {
    const predefined = this.predefined(messageName.toLowerCase());
    const isPredefined = predefined !== undefined;
    if (isPredefined) {
      return predefined;
    }

    const values = typeof substitutions === "string" ? [substitutions] : substitutions ?? [];
    const hasTooMany = values.length > MAX_SUBSTITUTIONS;
    if (hasTooMany) {
      return "";
    }

    for (const locale of this.localeChain()) {
      const entry = this.catalog(locale)?.get(messageName.toLowerCase());
      const isFound = entry !== undefined;
      if (isFound) {
        return formatMessage({
          entry,
          substitutions: values
        });
      }
    }

    return "";
  }

  /**
   * The UI language of the app.
   *
   * @returns A BCP 47 tag such as `en-US`.
   */
  getUILanguage() {
    return this.uiLanguage;
  }

  /**
   * The languages the user reads.
   *
   * @returns BCP 47 tags, most preferred first.
   */
  getAcceptLanguages() {
    return Promise.resolve([...this.languages]);
  }

  /**
   * Guesses the language of a text from its script.
   *
   * @param text - The text.
   * @returns The languages by share, `und` when the script does not tell.
   */
  detectLanguage(text: string) {
    return Promise.resolve(detectLanguage(text));
  }

  private root() {
    this.rootFolder ??= this.options.root ?? resolveIdentity().root;
    return this.rootFolder;
  }

  private defaultLocale() {
    const isGiven = this.options.defaultLocale !== undefined;
    if (isGiven) {
      return this.options.defaultLocale;
    }

    const manifest = this.readText(path.join(this.root(), "manifest.json"));
    return manifest === undefined ? undefined : parseDefaultLocale(manifest);
  }

  private localeChain() {
    this.chain ??= localeChain({
      uiLanguage: this.uiLanguage,
      defaultLocale: this.defaultLocale()
    });
    return this.chain;
  }

  private catalog(locale: string) {
    const isLoaded = this.catalogs.has(locale);
    if (!isLoaded) {
      const folder = this.options.localesFolder ?? path.join(this.root(), "_locales");
      const text = this.readText(path.join(folder, locale, "messages.json"));
      this.catalogs.set(locale, text === undefined ? undefined : parseMessages(text));
    }

    return this.catalogs.get(locale);
  }

  private predefined(name: string) {
    const isRtl = isRightToLeft(this.uiLanguage);
    const values = new Map([
      ["@@ui_locale", folderName(this.uiLanguage)],
      ["@@bidi_dir", isRtl ? "rtl" : "ltr"],
      ["@@bidi_reversed_dir", isRtl ? "ltr" : "rtl"],
      ["@@bidi_start_edge", isRtl ? "right" : "left"],
      ["@@bidi_end_edge", isRtl ? "left" : "right"]
    ]);
    const isExtensionId = name === "@@extension_id";
    if (isExtensionId) {
      return this.options.extensionId ?? resolveIdentity().id;
    }

    return values.get(name);
  }
}
