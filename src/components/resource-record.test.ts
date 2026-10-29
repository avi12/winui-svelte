import { isResourceRecord, resourceParts } from "./resource-record.ts";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const catalogue = loadWinuiCatalogue();

function partsOf(record: Parameters<typeof resourceParts>[0]["record"]) {
  return resourceParts({
    record,
    catalogue
  });
}

test("a color for a key WinUI knows as a brush makes a SolidColorBrush and no Color", () => {
  const { xaml, direct } = partsOf({ ButtonBackground: "#00e5ff" });
  assert.match(xaml ?? "", /<SolidColorBrush x:Key="ButtonBackground" Color="#[0-9A-F]+"\/>/iu);
  assert.doesNotMatch(xaml ?? "", /<Color /u);
  assert.deepEqual(direct, []);
});

test("a key is spelled as WinUI spells it, whatever case it was written in", () => {
  const { xaml } = partsOf({ buttonbackgroundpointerover: "#c42b1c" });
  assert.match(xaml ?? "", /x:Key="ButtonBackgroundPointerOver"/u);
});

test("a color for a key of the app's makes a Color and a Brush of the same name", () => {
  const { xaml } = partsOf({ Accent: "#0af" });
  assert.match(xaml ?? "", /<Color x:Key="Accent">/u);
  assert.match(xaml ?? "", /<SolidColorBrush x:Key="AccentBrush" Color="\{StaticResource Accent\}"\/>/u);
});

test("a number for a Thickness key is one length on every side", () => {
  const { xaml } = partsOf({ ButtonPadding: 12 });
  assert.match(xaml ?? "", /<Thickness x:Key="ButtonPadding">12,12,12,12<\/Thickness>/u);
});

test("a number for a CornerRadius key is a CornerRadius, and for any other a Double", () => {
  const { xaml } = partsOf({
    ControlCornerRadius: 6,
    ControlContentThemeFontSize: 18,
    Spacing: 4
  });
  assert.match(xaml ?? "", /<CornerRadius x:Key="ControlCornerRadius">6<\/CornerRadius>/u);
  assert.match(xaml ?? "", /<x:Double x:Key="ControlContentThemeFontSize">18<\/x:Double>/u);
  assert.match(xaml ?? "", /<x:Double x:Key="Spacing">4<\/x:Double>/u);
});

test("the entries sit in the default theme dictionary", () => {
  const { xaml } = partsOf({ Accent: "#0af" });
  assert.match(xaml ?? "", /<ResourceDictionary\.ThemeDictionaries>\s*<ResourceDictionary x:Key="Default">/u);
});

test("text, a boolean and an object for keys that take them go in as they are", () => {
  const brush = {};
  const { xaml, direct } = partsOf({
    Greeting: "Hello",
    IsCompact: true,
    Highlight: brush,
    ContentControlThemeFontFamily: "Segoe UI"
  });
  assert.equal(xaml, null);
  assert.deepEqual(direct.map(entry => [entry.key, entry.kind]), [
    ["Greeting", undefined],
    ["IsCompact", undefined],
    ["Highlight", undefined],
    ["ContentControlThemeFontFamily", "FontFamily"]
  ]);
  assert.equal(direct[2]?.value, brush);
});

test("a value of another kind than its key's is refused with the key and the kind", () => {
  assert.throws(() => partsOf({ ButtonBackground: "wide" }), /ButtonBackground.*Brush/u);
  assert.throws(() => partsOf({ ButtonPadding: "#fff" }), /ButtonPadding.*Thickness/u);
  assert.throws(() => partsOf({ ButtonBackground: true }), /resources\.ButtonBackground \(a WinUI Brush\): true is not a value this key takes/u);
});

test("a plain object is a record and a WinRT object is not", () => {
  class ResourceDictionaryLike {}
  assert.equal(isResourceRecord({ Accent: "#0af" }), true);
  assert.equal(isResourceRecord(Object.create(null)), true);
  assert.equal(isResourceRecord(new ResourceDictionaryLike()), false);
});
