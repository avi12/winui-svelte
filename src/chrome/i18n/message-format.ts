import type { LocaleMessage } from "./messages-schema.ts";

const TOKEN = /\$(?:(\$)|([1-9])|([\w@]+)\$)/gu;
const NUMBERED = /\$([1-9])/gu;

function substitutionAt({ substitutions, digit }: {
  substitutions: readonly string[];
  digit: string;
}) {
  return substitutions[Number(digit) - 1] ?? "";
}

function numbered({ text, substitutions }: {
  text: string;
  substitutions: readonly string[];
}) {
  return text.replace(NUMBERED, (_match, digit: string) => substitutionAt({
    substitutions,
    digit
  }));
}

/**
 * Fills a message the way `chrome.i18n.getMessage` does: `$$` is a dollar
 * sign, `$1` to `$9` the substitutions, and `$NAME$` the content of the
 * message's placeholder of that name (itself filled with the substitutions).
 *
 * @param options - The message and the substitutions.
 * @returns The text.
 */
export function formatMessage({ entry, substitutions }: {
  entry: LocaleMessage;
  substitutions: readonly string[];
}) {
  return entry.message.replace(TOKEN, (
    _match,
    dollar: string | undefined,
    digit: string | undefined,
    name: string | undefined
  ) => {
    const isDollar = dollar !== undefined;
    if (isDollar) {
      return "$";
    }

    const isNumbered = digit !== undefined;
    if (isNumbered) {
      return substitutionAt({
        substitutions,
        digit
      });
    }

    const content = entry.placeholders.get((name ?? "").toLowerCase());
    return numbered({
      text: content ?? "",
      substitutions
    });
  });
}
