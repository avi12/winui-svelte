/**
 * The commands the extension contributes, as package.json names them.
 */
export const Command = {
  CONVERT_FILE: "winuiSvelte.convertFile",
  CONVERT_SELECTION: "winuiSvelte.convertSelection"
} as const;

/**
 * The language id the extension works in.
 */
export const SVELTE_LANGUAGE = "svelte";

/**
 * The settings the extension reads, as package.json names them.
 */
export const Setting = {
  SECTION: "winuiSvelte",
  DESTINATION: "destination"
} as const;
