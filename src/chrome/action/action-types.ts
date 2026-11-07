import { z } from "zod";

const tabIdSchema = z.number().int().optional();

const MAX_CHANNEL = 255;
const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/iu;
const LONG_HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/iu;
const HEX_RADIX = 16;

const channelSchema = z.number().int().min(0).max(MAX_CHANNEL);

function channelOf({ digits, isShort }: {
  digits: string;
  isShort: boolean;
}) {
  return Number.parseInt(isShort ? digits + digits : digits, HEX_RADIX);
}

function colorOfText(text: string) {
  const long = LONG_HEX.exec(text);
  const match = long ?? SHORT_HEX.exec(text);
  const isColor = match !== null;
  if (!isColor) {
    return null;
  }

  const isShort = long === null;
  const [, red = "0", green = "0", blue = "0", alpha = isShort ? "f" : "ff"] = match;
  return [
    channelOf({
      digits: red,
      isShort
    }),
    channelOf({
      digits: green,
      isShort
    }),
    channelOf({
      digits: blue,
      isShort
    }),
    channelOf({
      digits: alpha,
      isShort
    })
  ];
}

/** A color the way `setBadgeBackgroundColor` takes it: four channels, or `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`. */
const colorSchema = z.union([
  z.tuple([channelSchema, channelSchema, channelSchema, channelSchema]),
  z.string().transform((text, context) => {
    const color = colorOfText(text.trim());
    const isColor = color !== null;
    if (!isColor) {
      context.addIssue({
        code: "custom",
        message: `"${text}" is not a hex color`
      });
      return z.NEVER;
    }

    return color;
  }).pipe(z.tuple([channelSchema, channelSchema, channelSchema, channelSchema]))
]);

/** Chrome's `ColorArray`: red, green, blue and alpha, each 0 to 255. */
export type ColorArray = z.output<typeof colorSchema>;

/**
 * Chrome's default badge color.
 *
 * @returns A new color array, red.
 */
export function defaultBadgeColor() {
  return colorSchema.parse("#d90000");
}

export const setTitleSchema = z.object({
  title: z.string(),
  tabId: tabIdSchema
});

export const setBadgeTextSchema = z.object({
  text: z.string().optional(),
  tabId: tabIdSchema
});

export const setBadgeColorSchema = z.object({
  color: colorSchema,
  tabId: tabIdSchema
});

export const tabDetailsSchema = z.object({ tabId: tabIdSchema });

export const setIconSchema = z.object({
  path: z.union([
    z.string(),
    z.object({
      forLightTaskbar: z.string(),
      forDarkTaskbar: z.string()
    })
  ]),
  tabId: tabIdSchema
});

/** What `setTitle` takes; `tabId` is accepted and ignored, there are no tabs. */
export type SetTitleDetails = z.input<typeof setTitleSchema>;

/** What `setBadgeText` takes; no text clears the badge. */
export type SetBadgeTextDetails = z.input<typeof setBadgeTextSchema>;

/** What `setBadgeBackgroundColor` takes. */
export type SetBadgeColorDetails = z.input<typeof setBadgeColorSchema>;

/** What `getTitle`, `getBadgeText` and `getBadgeBackgroundColor` take; the tab is ignored, there are no tabs. */
export type TabDetails = z.input<typeof tabDetailsSchema>;

/**
 * What `setIcon` takes: the path of an icon file, or one for each taskbar
 * theme. Chrome's `imageData` and size maps are not supported.
 */
export type SetIconDetails = z.input<typeof setIconSchema>;
