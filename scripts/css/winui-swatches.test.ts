import { themeSwatches } from "./winui-swatches.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The slice of generic.xaml's shape that the swatches read: the dictionaries
// are indented eight spaces, the resources twelve.
const XAML = `
        <ResourceDictionary x:Key="Default">
            <Color x:Key="CardBackground">#0DFFFFFF</Color>
            <Color x:Key="Critical">#FF99A4</Color>
            <SolidColorBrush x:Key="CardBackgroundBrush" Color="{StaticResource CardBackground}" />
            <SolidColorBrush x:Key="AccentBrush" Color="{ThemeResource SystemAccentColorLight2}" />
            <SolidColorBrush x:Key="FadedBrush" Color="#FF000000" Opacity="0.5" />
            <StaticResource x:Key="CardAlias" ResourceKey="CardBackgroundBrush" />
        </ResourceDictionary>
        <ResourceDictionary x:Key="HighContrast">
            <Color x:Key="CardBackground">#FF0000</Color>
        </ResourceDictionary>
        <ResourceDictionary x:Key="Light">
            <Color x:Key="CardBackground">#B3FFFFFF</Color>
            <Color x:Key="Critical">#C42B1C</Color>
            <Color x:Key="Clear">Transparent</Color>
            <SolidColorBrush x:Key="CardBackgroundBrush" Color="{StaticResource CardBackground}" />
        </ResourceDictionary>
`;

test("a color reads as CSS in the light and the dark theme", () => {
  const swatches = themeSwatches(XAML);
  assert.deepEqual(swatches.get("CardBackground"), ["#ffffffb3", "#ffffff0d"]);
  assert.deepEqual(swatches.get("Critical"), ["#c42b1c", "#ff99a4"]);
  assert.deepEqual(swatches.get("Clear"), ["transparent", null]);
});

test("a brush and an alias take the color they point at", () => {
  const swatches = themeSwatches(XAML);
  assert.deepEqual(swatches.get("CardBackgroundBrush"), ["#ffffffb3", "#ffffff0d"]);
  assert.deepEqual(swatches.get("CardAlias"), [null, "#ffffff0d"]);
});

test("a color that follows the system, a brush with an opacity and the high contrast theme get no swatch", () => {
  const swatches = themeSwatches(XAML);
  assert.equal(swatches.has("AccentBrush"), false);
  assert.equal(swatches.has("FadedBrush"), false);
  assert.equal(swatches.get("CardBackground")?.includes("#ff0000"), false);
});
