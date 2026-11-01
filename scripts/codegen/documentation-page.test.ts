import { pageText } from "./documentation-page.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const PROPERTY_PAGE = `---
-api-id: P:Microsoft.UI.Xaml.Controls.TitleBar.Title
-api-type: winrt property
---

# Microsoft.UI.Xaml.Controls.TitleBar.Title

## -description

Gets or sets the title text to display in the title bar.

## -property-value

The title text to display in the title bar. The default is an empty string.

## -remarks

The title is typically used to show the app's display name.
`;

test("a property page is its description and the value it holds", () => {
  assert.equal(
    pageText(PROPERTY_PAGE),
    "Gets or sets the title text to display in the title bar. "
    + "The title text to display in the title bar. The default is an empty string."
  );
});

test("links and cross references keep their words, and only the first paragraph stays", () => {
  const page = `## -description

Occurs after [NewWindowId](tabviewtabtearoutrequestedeventargs_newwindowid.md) is set by <xref:Microsoft.UI.Xaml.Controls.TabView>.

A second paragraph.
`;
  assert.equal(pageText(page), "Occurs after NewWindowId is set by TabView.");
});

test("a page without a description has no text", () => {
  assert.equal(pageText("## -remarks\n\nNothing here.\n"), "");
});
