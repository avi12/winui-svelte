import {
  ColorThemeKind,
  Hover,
  MarkdownString,
  Range,
  languages,
  window,
  workspace
} from "vscode";
import type { ExtensionContext, TextDocument } from "vscode";
import { cssColorOf } from "./css-color.ts";
import { codePointOf, fluentCodePoints } from "./glyph-table.ts";
import { colorMarkdown, fontMarkdown, glyphMarkdown, GLYPH_FONT_STYLE } from "./preview.ts";
import { SpotKind, spotAt, spotsOf } from "./spots.ts";
import type { Spot } from "./spots.ts";

const SVELTE = { language: "svelte" };
const ICON_GAP = "0 3px 0 0";
const SWATCH_SIZE = "0.85em";
const SWATCH_OUTLINE = "1px solid #88888888";
const DARK_FOREGROUND = "#d4d4d4";
const LIGHT_FOREGROUND = "#333333";

function themeForeground() {
  const { kind } = window.activeColorTheme;
  const isLight = kind === ColorThemeKind.Light || kind === ColorThemeKind.HighContrastLight;
  return isLight ? LIGHT_FOREGROUND : DARK_FOREGROUND;
}

function glyphPreview(codePoint: number) {
  const name = [...fluentCodePoints()].find(([, point]) => point === codePoint)?.[0];
  return new MarkdownString(glyphMarkdown({
    codePoint,
    name,
    color: themeForeground()
  }));
}

function previewOf(spot: Spot) {
  if (spot.kind === SpotKind.FONT) {
    return new MarkdownString(fontMarkdown({
      family: spot.text,
      color: themeForeground()
    }));
  }

  if (spot.kind === SpotKind.COLOR) {
    const css = cssColorOf(spot.text);
    return css === undefined ? undefined : new MarkdownString(colorMarkdown(css));
  }

  const codePoint = codePointOf(spot.text);
  return codePoint === undefined ? undefined : glyphPreview(codePoint);
}

async function spotsOfDocument(document: TextDocument) {
  return spotsOf({
    text: document.getText(),
    file: document.uri.fsPath
  });
}

async function spotAtPosition({ document, offset }: {
  document: TextDocument;
  offset: number;
}) {
  return spotAt({
    spots: await spotsOfDocument(document),
    offset
  });
}

function glyphDecoration({ document, spot }: {
  document: TextDocument;
  spot: Spot;
}) {
  const codePoint = codePointOf(spot.text);
  if (codePoint === undefined) {
    return [];
  }

  const position = document.positionAt(spot.start);
  return [{
    range: new Range(position, position),
    renderOptions: {
      before: {
        contentText: String.fromCodePoint(codePoint),
        textDecoration: GLYPH_FONT_STYLE,
        margin: ICON_GAP
      }
    }
  }];
}

function colorDecoration({ document, spot }: {
  document: TextDocument;
  spot: Spot;
}) {
  const css = cssColorOf(spot.text);
  if (css === undefined) {
    return [];
  }

  const position = document.positionAt(spot.start);
  return [{
    range: new Range(position, position),
    renderOptions: {
      before: {
        contentText: " ",
        backgroundColor: css,
        border: SWATCH_OUTLINE,
        width: SWATCH_SIZE,
        height: SWATCH_SIZE,
        margin: ICON_GAP
      }
    }
  }];
}

/**
 * Starts the extension: the icon and color beside their values, the hover previews of glyphs, colors and font
 * families.
 */
export function activate(context: ExtensionContext) {
  const glyphType = window.createTextEditorDecorationType({});
  const colorType = window.createTextEditorDecorationType({});

  async function decorate(document: TextDocument) {
    const editor = window.visibleTextEditors.find(visible => visible.document === document);
    if (editor === undefined) {
      return;
    }

    const spots = await spotsOfDocument(document);
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

  function decorateVisible() {
    for (const editor of window.visibleTextEditors) {
      void decorate(editor.document);
    }
  }

  decorateVisible();
  context.subscriptions.push(
    glyphType,
    colorType,
    window.onDidChangeVisibleTextEditors(decorateVisible),
    workspace.onDidChangeTextDocument(change => void decorate(change.document)),
    languages.registerHoverProvider(SVELTE, {
      async provideHover(document, position) {
        const spot = await spotAtPosition({
          document,
          offset: document.offsetAt(position)
        });
        const preview = spot === undefined ? undefined : previewOf(spot);
        return preview === undefined ? undefined : new Hover(preview);
      }
    })
  );
}
