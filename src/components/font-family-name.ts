/**
 * The font families that ship with Windows, offered when a font family is written.
 */
export const FONT_FAMILY_NAMES = [
  "Arial",
  "Bahnschrift",
  "Calibri",
  "Cambria",
  "Cascadia Code",
  "Cascadia Mono",
  "Comic Sans MS",
  "Consolas",
  "Courier New",
  "Ebrima",
  "Franklin Gothic Medium",
  "Gabriola",
  "Georgia",
  "Impact",
  "Lucida Console",
  "Malgun Gothic",
  "Microsoft YaHei UI",
  "Nirmala UI",
  "Palatino Linotype",
  "Segoe Fluent Icons",
  "Segoe MDL2 Assets",
  "Segoe Print",
  "Segoe Script",
  "Segoe UI",
  "Segoe UI Emoji",
  "Segoe UI Symbol",
  "Segoe UI Variable",
  "Sitka",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  "Yu Gothic UI"
] as const;

/**
 * A font family that ships with Windows, offered when a font family is written.
 */
export type FontFamilyName = typeof FONT_FAMILY_NAMES[number];
