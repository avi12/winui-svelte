import { attachedText, memberText, parseDocumentation, plainText } from "./documentation.ts";
import type { TypeDocumentation } from "./documentation.ts";
import { emitLevel } from "./emit.ts";
import { PropertyKind } from "./tables.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const XML = `<doc><members>
<member name="T:Microsoft.UI.Xaml.Controls.FontIcon">
  <summary>Represents an icon that uses a glyph from the specified font.</summary>
</member>
<member name="P:Microsoft.UI.Xaml.Controls.FontIcon.Glyph">
  <summary>Gets or sets the character code that identifies the icon glyph.</summary>
  <returns>The hexadecimal character code for the icon glyph.</returns>
</member>
<member name="P:Microsoft.UI.Xaml.Controls.FontIcon.IsTextScaleFactorEnabled">
  <summary>Gets or sets whether text is enlarged.</summary>
  <returns>true if text is enlarged; otherwise, false.</returns>
</member>
<member name="E:Microsoft.UI.Xaml.Controls.FontIcon.Loaded">
  <summary>Occurs when <see cref="T:Microsoft.UI.Xaml.FrameworkElement"/> loads &amp; a */ ends.</summary>
</member>
<member name="P:Microsoft.UI.Xaml.Controls.FontIcon.FontSize"></member>
</members></doc>`;

const documentation = parseDocumentation(XML).get("Microsoft.UI.Xaml.Controls.FontIcon");

function levelOf({ properties, documented }: {
  properties: {
    key: string;
    winName: string;
  }[];
  documented: TypeDocumentation | undefined;
}) {
  const hasDocumentation = documented !== undefined;
  return {
    type: {
      namespace: "Microsoft.UI.Xaml.Controls",
      name: "FontIcon"
    },
    tag: "font-icon",
    parent: null,
    isComponent: true,
    contentProperty: null,
    declaresContent: false,
    properties: properties.map(property => ({
      ...property,
      kind: PropertyKind.GLYPH,
      enumType: null,
      isContent: false
    })),
    events: [],
    attached: [],
    bindables: [],
    observed: [],
    slots: [],
    holdsItems: false,
    registers: [],
    folder: "",
    ...hasDocumentation ? { documentation: documented } : {}
  };
}

function fontIcon(properties: {
  key: string;
  winName: string;
}[]) {
  return levelOf({
    properties,
    documented: documentation
  });
}

test("a documented property carries WinUI's summary, then the page of the member", () => {
  const text = emitLevel(
    fontIcon([{
      key: "glyph",
      winName: "Glyph"
    }])
  );
  assert.match(text, /\/\*\*\n \* Represents an icon that uses a glyph from the specified font\.\n/);
  assert.match(
    text,
    /  \/\*\*\n {3}\* Gets or sets the character code that identifies the icon glyph\. The hexadecimal character code for the icon glyph\.\n {3}\*\n {3}\* Accepts an icon glyph: a Fluent name \("Save"\), its code point \(`FluentGlyph\.Save`\), code points to compose, or text\.\n {3}\*\n {3}\* @see https:\/\/learn\.microsoft\.com\/windows\/windows-app-sdk\/api\/winrt\/microsoft\.ui\.xaml\.controls\.fonticon\.glyph\n {3}\*\/\n {2}glyph\?: GlyphInput;/
  );
});

test("a member WinUI does not document has no comment, not an empty one", () => {
  const text = emitLevel(
    fontIcon([{
      key: "fontSize",
      winName: "FontSize"
    }])
  );
  assert.match(text, /\n {2}fontSize\?: GlyphInput;/);
  assert.doesNotMatch(text, /\n {2}\/\*\*\n {3}\*\n/);
  assert.doesNotMatch(text, /\*\/\n {2}fontSize/);
});

test("a level without documentation emits no comment at all", () => {
  const bare = levelOf({
    documented: undefined,
    properties: [{
      key: "glyph",
      winName: "Glyph"
    }]
  });
  assert.doesNotMatch(emitLevel(bare), /@see/);
});

test("an attached property takes its getter's summary as a property's", () => {
  const owner = parseDocumentation(
    `<doc><members>
<member name="M:Microsoft.UI.Xaml.Controls.Canvas.GetLeft(Microsoft.UI.Xaml.UIElement)">
  <summary>Gets the value of the Canvas.Left XAML attached property for the target element.</summary>
</member>
<member name="P:Microsoft.UI.Xaml.Controls.Canvas.TopProperty">
  <summary>Identifies the Canvas.Top XAML attached property.</summary>
</member>
</members></doc>`
  ).get("Microsoft.UI.Xaml.Controls.Canvas");
  assert.equal(
    attachedText({
      documentation: owner,
      name: "Left"
    }),
    "Gets or sets the value of the Canvas.Left XAML attached property for the target element."
  );
  assert.equal(
    attachedText({
      documentation: owner,
      name: "Top"
    }),
    "Gets or sets the Canvas.Top XAML attached property."
  );
  assert.equal(
    attachedText({
      documentation: owner,
      name: "ZIndex"
    }),
    undefined
  );
});

test("an attached prop and the children snippet carry WinUI's text and their own page", () => {
  const text = emitLevel({
    ...fontIcon([]),
    declaresContent: true,
    contentProperty: "Glyph",
    attached: [{
      key: "canvasLeft",
      owner: {
        namespace: "Microsoft.UI.Xaml.Controls",
        name: "Canvas"
      },
      name: "Left",
      setter: "setLeft",
      isSlot: false,
      kind: PropertyKind.NUMBER,
      enumType: null,
      target: "UIElement",
      documentation: "Gets or sets the Canvas.Left XAML attached property."
    }]
  });
  assert.match(text, / {3}\* Gets or sets the Canvas\.Left XAML attached property\.\n {3}\*\n {3}\* @see \S+canvas\.getleft\n {3}\*\/\n {2}canvasLeft\?: /);
  assert.match(text, / {3}\* Gets or sets the character code[^\n]*\n {3}\*\n {3}\* @see \S+fonticon\.glyph\n {3}\*\/\n {2}children\?: Snippet;/);
});

test("an event takes the summary of its WinUI event", () => {
  const text = emitLevel({
    ...fontIcon([]),
    events: [{
      winName: "Loaded",
      key: "onloaded"
    }]
  });
  assert.ok(text.includes(" * Occurs when FrameworkElement loads & a *\\/ ends."));
});

test("the returns sentence is added only when the summary does not already say it", () => {
  assert.equal(
    memberText({
      summary: "Gets or sets whether text is enlarged.",
      returns: "true if text is enlarged; otherwise, false."
    }),
    "Gets or sets whether text is enlarged."
  );
  assert.equal(
    memberText({
      summary: "Gets or sets the code.",
      returns: "The hexadecimal value."
    }), "Gets or sets the code. The hexadecimal value."
  );
});

test("tags, entities and white space become plain text", () => {
  assert.equal(
    plainText("A <c>value</c>\n   of <paramref name=\"size\"/> &lt;1&gt; &#65;."),
    "A `value` of size <1> A."
  );
});
