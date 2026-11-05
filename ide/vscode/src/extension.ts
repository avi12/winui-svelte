import {
  ColorThemeKind,
  CompletionItem,
  CompletionItemKind,
  Hover,
  MarkdownString,
  Range,
  languages,
  window,
  workspace
} from "vscode";
import type { ExtensionContext, TextDocument } from "vscode";
import { GLYPH_FONT_STYLE, previewMarkdown } from "./glyph-preview.ts";
import { codePointOf, fluentCodePoints, labelOf } from "./glyph-table.ts";
import { glyphValueAt, glyphValues } from "./glyph-values.ts";

const SVELTE = { language: "svelte" };
const ICON_GAP = "0 3px 0 0";
const DARK_FOREGROUND = "#d4d4d4";
const LIGHT_FOREGROUND = "#333333";

function previewColor() {
  const { kind } = window.activeColorTheme;
  const isLight = kind === ColorThemeKind.Light || kind === ColorThemeKind.HighContrastLight;
  return isLight ? LIGHT_FOREGROUND : DARK_FOREGROUND;
}

function previewOf(codePoint: number) {
  const name = [...fluentCodePoints()].find(([, point]) => point === codePoint)?.[0];
  return new MarkdownString(previewMarkdown({
    codePoint,
    name,
    color: previewColor()
  }));
}

async function valuesOf(document: TextDocument) {
  return glyphValues({
    text: document.getText(),
    file: document.uri.fsPath
  });
}

async function valueAt({ document, offset }: {
  document: TextDocument;
  offset: number;
}) {
  return glyphValueAt({
    values: await valuesOf(document),
    offset
  });
}

/**
 * Starts the extension: the icon beside each glyph value, the hover preview and the icon-name completion.
 */
export function activate(context: ExtensionContext) {
  const iconType = window.createTextEditorDecorationType({});

  async function decorate(document: TextDocument) {
    const editor = window.visibleTextEditors.find(visible => visible.document === document);
    if (editor === undefined) {
      return;
    }

    const values = await valuesOf(document);
    editor.setDecorations(iconType, values.flatMap(value => {
      const codePoint = codePointOf(value.value);
      if (codePoint === undefined) {
        return [];
      }

      const position = document.positionAt(value.valueStart);
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
    }));
  }

  function decorateVisible() {
    for (const editor of window.visibleTextEditors) {
      void decorate(editor.document);
    }
  }

  decorateVisible();
  context.subscriptions.push(
    iconType,
    window.onDidChangeVisibleTextEditors(decorateVisible),
    workspace.onDidChangeTextDocument(change => void decorate(change.document)),
    languages.registerHoverProvider(SVELTE, {
      async provideHover(document, position) {
        const value = await valueAt({
          document,
          offset: document.offsetAt(position)
        });
        const codePoint = value === undefined ? undefined : codePointOf(value.value);
        return codePoint === undefined ? undefined : new Hover(previewOf(codePoint));
      }
    }),
    languages.registerCompletionItemProvider(SVELTE, {
      async provideCompletionItems(document, position) {
        const value = await valueAt({
          document,
          offset: document.offsetAt(position)
        });
        if (value === undefined) {
          return [];
        }

        const range = new Range(document.positionAt(value.valueStart), document.positionAt(value.valueEnd));
        return [...fluentCodePoints()].map(([name, codePoint]) => {
          const item = new CompletionItem(name, CompletionItemKind.Value);
          item.detail = labelOf(codePoint);
          item.documentation = previewOf(codePoint);
          item.range = range;
          return item;
        });
      }
    }, "\"", "'")
  );
}
