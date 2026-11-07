const INTL_CONSTRUCTORS = [
  "Collator",
  "DateTimeFormat",
  "ListFormat",
  "NumberFormat",
  "PluralRules",
  "RelativeTimeFormat",
  "Segmenter"
] as const;
const LOCALE_METHODS = [
  [Date.prototype, ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]],
  [Number.prototype, ["toLocaleString"]],
  [BigInt.prototype, ["toLocaleString"]]
] as const;

type Callable = (...args: unknown[]) => unknown;

function isCallable(value: unknown): value is Callable {
  return typeof value === "function";
}

/** The language source `installLanguageDefaults` reads; `ChromeI18n` is one. */
export interface LanguageSource {
  readonly uiLanguage: string;
  readonly languages: readonly string[];
}

function withDefault({ args, languages }: {
  args: readonly unknown[];
  languages: readonly string[];
}) {
  const [locales, ...rest] = args;
  const isGiven = locales !== undefined;
  return isGiven ? [locales, ...rest] : [[...languages], ...rest];
}

function replaceProperty({ owner, name, make }: {
  owner: object;
  name: string;
  make: (original: Callable) => unknown;
}) {
  const descriptor = Object.getOwnPropertyDescriptor(owner, name);
  const original: unknown = descriptor?.value;
  const isReplaceable = descriptor !== undefined && isCallable(original);
  if (!isReplaceable) {
    return () => undefined;
  }

  Object.defineProperty(owner, name, {
    ...descriptor,
    value: make(original)
  });
  return () => Object.defineProperty(owner, name, descriptor);
}

function localizedConstructor({ original, languages }: {
  original: Callable;
  languages: readonly string[];
}) {
  return new Proxy(original, {
    apply: (target, thisArg, args) => target.apply(
      thisArg, withDefault({
        args,
        languages
      })
    ),
    // eslint-disable-next-line no-restricted-syntax -- a Proxy trap forwards a construction only through Reflect
    construct: (target, args) => Reflect.construct(
      target, withDefault({
        args,
        languages
      }), target
    )
  });
}

function localizedMethod({ original, languages }: {
  original: Callable;
  languages: readonly string[];
}) {
  return function localized(this: unknown, ...args: unknown[]) {
    return original.apply(
      this, withDefault({
        args,
        languages
      })
    );
  };
}

function replaceNavigator({ name, value }: {
  name: "language" | "languages";
  value: () => unknown;
}) {
  const previous = Object.getOwnPropertyDescriptor(navigator, name);
  Object.defineProperty(navigator, name, {
    get: value,
    configurable: true,
    enumerable: true
  });
  return () => {
    const isOwn = previous !== undefined;
    if (isOwn) {
      Object.defineProperty(navigator, name, previous);
      return;
    }

    delete navigator[name];
  };
}

/**
 * Makes `navigator.language`, `navigator.languages` and the default locale of
 * `Intl` (its collator, date, number, plural, list, relative time and
 * segmenter formats, and `toLocaleString` and its date and time forms) follow
 * one language source, so a page, `Intl` and `chrome.i18n` agree. A locale
 * a caller passes still wins.
 *
 * @param source - Usually the app's `ChromeI18n`.
 * @returns The function that puts the previous behaviour back.
 */
export function installLanguageDefaults(source: LanguageSource) {
  const languages = Object.freeze([...source.languages]);
  const restores = [
    replaceNavigator({
      name: "language",
      value: () => source.uiLanguage
    }),
    replaceNavigator({
      name: "languages",
      value: () => languages
    })
  ];
  for (const name of INTL_CONSTRUCTORS) {
    restores.push(
      replaceProperty({
        owner: Intl,
        name,
        make: original => localizedConstructor({
          original,
          languages
        })
      })
    );
  }

  for (const [owner, names] of LOCALE_METHODS) {
    for (const name of names) {
      restores.push(
        replaceProperty({
          owner,
          name,
          make: original => localizedMethod({
            original,
            languages
          })
        })
      );
    }
  }

  return () => {
    for (const restore of restores.toReversed()) {
      restore?.();
    }
  };
}
