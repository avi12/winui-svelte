import { ElementTheme } from "winui-svelte/enums";

/** The element theme a dark or light switch asks for. */
export function themeOf(isDark: boolean) {
  if (isDark) {
    return ElementTheme.Dark;
  }

  return ElementTheme.Light;
}

/** "on" or "off" for a switch that is on or off. */
export function onOff(isOn: boolean) {
  return isOn ? "on" : "off";
}

/** "holds" or "does not" for a media query that matches or not. */
export function holds(isHolding: boolean) {
  return isHolding ? "holds" : "does not";
}
