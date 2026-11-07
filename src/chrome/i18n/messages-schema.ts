import { z } from "zod";

const placeholderSchema = z.object({
  content: z.string(),
  example: z.string().optional()
}).loose();

const messageSchema = z.object({
  message: z.string(),
  description: z.string().optional(),
  placeholders: z.record(z.string(), placeholderSchema).optional()
}).loose();

const messagesFileSchema = z.record(z.string(), messageSchema);

const manifestLocaleSchema = z.object({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the manifest's own key
  default_locale: z.string().min(1).optional()
}).loose();

/** One entry of a `_locales/<locale>/messages.json`, its names lowercased as Chrome matches them. */
export interface LocaleMessage {
  readonly message: string;
  readonly placeholders: ReadonlyMap<string, string>;
}

/**
 * Reads the text of a `messages.json`.
 *
 * @param text - The file's text.
 * @returns The messages by lowercase name.
 * @throws {Error} When the text is not JSON or not the messages.json shape.
 */
export function parseMessages(text: string) {
  const parsed = messagesFileSchema.parse(JSON.parse(text));
  const messages = new Map<string, LocaleMessage>();
  for (const [name, entry] of Object.entries(parsed)) {
    const placeholders = new Map<string, string>();
    for (const [placeholder, { content }] of Object.entries(entry.placeholders ?? {})) {
      placeholders.set(placeholder.toLowerCase(), content);
    }

    messages.set(name.toLowerCase(), {
      message: entry.message,
      placeholders
    });
  }

  return messages;
}

/**
 * Reads the `default_locale` key of a manifest.
 *
 * @param text - The `manifest.json` text.
 * @returns The locale, or undefined when the manifest has none.
 * @throws {Error} When the text is not JSON.
 */
export function parseDefaultLocale(text: string) {
  return manifestLocaleSchema.parse(JSON.parse(text)).default_locale;
}
