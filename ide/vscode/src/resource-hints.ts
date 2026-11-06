import { Setting, SVELTE_LANGUAGE } from "./ids.ts";
import { resourceMarkdown } from "./preview.ts";
import { referenceAt } from "./resource-reference.ts";
import { resourceOfProperty, winuiResources } from "./resource-table.ts";
import {
  CompletionItem,
  CompletionItemKind,
  Hover,
  languages,
  MarkdownString,
  Range,
  workspace
} from "vscode";
import type { ExtensionContext, Position, TextDocument } from "vscode";

const SVELTE = { language: SVELTE_LANGUAGE };
const TRIGGER_CHARACTERS = ["(", "-"];
const COLOR_KIND = "Color";

function isEnabled() {
  return workspace.getConfiguration(Setting.SECTION).get<boolean>(Setting.RESOURCE_HINTS, true);
}

function referenceAtPosition({ document, position }: {
  document: TextDocument;
  position: Position;
}) {
  return referenceAt({
    text: document.getText(),
    offset: document.offsetAt(position)
  });
}

function completionItems({ document, position }: {
  document: TextDocument;
  position: Position;
}) {
  const reference = isEnabled() ? referenceAtPosition({
    document,
    position
  }) : undefined;
  const hasNoReference = reference === undefined;
  if (hasNoReference) {
    return [];
  }

  const range = new Range(document.positionAt(reference.start), document.positionAt(reference.end));
  return winuiResources().map(resource => {
    const isColor = resource.kind === COLOR_KIND;
    const item = new CompletionItem(resource.property, isColor ? CompletionItemKind.Color : CompletionItemKind.Value);
    item.detail = resource.kind;
    item.documentation = new MarkdownString(resourceMarkdown(resource));
    item.sortText = `1${resource.property}`;
    item.range = range;
    return item;
  });
}

function hover({ document, position }: {
  document: TextDocument;
  position: Position;
}) {
  const reference = isEnabled() ? referenceAtPosition({
    document,
    position
  }) : undefined;
  const resource = reference === undefined ? undefined : resourceOfProperty(reference.property);
  const isWinuiResource = resource !== undefined;
  return isWinuiResource ? new Hover(new MarkdownString(resourceMarkdown(resource))) : undefined;
}

/**
 * Completes and explains the WinUI resource names written as `var(--name)`: the list of names with a light and dark
 * swatch beside each color, and the same swatches in the hover.
 */
export function registerResourceHints(context: ExtensionContext) {
  context.subscriptions.push(
    languages.registerHoverProvider(SVELTE, {
      provideHover: (document, position) => hover({
        document,
        position
      })
    }),
    languages.registerCompletionItemProvider(SVELTE, {
      provideCompletionItems: (document, position) => completionItems({
        document,
        position
      })
    }, ...TRIGGER_CHARACTERS)
  );
}
