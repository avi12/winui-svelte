import { mappingEntries } from "./conversion-table.ts";
import {
  isHandledProperty,
  materials,
  namedEasings,
  shadowDepths,
  unsupportedReasons,
  winuiTargets
} from "./css-ide-data.ts";
import { Theme } from "./css-media.ts";
import type { MediaEnvironment } from "./css-media.ts";
import { cssPreviewsOf, PreviewFeature } from "./css-previews.ts";
import type { CssPreview } from "./css-previews.ts";
import { Setting, SVELTE_LANGUAGE } from "./ids.ts";
import { isWinuiFile } from "./winui-project.ts";
import {
  EventEmitter,
  Hover,
  InlayHint,
  languages,
  MarkdownString,
  Range,
  Uri,
  window,
  workspace
} from "vscode";
import type { ExtensionContext, Position, TextDocument } from "vscode";

const SVELTE = { language: SVELTE_LANGUAGE };
const INLINE_GAP = "0 3px 0 0";
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 768;
const tables = {
  attributeProperties: new Map(mappingEntries().map(([name, mapping]) => [name, mapping.cssProperty])),
  easings: namedEasings(),
  shadowDepths: shadowDepths(),
  materials: materials(),
  unsupported: unsupportedReasons(),
  targets: winuiTargets(),
  isHandled: isHandledProperty
};

function configuration() {
  return workspace.getConfiguration(Setting.SECTION);
}

function enabledFeatures() {
  const settings = configuration();
  return new Set(Object.values(PreviewFeature).filter(feature => settings.get<boolean>(`${Setting.PREVIEWS}.${feature}`, true)));
}

function assumedEnvironment() {
  const settings = configuration();
  return {
    theme: settings.get<string>(`${Setting.MEDIA}.theme`, Theme.DARK) === Theme.LIGHT ? Theme.LIGHT : Theme.DARK,
    isReducedMotion: settings.get<boolean>(`${Setting.MEDIA}.reducedMotion`, false),
    width: settings.get<number>(`${Setting.MEDIA}.width`, DEFAULT_WIDTH),
    height: settings.get<number>(`${Setting.MEDIA}.height`, DEFAULT_HEIGHT)
  } satisfies MediaEnvironment;
}

const cache = new Map<string, {
  version: number;
  previews: CssPreview[];
}>();

async function previewsOf(document: TextDocument) {
  const key = document.uri.toString();
  const cached = cache.get(key);
  const isFresh = cached?.version === document.version;
  if (isFresh) {
    return cached.previews;
  }

  const isWinui = await isWinuiFile(document.uri.fsPath);
  const previews = isWinui ? cssPreviewsOf({
    text: document.getText(),
    features: enabledFeatures(),
    environment: assumedEnvironment(),
    tables
  }) : [];
  cache.set(key, {
    version: document.version,
    previews
  });
  return previews;
}

function imageUri(svg: string) {
  return Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

async function hover({ document, position }: {
  document: TextDocument;
  position: Position;
}) {
  const offset = document.offsetAt(position);
  const here = (await previewsOf(document)).filter(preview => preview.start <= offset && offset <= preview.end);
  const [first] = here;
  const hasNoFirst = first === undefined;
  if (hasNoFirst) {
    return undefined;
  }

  const markdown = new MarkdownString(here.map(preview => preview.markdown).join("\n\n---\n\n"));
  return new Hover(markdown, new Range(document.positionAt(first.start), document.positionAt(first.end)));
}

async function hints(document: TextDocument) {
  return (await previewsOf(document)).flatMap(preview => {
    const { hint } = preview;
    const hasNoHint = hint === undefined;
    if (hasNoHint) {
      return [];
    }

    const inlay = new InlayHint(document.positionAt(hint.offset), hint.label);
    inlay.paddingLeft = true;
    inlay.tooltip = new MarkdownString(preview.markdown);
    return [inlay];
  });
}

async function decorate({ document, type }: {
  document: TextDocument;
  type: ReturnType<typeof window.createTextEditorDecorationType>;
}) {
  const previews = await previewsOf(document);
  const options = previews.flatMap(preview => {
    const { inline } = preview;
    const hasNoInline = inline === undefined;
    if (hasNoInline) {
      return [];
    }

    const position = document.positionAt(inline.offset);
    return [{
      range: new Range(position, position),
      renderOptions: {
        before: {
          contentIconPath: imageUri(inline.svg),
          margin: INLINE_GAP
        }
      }
    }];
  });
  for (const editor of window.visibleTextEditors.filter(visible => visible.document === document)) {
    editor.setDecorations(type, options);
  }
}

/**
 * The CSS and layout previews: a gradient bar and an easing curve beside their values, the contrast ratio and the
 * `@media` answer as inlay hints, and in the hover the box model, grid tracks, shadow depth, window material and
 * what a declaration becomes in WinUI. Each is a setting, and the `@media` answer reads an assumed environment from
 * the settings, never the OS.
 */
export function registerCssPreviews(context: ExtensionContext) {
  const type = window.createTextEditorDecorationType({});
  const changed = new EventEmitter<void>();
  function refresh(document: TextDocument) {
    decorate({
      document,
      type
    }).catch(error => window.showErrorMessage(String(error)));
  }

  function refreshAll() {
    cache.clear();
    changed.fire();
    for (const editor of window.visibleTextEditors) {
      refresh(editor.document);
    }
  }

  refreshAll();
  context.subscriptions.push(
    type,
    window.onDidChangeVisibleTextEditors(refreshAll),
    workspace.onDidChangeTextDocument(change => refresh(change.document)),
    workspace.onDidChangeConfiguration(event => event.affectsConfiguration(Setting.SECTION) && refreshAll()),
    languages.registerHoverProvider(SVELTE, {
      provideHover: (document, position) => hover({
        document,
        position
      })
    }),
    languages.registerInlayHintsProvider(SVELTE, {
      onDidChangeInlayHints: changed.event,
      provideInlayHints: document => hints(document)
    })
  );
}
