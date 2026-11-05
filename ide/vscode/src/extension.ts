import { entriesOf } from "./completions.ts";
import { registerConvertCommands } from "./convert-commands.ts";
import { cssColorOf } from "./css-color.ts";
import { codePointOf } from "./glyph-table.ts";
import { SVELTE_LANGUAGE } from "./ids.ts";
import { GLYPH_FONT_STYLE } from "./preview.ts";
import { registerQuickActions } from "./quick-actions.ts";
import { previewOfSpot } from "./spot-preview.ts";
import { spotAt, SpotKind, spotsOf } from "./spots.ts";
import type { Spot } from "./spots.ts";
import {
  ColorThemeKind,
  CompletionItem,
  CompletionItemKind,
  Hover,
  languages,
  MarkdownString,
  Range,
  window,
  workspace
} from "vscode";
import type { ExtensionContext, Position, TextDocument } from "vscode";

const SVELTE = { language: SVELTE_LANGUAGE };
const ICON_GAP = "0 3px 0 0";
const SWATCH_SIZE = "0.85em";
const SWATCH_OUTLINE = "1px solid #88888888";
const DARK_FOREGROUND = "#d4d4d4";
const LIGHT_FOREGROUND = "#333333";
const TRIGGER_CHARACTERS = ["\"", "'", ":", " ", ","];

function themeForeground() {
  const { kind } = window.activeColorTheme;
  const isLight = kind === ColorThemeKind.Light || kind === ColorThemeKind.HighContrastLight;
  return isLight ? LIGHT_FOREGROUND : DARK_FOREGROUND;
}

async function spotAtPosition({ document, position }: {
  document: TextDocument;
  position: Position;
}) {
  return spotAt({
    spots: await spotsOf({
      text: document.getText(),
      file: document.uri.fsPath
    }),
    offset: document.offsetAt(position)
  });
}

function beforeDecoration({ document, spot, before }: {
  document: TextDocument;
  spot: Spot;
  before: object;
}) {
  const position = document.positionAt(spot.start);
  return {
    range: new Range(position, position),
    renderOptions: {
      before
    }
  };
}

function glyphDecoration({ document, spot }: {
  document: TextDocument;
  spot: Spot;
}) {
  const codePoint = codePointOf(spot.text);
  const hasNoCodePoint = codePoint === undefined;
  if (hasNoCodePoint) {
    return [];
  }

  return [beforeDecoration({
    document,
    spot,
    before: {
      contentText: String.fromCodePoint(codePoint),
      textDecoration: GLYPH_FONT_STYLE,
      margin: ICON_GAP
    }
  })];
}

function colorDecoration({ document, spot }: {
  document: TextDocument;
  spot: Spot;
}) {
  const css = cssColorOf(spot.text);
  const hasNoColor = css === undefined;
  if (hasNoColor) {
    return [];
  }

  return [beforeDecoration({
    document,
    spot,
    before: {
      contentText: " ",
      backgroundColor: css,
      border: SWATCH_OUTLINE,
      width: SWATCH_SIZE,
      height: SWATCH_SIZE,
      margin: ICON_GAP
    }
  })];
}

function documentationOf(entry: {
  color: string | undefined;
  markdown: string | undefined;
}) {
  const hasColor = entry.color !== undefined;
  if (hasColor) {
    return entry.color;
  }

  return entry.markdown === undefined ? undefined : new MarkdownString(entry.markdown);
}

async function completionItems({ document, position }: {
  document: TextDocument;
  position: Position;
}) {
  const spot = await spotAtPosition({
    document,
    position
  });
  const hasNoSpot = spot === undefined;
  if (hasNoSpot) {
    return [];
  }

  const range = new Range(document.positionAt(spot.start), document.positionAt(spot.end));
  const entries = await entriesOf({
    spot,
    foreground: themeForeground()
  });
  return entries.map(entry => {
    const isColor = entry.color !== undefined;
    const item = new CompletionItem(entry.label, isColor ? CompletionItemKind.Color : CompletionItemKind.Value);
    item.insertText = entry.insertText;
    item.detail = entry.detail;
    const documentation = documentationOf(entry);
    const hasDocumentation = documentation !== undefined;
    if (hasDocumentation) {
      item.documentation = documentation;
    }

    item.sortText = `0${entry.label}`;
    item.range = range;
    return item;
  });
}
/**
 * Starts the extension: the icon and color beside their values, and for glyphs, colors and font families the
 * hover preview and the completion with the preview beside each option.
 */
export function activate(context: ExtensionContext) {
  const glyphType = window.createTextEditorDecorationType({});
  const colorType = window.createTextEditorDecorationType({});

  async function decorate(document: TextDocument) {
    const editor = window.visibleTextEditors.find(visible => visible.document === document);
    const hasNoEditor = editor === undefined;
    if (hasNoEditor) {
      return;
    }

    const spots = await spotsOf({
      text: document.getText(),
      file: document.uri.fsPath
    });
    editor.setDecorations(
      glyphType,
      spots.filter(spot => spot.kind === SpotKind.GLYPH).flatMap(spot => glyphDecoration({
        document,
        spot
      }))
    );
    editor.setDecorations(
      colorType,
      spots.filter(spot => spot.kind === SpotKind.COLOR).flatMap(spot => colorDecoration({
        document,
        spot
      }))
    );
  }

  function refresh(document: TextDocument) {
    decorate(document).catch(error => window.showErrorMessage(String(error)));
  }

  function refreshVisible() {
    for (const editor of window.visibleTextEditors) {
      refresh(editor.document);
    }
  }

  registerQuickActions(context);
  registerConvertCommands(context);
  refreshVisible();
  context.subscriptions.push(
    glyphType,
    colorType,
    window.onDidChangeVisibleTextEditors(refreshVisible),
    workspace.onDidChangeTextDocument(change => refresh(change.document)),
    languages.registerHoverProvider(SVELTE, {
      async provideHover(document, position) {
        const spot = await spotAtPosition({
          document,
          position
        });
        const markdown = spot === undefined ? undefined : previewOfSpot({
          spot,
          foreground: themeForeground()
        });
        return markdown === undefined ? undefined : new Hover(new MarkdownString(markdown));
      }
    }),
    languages.registerCompletionItemProvider(SVELTE, {
      provideCompletionItems: (document, position) => completionItems({
        document,
        position
      })
    }, ...TRIGGER_CHARACTERS)
  );
}
