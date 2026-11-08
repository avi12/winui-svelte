import { appModeOf, createMenuTheme, MenuColorScheme, PreferredAppMode } from "./menu-theme.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a color scheme maps to the preferred app mode like CSS color-scheme", () => {
  assert.equal(appModeOf(MenuColorScheme.SYSTEM), PreferredAppMode.ALLOW_DARK);
  assert.equal(appModeOf(MenuColorScheme.DARK), PreferredAppMode.FORCE_DARK);
  assert.equal(appModeOf(MenuColorScheme.LIGHT), PreferredAppMode.FORCE_LIGHT);
});

test("the uxtheme ordinals are found and applying every scheme does not throw", () => {
  const theme = createMenuTheme();
  for (const scheme of Object.values(MenuColorScheme)) {
    theme.apply(scheme);
  }

  theme.apply(MenuColorScheme.SYSTEM);
});
